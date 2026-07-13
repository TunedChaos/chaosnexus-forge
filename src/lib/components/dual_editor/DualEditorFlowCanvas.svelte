<!-- chaosnexus-forge/src/lib/components/dual_editor/DualEditorFlowCanvas.svelte -->
<script lang="ts">
  import {
    SvelteFlow,
    Background,
    Controls,
    useSvelteFlow,
    useNodes,
    SelectionMode,
  } from "@xyflow/svelte";
  import { untrack } from "svelte";
  import type { CoordinateExtent } from "@xyflow/svelte";
  import type { Node, Edge, Connection } from "@xyflow/svelte";
  import FlowContextMenu, { type GroupMenuOption } from "./FlowContextMenu.svelte";
  import NodePalettePanel from "./NodePalettePanel.svelte";
  import RhaiNode from "../RhaiNode.svelte";
  import CodeNativeNode from "../CodeNativeNode.svelte";
  import VhaiNode from "../VhaiNode.svelte";
  import LiteralNode from "../LiteralNode.svelte";
  import TacticalEdge from "../TacticalEdge.svelte";
  import ExecEdge from "../ExecEdge.svelte";
  import CustomGroupNode from "../CustomGroupNode.svelte";
  import { catalogFlowTypes } from "$lib/dual_editor/catalog_node_factory";
  import type { PaletteItem, FlowPosition } from "$lib/dual_editor/node_palette";
  import { resizeGroupsBottomUp, type Size } from "$lib/dual_editor/group_geometry";
  import {
    isReparentableOnDrag,
    isSelfOrDescendant,
    liftNodesToRootForDrag,
    resolveDropTargetForDrag,
  } from "$lib/dual_editor/group_membership";

  /**
   * Properties for the DualEditorFlowCanvas component.
   */
  interface Props {
    nodes: Node[];
    edges: Edge[];
    svelteFlowColorMode: "light" | "dark" | "system";
    paletteOpen: boolean;
    paletteItems: PaletteItem[];
    onConnect: (connection: Connection) => void;
    onSelectPaletteItem: (item: PaletteItem, position?: FlowPosition) => void;
    onEditNode: (nodeId: string, label: string) => void;
    onUngroupNode: (nodeId: string) => void;
    onDeleteNode: (nodeId: string) => void;
    onDeleteGroup: (groupId: string) => void;
    onRenameGroup: (groupId: string) => void;
    onNodeDragStop: (nodeId: string, dropTargetGroupId: string | null) => void;
    onNodesDragStop: (nodeIds: string[], dropTargetGroupId: string | null) => void;
    onHighlightGroup: (groupId: string | null) => void;
    onAddToGroup: (nodeId: string, groupId: string) => void;
    onPaletteClose: () => void;
    /** Bound by the parent so the toolbar / shortcuts can open the Add Node menu. */
    openAddNodeMenu?: (anchor?: DOMRect) => void;
    /** Exposes measured node sizes to node_actions (DualEditor sits above the provider). */
    getNodeSize?: (id: string) => Size | undefined;
  }

  let {
    nodes = $bindable(),
    edges = $bindable(),
    svelteFlowColorMode,
    paletteOpen,
    paletteItems,
    onConnect,
    onSelectPaletteItem,
    onEditNode,
    onUngroupNode,
    onDeleteNode,
    onDeleteGroup,
    onRenameGroup,
    onNodeDragStop,
    onNodesDragStop,
    onHighlightGroup,
    onAddToGroup,
    onPaletteClose,
    openAddNodeMenu = $bindable(),
    getNodeSize = $bindable(),
  }: Props = $props();

  const { screenToFlowPosition, getInternalNode } = useSvelteFlow();

  getNodeSize = (id: string) => {
    const measured = getInternalNode(id)?.measured;
    if (!measured?.width || !measured?.height) return undefined;
    return { width: measured.width, height: measured.height };
  };

  // The parse pass sizes groups before leaf nodes are measured, so it falls back
  // to DEFAULT_NODE_SIZE and can leave a group too small for its members (the
  // member silently clips until a later drag forces a recompute). Svelte Flow
  // measures nodes over several passes - nested nodes settle later than root
  // ones - so a single "initialized" trigger can capture an intermediate size.
  // Instead we re-run the idempotent snug-fit whenever the *measured* footprint
  // of any leaf node changes, converging on the final size before the user
  // interacts. A measurement signature gates the work so position/selection
  // churn never reruns it, and a box diff gates the commit so it cannot loop or
  // fight the parse pass.
  const flowNodes = useNodes();
  let lastMeasureSig = $state("");
  $effect(() => {
    // Touch the reactive node store so this reruns as measurements stream in.
    const tracked = flowNodes.current;
    untrack(() => {
      const sig = tracked
        .filter((n) => n.type !== "group")
        .map((n) => {
          const s = getNodeSize?.(n.id);
          return `${n.id}:${s ? `${s.width}x${s.height}` : "?"}`;
        })
        .join("|");
      if (!sig || sig === lastMeasureSig) return;
      lastMeasureSig = sig;

      const reflowed = resizeGroupsBottomUp(nodes, (id) => getNodeSize?.(id));
      const shape = (n: Node) =>
        `${n.id}|${typeof n.style === "string" ? n.style : ""}|${n.position.x},${n.position.y}`;
      if (reflowed.some((n, i) => shape(n) !== shape(nodes[i]))) nodes = reflowed;
    });
  });

  /** Wrapper element of the flow canvas, used to derive its on-screen center. */
  let flowContainer = $state<HTMLDivElement | null>(null);

  /** Width of the docked NodePalettePanel (must match its w-[280px] class). */
  const PALETTE_WIDTH = 280;

  /** Lets nested nodes/groups leave their parent bounds mid-drag; cleared on drop. */
  const DRAG_EXTENT: CoordinateExtent = [
    [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
    [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
  ];

  /** Nodes temporarily lifted to root during an active drag (mid-drag lock). */
  let dragLiftedIds = $state<Set<string>>(new Set());

  function expandDragExtent(draggedIds: Set<string>): void {
    nodes = nodes.map((n) =>
      draggedIds.has(n.id) && isReparentableOnDrag(n) ? { ...n, extent: DRAG_EXTENT } : n
    );
  }

  function clearDragExtent(draggedIds: Set<string>): void {
    nodes = nodes.map((n) => (draggedIds.has(n.id) ? { ...n, extent: undefined } : n));
  }

  let dragHighlightTimer = 0;
  /** Last cursor flow position seen during an in-flight node/group drag (drop fallback). */
  let lastDragCursorFlow: FlowPosition | null = null;

  /**
   * Flow-space coordinate at the visual center of the *visible* canvas. When the
   * palette is docked on the right edge it occludes that portion of the canvas,
   * so we shift the center left by half the palette width to keep new nodes from
   * spawning behind it.
   */
  function centerFlowPos(): FlowPosition | undefined {
    if (!flowContainer) return undefined;
    const rect = flowContainer.getBoundingClientRect();
    const visibleWidth = paletteOpen ? rect.width - PALETTE_WIDTH : rect.width;
    return screenToFlowPosition({
      x: rect.left + visibleWidth / 2,
      y: rect.top + rect.height / 2,
    });
  }

  const catalogNodeTypes = Object.fromEntries(
    [...new Set(catalogFlowTypes())].map((t) => [t, VhaiNode])
  );

  const nodeTypes = {
    ...catalogNodeTypes,
    rhaiNode: RhaiNode,
    codeNativeNode: CodeNativeNode,
    branchNode: VhaiNode,
    iteratorNode: VhaiNode,
    literalNode: LiteralNode,
    group: CustomGroupNode,
  };

  const edgeTypes = {
    tacticalEdge: TacticalEdge,
    execEdge: ExecEdge,
  };

  let menuVisible = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  let menuMode = $state<"pane" | "node" | "group">("pane");
  let menuNodeId = $state("");
  let menuNodeLabel = $state("");
  let menuCanUngroup = $state(false);
  let menuAvailableGroups = $state<GroupMenuOption[]>([]);
  let pendingFlowPosition = $state<FlowPosition | undefined>(undefined);

  function readNodeSize(id: string): Size | undefined {
    return getNodeSize?.(id);
  }

  /** Screen client coords from a mouse or touch drag event. */
  function pointerClientXY(event: MouseEvent | TouchEvent): { x: number; y: number } {
    if ("clientX" in event) {
      return { x: event.clientX, y: event.clientY };
    }
    const touch = event.changedTouches[0] ?? event.touches[0];
    return { x: touch.clientX, y: touch.clientY };
  }

  /** Deepest group under the cursor at drop/drag time (flow coordinates). */
  function resolveDropGroup(
    targetNode: Node,
    event: MouseEvent | TouchEvent,
    cursorFlowOverride?: FlowPosition
  ): string | null {
    const cursorFlow =
      cursorFlowOverride ?? screenToFlowPosition(pointerClientXY(event));
    return resolveDropTargetForDrag(targetNode, nodes, cursorFlow, readNodeSize);
  }

  function closeMenu() {
    menuVisible = false;
    pendingFlowPosition = undefined;
    onHighlightGroup(null);
  }

  function dispatchItem(item: PaletteItem) {
    onSelectPaletteItem(item, pendingFlowPosition ?? centerFlowPos());
    pendingFlowPosition = undefined;
  }

  function openCenterMenu(anchor?: DOMRect) {
    if (!flowContainer) return;
    const rect = flowContainer.getBoundingClientRect();
    pendingFlowPosition = centerFlowPos();
    menuMode = "pane";
    if (anchor) {
      menuX = anchor.left;
      menuY = anchor.bottom + 4;
    } else {
      menuX = rect.left + rect.width / 2 - 110;
      menuY = rect.top + 8;
    }
    menuVisible = true;
  }

  openAddNodeMenu = openCenterMenu;

  function buildAvailableGroups(nodeId: string): GroupMenuOption[] {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const current = byId.get(nodeId);
    return nodes
      .filter((n) => n.type === "group")
      .filter((g) => g.id !== current?.parentId)
      .filter((g) => !isSelfOrDescendant(g.id, nodeId, byId))
      .map((g) => ({
        id: g.id,
        label: (g.data as { label?: string }).label || g.id,
      }));
  }

  const onPaneContextMenu = ({ event }: { event: MouseEvent }) => {
    event.preventDefault();
    pendingFlowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    menuMode = "pane";
    menuX = event.clientX;
    menuY = event.clientY;
    menuVisible = true;
  };

  const onNodeContextMenu = ({ event, node }: { event: MouseEvent; node: Node }) => {
    event.preventDefault();
    if (node.type === "group") {
      if (node.id === "main_group") {
        pendingFlowPosition = screenToFlowPosition({ x: event.clientX, y: event.clientY });
        menuMode = "pane";
        menuX = event.clientX;
        menuY = event.clientY;
        menuVisible = true;
        return;
      }
      menuMode = "group";
      menuNodeId = node.id;
      menuNodeLabel = (node.data as { label?: string }).label ?? node.id;
      menuCanUngroup = !!node.parentId;
      menuAvailableGroups = buildAvailableGroups(node.id);
      menuX = event.clientX;
      menuY = event.clientY;
      menuVisible = true;
      return;
    }
    menuMode = "node";
    menuNodeId = node.id;
    menuNodeLabel = (node.data as { label?: string }).label ?? node.id;
    menuCanUngroup = !!(node.parentId && (node.data as { onUngroup?: unknown }).onUngroup);
    menuAvailableGroups = buildAvailableGroups(node.id);
    menuX = event.clientX;
    menuY = event.clientY;
    menuVisible = true;
  };

  const onPaneClick = () => {
    closeMenu();
  };

  /** Re-parentable dragged nodes (drops main_group, which never moves groups). */
  function reparentableDragged(dragged: Node[]): Node[] {
    return dragged.filter((n) => isReparentableOnDrag(n));
  }

  // Both leaf nodes AND (nested) groups route through the same drag path so a
  // group can be dragged into or out of another group exactly like a node. Only
  // the canvas-spanning `main_group` is exempt (see isReparentableOnDrag).
  //
  // MID-DRAG GROUP LOCK: while a drag is in flight we only *highlight* the
  // prospective drop group - we never recompute group geometry. Group sizing and
  // re-parenting happen exclusively on drop (onNodeDragStop -> recomputeGroups).
  // Because groups sit behind the dragged item and are not resized/moved mid-drag,
  // the dragged node can freely travel outside any group's bounds; membership is
  // decided only from where the cursor lands. Body-drag never resizes either:
  // resizing is owned by the selection-only NodeResizer (its own onResizeEnd).
  const handleNodeDragStart = ({
    targetNode,
    nodes: dragged,
  }: {
    targetNode: Node | null;
    nodes: Node[];
  }) => {
    if (!isReparentableOnDrag(targetNode)) return;
    const movers = reparentableDragged(dragged ?? []);
    const ids = movers.map((n) => n.id);
    dragLiftedIds = new Set(ids);
    nodes = liftNodesToRootForDrag(nodes, ids);
    expandDragExtent(dragLiftedIds);
  };

  const handleNodeDrag = ({
    targetNode,
    event,
  }: {
    targetNode: Node | null;
    event: MouseEvent | TouchEvent;
  }) => {
    if (!isReparentableOnDrag(targetNode)) return;
    lastDragCursorFlow = screenToFlowPosition(pointerClientXY(event));
    window.clearTimeout(dragHighlightTimer);
    dragHighlightTimer = window.setTimeout(() => {
      const groupId = resolveDropGroup(targetNode, event, lastDragCursorFlow ?? undefined);
      onHighlightGroup(groupId);
    }, 16);
  };

  const handleNodeDragStop = ({
    targetNode,
    nodes: dragged,
    event,
  }: {
    targetNode: Node | null;
    nodes: Node[];
    event: MouseEvent | TouchEvent;
  }) => {
    window.clearTimeout(dragHighlightTimer);
    onHighlightGroup(null);
    if (!isReparentableOnDrag(targetNode)) return;

    const cursorFlow =
      lastDragCursorFlow ?? screenToFlowPosition(pointerClientXY(event));
    lastDragCursorFlow = null;

    // Resolve the target group once from the cursor; a multi-select drop places
    // every dragged item into it together (or detaches them all when outside).
    const groupId = resolveDropGroup(targetNode, event, cursorFlow);
    const movers = reparentableDragged(dragged ?? []);
    clearDragExtent(new Set(movers.map((n) => n.id)));
    dragLiftedIds = new Set();

    // Clear the transient lift flag before re-parent commits.
    nodes = nodes.map((n) => {
      if (!(n.data as { dragLifted?: boolean }).dragLifted) return n;
      const data = { ...(n.data as Record<string, unknown>) };
      delete data.dragLifted;
      return { ...n, data };
    });

    if (movers.length > 1) {
      onNodesDragStop(
        movers.map((n) => n.id),
        groupId
      );
      return;
    }
    onNodeDragStop(targetNode.id, groupId);
  };
</script>

<div class="flex-1 w-full h-full relative min-h-0" bind:this={flowContainer}>
  <svg class="absolute w-0 h-0 overflow-hidden" aria-hidden="true">
    <defs>
      <marker
        id="exec-arrow"
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--pin-exec)" />
      </marker>
    </defs>
  </svg>
  <SvelteFlow
    bind:nodes
    bind:edges
    onconnect={onConnect}
    onpanecontextmenu={onPaneContextMenu}
    onnodecontextmenu={onNodeContextMenu}
    onpaneclick={onPaneClick}
    onnodedragstart={handleNodeDragStart}
    onnodedrag={handleNodeDrag}
    onnodedragstop={handleNodeDragStop}
    {nodeTypes}
    {edgeTypes}
    colorMode={svelteFlowColorMode}
    proOptions={{ hideAttribution: true }}
    minZoom={0.2}
    maxZoom={2}
    fitView
    fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
    elevateNodesOnSelect={false}
    selectionOnDrag={true}
    panOnDrag={[1]}
    selectionMode={SelectionMode.Partial}
    deleteKey={null}
  >
    <Background />
    <Controls showFitView={false} />
  </SvelteFlow>

  <NodePalettePanel
    open={paletteOpen}
    items={paletteItems}
    onSelectItem={dispatchItem}
    onClose={onPaletteClose}
  />

  <FlowContextMenu
    visible={menuVisible}
    x={menuX}
    y={menuY}
    mode={menuMode}
    {paletteItems}
    nodeLabel={menuNodeLabel}
    canUngroup={menuCanUngroup}
    availableGroups={menuAvailableGroups}
    onSelectItem={dispatchItem}
    onEditNode={() => onEditNode(menuNodeId, menuNodeLabel)}
    onUngroupNode={() => onUngroupNode(menuNodeId)}
    onAddToGroup={(groupId) => onAddToGroup(menuNodeId, groupId)}
    onHighlightGroup={onHighlightGroup}
    onDeleteNode={() => onDeleteNode(menuNodeId)}
    onDeleteGroup={() => onDeleteGroup(menuNodeId)}
    onRenameGroup={() => onRenameGroup(menuNodeId)}
    onClose={closeMenu}
  />
</div>

<style>
  :global(.svelte-flow__pane),
  :global(.svelte-flow__node) {
    cursor: default;
  }

  /* xyflow ships group nodes with 10px padding, a 1px border, and a faint fill.
     CustomGroupNode's body supplies the real group chrome (soft fill + dashed
     accent border) and is sized with w-full/h-full to fill the wrapper exactly.
     Left untouched, the wrapper padding insets that body while its size forces it
     to the full node width/height, so the dashed border overflows the wrapper's
     bottom-right (the "dotted lines outside the box after a resize" bug). Zero the
     padding so the wrapper content box equals its border box; strip the default
     border/fill on normal groups so only the body's dashed border is painted.
     main_group keeps its own primary wrapper border via its Tailwind class. */
  :global(.svelte-flow__node-group) {
    padding: 0;
  }

  :global(.svelte-flow__node-group:not(.main-logic-group)) {
    border: none;
    background: transparent;
  }

  :global(.svelte-flow__pane:active),
  :global(.svelte-flow__pane.dragging),
  :global(.svelte-flow__node:active),
  :global(.svelte-flow__node.dragging) {
    cursor: grabbing;
  }

  /* Visible group resize affordances. The base @xyflow stylesheet supplies the
     directional resize cursors per control; these rules make the corner handles
     and edge lines actually visible against the dark canvas so a user can see
     where to grab to resize a selected group.

     z-index is essential: the group's body div is rendered *after* <NodeResizer>
     in CustomGroupNode and, sharing the node's stacking context with no z-index
     of its own, it paints over the right/bottom edge controls (the "worked for a
     moment then stopped" bug - only the top/left handles were grabbable). Lifting
     the controls above the body restores all eight grab points. This stays inside
     the group's own (low) stacking context, so child nodes still render above the
     group as intended - resizing never has to pass through a child. */
  :global(.svelte-flow__resize-control.cf-group-resize-handle) {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: var(--color-accent, #38bdf8);
    border: 1.5px solid #fff;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.4);
    z-index: 10;
  }

  /* Edge LINE controls default to span the full perimeter (100% width/height),
     which steals drags from the group body. Short centered grips keep resize on
     deliberate grabs while leaving most of each edge draggable. */
  :global(.svelte-flow__resize-control.cf-group-resize-line.top),
  :global(.svelte-flow__resize-control.cf-group-resize-line.bottom) {
    width: 48px;
    left: calc(50% - 24px);
    transform: none;
    height: 0;
    border-color: var(--color-accent, #38bdf8);
    border-width: 2px;
    opacity: 0.6;
    z-index: 10;
  }

  :global(.svelte-flow__resize-control.cf-group-resize-line.left),
  :global(.svelte-flow__resize-control.cf-group-resize-line.right) {
    height: 48px;
    top: calc(50% - 24px);
    transform: none;
    width: 0;
    border-color: var(--color-accent, #38bdf8);
    border-width: 2px;
    opacity: 0.6;
    z-index: 10;
  }
</style>
