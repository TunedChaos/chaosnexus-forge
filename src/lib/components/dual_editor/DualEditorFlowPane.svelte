<!-- chaosnexus-forge/src/lib/components/dual_editor/DualEditorFlowPane.svelte -->
<script lang="ts">
  import { SvelteFlowProvider } from "@xyflow/svelte";
  import type { Node, Edge, Connection } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";
  import VisualToolbar from "../VisualToolbar.svelte";
  import DualEditorFlowCanvas from "./DualEditorFlowCanvas.svelte";
  import { mcp } from "$lib/mcp.svelte";
  import { engineSchema } from "$lib/schema.svelte";
  import {
    buildPaletteItems,
    type PaletteAction,
    type PaletteItem,
    type FlowPosition,
  } from "$lib/dual_editor/node_palette";
  import type { Size } from "$lib/dual_editor/group_geometry";

  /**
   * Component properties for the visual flow pane.
   */
  interface Props {
    nodes: Node[];
    edges: Edge[];
    hasCycles: boolean;
    svelteFlowColorMode: "light" | "dark" | "system";
    onConnect: (connection: Connection) => void;
    onNewGroup: () => void;
    onPaletteAction: (action: PaletteAction, position?: FlowPosition) => void;
    onEditNode: (nodeId: string, label: string) => void;
    onUngroupNode: (nodeId: string) => void;
    onDeleteNode: (nodeId: string) => void;
    onDeleteGroup: (groupId: string) => void;
    onDeleteSelection: () => void;
    onRenameGroup: (groupId: string) => void;
    onNodeDragStop: (nodeId: string, dropTargetGroupId: string | null) => void;
    onNodesDragStop: (nodeIds: string[], dropTargetGroupId: string | null) => void;
    onHighlightGroup: (groupId: string | null) => void;
    onAddToGroup: (nodeId: string, groupId: string) => void;
    onSave: () => void;
    onUndo: () => void;
    onRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;
    getNodeSize?: (id: string) => Size | undefined;
    unboundFunctions: string[];
    nativeFunctions: string[];
    canvasDisplayOnly?: boolean;
  }

  let {
    nodes = $bindable(),
    edges = $bindable(),
    hasCycles,
    svelteFlowColorMode,
    onConnect,
    onNewGroup,
    onPaletteAction,
    onEditNode,
    onUngroupNode,
    onDeleteNode,
    onDeleteGroup,
    onDeleteSelection,
    onRenameGroup,
    onNodeDragStop,
    onNodesDragStop,
    onHighlightGroup,
    onAddToGroup,
    onSave,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    getNodeSize = $bindable(),
    unboundFunctions = [],
    nativeFunctions = [],
    canvasDisplayOnly = false,
  }: Props = $props();

  let paletteOpen = $state(false);
  let openAddNodeMenu = $state<((anchor?: DOMRect) => void) | undefined>(undefined);

  /** Anchors the Add Node menu under the toolbar button (also used for Ctrl+A). */
  function triggerAddNode(anchor?: DOMRect) {
    const rect =
      anchor ?? document.getElementById("vs-add-node-btn")?.getBoundingClientRect() ?? undefined;
    openAddNodeMenu?.(rect);
  }

  let proxyTools = $derived(
    mcp.connections.flatMap((conn) => mcp.paletteTools(conn).map((tool) => ({ conn, tool })))
  );

  let paletteItems = $derived(
    buildPaletteItems({
      unboundFunctions,
      nativeFunctions: nativeFunctions
        .map((name) => engineSchema.byName(name))
        .filter((fn): fn is NonNullable<typeof fn> => !!fn),
      proxyTools,
    })
  );

  function handlePaletteItem(item: PaletteItem, position?: FlowPosition) {
    onPaletteAction(item.action, position);
  }
</script>

<SvelteFlowProvider>
  <div
    class="self-stretch flex-1 min-w-0 min-h-0 flex flex-col relative theme-bg-main overflow-hidden"
  >
    <VisualToolbar
      bind:paletteOpen
      {onNewGroup}
      {onUndo}
      {onRedo}
      {canUndo}
      {canRedo}
      onAddNode={triggerAddNode}
    />

    {#if canvasDisplayOnly}
      <div
        data-testid="canvas-display-only-badge"
        class="bg-amber-950/70 border-b border-amber-800/50 px-4 py-1.5 flex items-center z-10 text-xs text-amber-300 font-mono shrink-0"
      >
        <span>Illustration (read-only): Rhai source is the runtime. This graph shows how the plugin works.</span>
      </div>
    {/if}

    {#if hasCycles}
      <div
        class="bg-red-950/85 border-b border-red-900/60 px-4 py-1.5 flex items-center justify-between z-10 text-xs text-red-400 font-mono font-bold animate-pulse shrink-0"
      >
        <span
          >⚠ CYCLE DETECTED: Loop-free execution compromised! Resolve dashed wires to prevent
          infinite execution cycles.</span
        >
      </div>
    {/if}

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      data-testid="visual-canvas-surface"
      class="flex-1 w-full h-full relative focus:outline-none min-h-0"
      tabindex="-1"
      onkeydown={(e) => {
        // Never hijack keys while the user is editing text (e.g. a group's inline
        // rename input): let Backspace/Ctrl+A act on the field, not the canvas.
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.isContentEditable ||
            target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA")
        ) {
          return;
        }

        if (e.ctrlKey || e.metaKey) {
          const key = e.key.toLowerCase();
          if (key === "a") {
            // Open the Add Node menu instead of the browser's select-all.
            e.preventDefault();
            triggerAddNode();
          } else if (key === "s") {
            // Save the active file (and its canvas sidecar) from the canvas, the
            // same as Ctrl+S in the Monaco code pane.
            e.preventDefault();
            onSave();
          } else if (key === "z") {
            // Unified editor undo/redo: covers code edits AND layout operations
            // (move/group/resize/delete), not just the Monaco text buffer.
            e.preventDefault();
            if (e.shiftKey) onRedo();
            else onUndo();
          } else if (key === "y") {
            e.preventDefault();
            onRedo();
          }
        } else if (e.key === "Delete" || e.key === "Backspace") {
          // Delete the current selection. xyflow's built-in delete is disabled
          // (deleteKey={null}) so this path owns deletion: leaf nodes and
          // empty groups go immediately, non-empty groups confirm via modal, and
          // Main Logic is always spared (handled upstream in requestDelete).
          e.preventDefault();
          onDeleteSelection();
        }
      }}
    >
      <DualEditorFlowCanvas
        bind:nodes
        bind:edges
        bind:openAddNodeMenu
        bind:getNodeSize
        {svelteFlowColorMode}
        {paletteOpen}
        {paletteItems}
        onConnect={onConnect}
        onSelectPaletteItem={handlePaletteItem}
        {onEditNode}
        {onUngroupNode}
        {onDeleteNode}
        {onDeleteGroup}
        {onRenameGroup}
        {onNodeDragStop}
        {onNodesDragStop}
        {onHighlightGroup}
        {onAddToGroup}
        onPaletteClose={() => (paletteOpen = false)}
      />
    </div>
  </div>
</SvelteFlowProvider>
