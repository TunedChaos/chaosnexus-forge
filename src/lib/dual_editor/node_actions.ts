// chaosnexus-forge/src/lib/dual_editor/node_actions.ts
//
// Node/edge mutation handlers for the visual scripting canvas, extracted from
// DualEditor.svelte to keep that component under the project file-size budget.
//
// Svelte 5 runes can only live inside `.svelte` modules, so this factory takes a
// context of accessor/mutator closures over the editor's reactive `$state`
// (`nodes`, `edges`, the Monaco instance, ...). The returned handlers are plain
// functions that read/write through those closures, preserving reactivity while
// moving the bulk of the logic out of the component.
//
// There is intentionally no parse/serialize "visual change" guard: the parse
// pass is idempotent and gated by a structural diff, so it reaches a fixed point
// and the sidecar write for every mutation is always allowed to persist. The old
// microtask-timed guard could non-deterministically drop a write (the source of
// the "add/remove/drag oddities").

import type { Node, Edge } from "@xyflow/svelte";
import { workbench } from "$lib/state.svelte";
import { engineSchema } from "$lib/schema.svelte";
import { buildProxyNodeSnippet } from "$lib/dual_editor/mcp_codegen";
import { buildNativeNodeSnippet } from "$lib/dual_editor/native_codegen";
import {
  createAssemblyNode,
  createControlNode,
  createLiteralNode,
  type LiteralValueType,
} from "$lib/assembly_flow";
import { removeNodeAnchor, Z_GROUP, Z_NODE_BASE, buildCanvasMetadata } from "$lib/parser";
import {
  computeGroupBounds,
  emptyGroupFloor,
  formatGroupStyle,
  resizeGroupsBottomUp,
  type Size,
} from "$lib/dual_editor/group_geometry";
import {
  absolutePosition,
  isSelfOrDescendant,
  collectGroupDescendants,
  rebaseToParent,
  restackGroups,
} from "$lib/dual_editor/group_membership";
import { wouldCreateCycle } from "$lib/cycle_detector";
import type { FnSignature, GraphNode, GraphWire } from "$lib/graph";
import { detectExecCycle, validatePinConnection } from "$lib/graph";
import type { McpConnection, McpToolSchema } from "$lib/mcp.svelte";
import type { PaletteAction, FlowPosition } from "$lib/dual_editor/node_palette";
import { createCatalogNodeByKind } from "$lib/dual_editor/catalog_node_factory";
import { importRhaiManifestToGraph } from "$lib/dual_editor/rhai_import";
import { resolveConnectionWireKind } from "$lib/dual_editor/node_catalog";

/** Reactive accessors/mutators the handlers operate through (owned by DualEditor). */
export interface NodeActionsContext {
  getNodes: () => Node[];
  setNodes: (nodes: Node[]) => void;
  getEdges: () => Edge[];
  setEdges: (edges: Edge[]) => void;
  getActiveContent: () => string;
  getActiveManifest: () => FnSignature[];
  getMonaco: () => { setValue: (value: string) => void } | null;
  /** Positions queued for code-appended nodes until the parse pass materializes them. */
  pendingNodePositions: Map<string, FlowPosition>;
  /** Opens the macro settings drawer for a node (drawer state stays in DualEditor). */
  onOpenSettings: (nodeId: string, label: string) => void;
  /** Real measured size of a node (backed by `getInternalNode().measured`). */
  getNodeSize: (id: string) => Size | undefined;
}

/** The handler surface returned to DualEditor for wiring into the canvas. */
export interface NodeActions {
  resolveNodePlacement: (position?: FlowPosition) => { position: FlowPosition; parentId?: string };
  handleConnect: (connection: {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }) => void;
  handleAddNode: (label?: string, position?: FlowPosition) => void;
  handleAddAssemblyFn: (fnName: string, position?: FlowPosition) => void;
  handleAddControlNode: (kind: "branch" | "iterator", position?: FlowPosition) => void;
  handleAddProxyNode: (
    connection: McpConnection,
    tool: McpToolSchema,
    position?: FlowPosition
  ) => void;
  handleAddNativeFn: (fnName: string, position?: FlowPosition) => void;
  handleAddLiteral: (valueType: string, position?: FlowPosition) => void;
  handleNewGroup: () => void;
  handleUngroupNode: (nodeId: string) => void;
  handleNodeDragStop: (nodeId: string, dropTargetGroupId: string | null) => void;
  handleNodesDragStop: (nodeIds: string[], dropTargetGroupId: string | null) => void;
  handleAddToGroup: (nodeId: string, groupId: string) => void;
  handleGroupResize: (groupId: string) => void;
  setGroupHighlight: (groupId: string | null) => void;
  handlePaletteAction: (action: PaletteAction, position?: FlowPosition) => void;
  handleDeleteNode: (nodeId: string) => void;
  handleDeleteGroup: (groupId: string) => void;
  handleDeleteSelection: (ids: string[]) => void;
}

/**
 * Builds the canvas node/edge handlers bound to the editor's reactive context.
 *
 * @param ctx Accessors/mutators over DualEditor's reactive state.
 * @returns The handler surface consumed by the flow pane and palette.
 */
export function createNodeActions(ctx: NodeActionsContext): NodeActions {
  /** Resize groups bottom-up, restack z-order, and commit the new nodes. */
  function recomputeGroups(next: Node[]): void {
    const sized = resizeGroupsBottomUp(next, ctx.getNodeSize);
    ctx.setNodes(restackGroups(sized));
  }

  /**
   * Drops the manual-size override on the named groups so they re-snug to their
   * (changed) contents. Membership changes - a member entering or leaving - reset
   * a group's user resize per the product rule: manual size persists across
   * reloads but yields to auto-fit whenever the contents change.
   */
  function clearManualSizeFor(nodes: Node[], groupIds: Set<string>): Node[] {
    if (groupIds.size === 0) return nodes;
    return nodes.map((n) => {
      if (n.type !== "group" || !groupIds.has(n.id)) return n;
      const data = n.data as Record<string, unknown>;
      if (data.manualWidth === undefined && data.manualHeight === undefined) return n;
      const cleared = { ...data };
      delete cleared.manualWidth;
      delete cleared.manualHeight;
      return { ...n, data: cleared };
    });
  }

  /** Re-parents a node (or detaches when `groupId` is null) and recomputes groups. */
  function moveNodeToGroup(nodeId: string, groupId: string | null): void {
    if (nodeId === "main_group") return;

    const nodes = ctx.getNodes();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const node = byId.get(nodeId);
    if (!node) return;

    if (groupId && isSelfOrDescendant(groupId, nodeId, byId)) return;

    const absPos = absolutePosition(node, byId);
    const currentParent = node.parentId ?? null;
    if (currentParent === groupId) {
      recomputeGroups(nodes);
      return;
    }

    const newPos = rebaseToParent(absPos, groupId ?? undefined, byId);
    const next = nodes.map((n) => {
      if (n.id !== nodeId) return n;
      return {
        ...n,
        parentId: groupId ?? undefined,
        extent: undefined,
        position: newPos,
        data: {
          ...(n.data as Record<string, unknown>),
          parentId: groupId ?? undefined,
        },
      };
    });

    // Old parent lost a member and new parent gained one: both re-snug.
    const affected = new Set<string>();
    if (currentParent) affected.add(currentParent);
    if (groupId) affected.add(groupId);
    recomputeGroups(clearManualSizeFor(next, affected));
  }

  /**
   * Batch re-parents several nodes to the same target group (or detaches all when
   * `groupId` is null), then recomputes once. Used for multi-select drag-drop so a
   * whole selection joins (or leaves) a group together. Each node's absolute
   * position is preserved and rebased to the new parent; nodes that would nest
   * into themselves or a descendant are skipped. Every old parent and the target
   * group re-snug (manual size cleared) since their membership changed.
   */
  function moveNodesToGroup(nodeIds: string[], groupId: string | null): void {
    const nodes = ctx.getNodes();
    const byId = new Map(nodes.map((n) => [n.id, n]));

    // Resolve which moves are valid up front against the original positions so
    // each rebase is independent of the others (the target parent is not moving).
    const moves = new Map<string, { x: number; y: number }>();
    const affected = new Set<string>();
    for (const nodeId of nodeIds) {
      if (nodeId === "main_group") continue;
      const node = byId.get(nodeId);
      if (!node) continue;
      if (groupId && isSelfOrDescendant(groupId, nodeId, byId)) continue;
      const currentParent = node.parentId ?? null;
      if (currentParent === groupId) continue;
      moves.set(nodeId, rebaseToParent(absolutePosition(node, byId), groupId ?? undefined, byId));
      if (currentParent) affected.add(currentParent);
    }
    if (moves.size === 0) {
      recomputeGroups(nodes);
      return;
    }
    if (groupId) affected.add(groupId);

    const next = nodes.map((n) => {
      const pos = moves.get(n.id);
      if (!pos) return n;
      return {
        ...n,
        parentId: groupId ?? undefined,
        extent: undefined,
        position: pos,
        data: {
          ...(n.data as Record<string, unknown>),
          parentId: groupId ?? undefined,
        },
      };
    });

    recomputeGroups(clearManualSizeFor(next, affected));
  }

  /**
   * Returns a z-index that lands a freshly added leaf node on top of every
   * existing node while still sitting above all groups (Main Logic stays at the
   * very back). Mirrors the parser's banding so optimistic adds match re-parses.
   */
  function nextNodeZIndex(): number {
    const maxZ = ctx
      .getNodes()
      .reduce((max, n) => Math.max(max, n.zIndex ?? 0), Z_NODE_BASE - 1);
    return maxZ + 1;
  }

  function defaultNodePlacement(): FlowPosition {
    const nodes = ctx.getNodes();
    const parentId = nodes.some((n) => n.id === "main_group") ? "main_group" : undefined;
    const yBase = nodes.filter((n) => n.parentId === parentId).length * 120 + 100;
    return { x: 120, y: yBase };
  }

  /** Converts an absolute flow position into parent-relative coords when grouped. */
  function resolveNodePlacement(position?: FlowPosition): {
    position: FlowPosition;
    parentId?: string;
  } {
    const nodes = ctx.getNodes();
    const parentId = nodes.some((n) => n.id === "main_group") ? "main_group" : undefined;
    let resolved = position ?? defaultNodePlacement();
    if (parentId && position) {
      const group = nodes.find((n) => n.id === parentId);
      if (group) {
        resolved = { x: position.x - group.position.x, y: position.y - group.position.y };
      }
    }
    return { position: resolved, parentId };
  }

  function handleConnect(connection: {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }): void {
    const nodes = ctx.getNodes();
    const edges = ctx.getEdges();
    const sourceNode = nodes.find((n) => n.id === connection.source);
    const targetNode = nodes.find((n) => n.id === connection.target);
    const sourceData = sourceNode?.data as { kind?: string } | undefined;
    const targetData = targetNode?.data as { kind?: string } | undefined;
    const wireKind = resolveConnectionWireKind(
      sourceData?.kind,
      connection.sourceHandle ?? undefined,
      targetData?.kind,
      connection.targetHandle ?? undefined
    );

    const pinErr = validatePinConnection(
      sourceData?.kind,
      connection.sourceHandle ?? undefined,
      targetData?.kind,
      connection.targetHandle ?? undefined,
      wireKind
    );
    if (pinErr) {
      alert(pinErr);
      return;
    }

    if (wireKind === "exec") {
      const graphNodes: GraphNode[] = nodes
        .filter((n) => n.type !== "group")
        .map((n) => {
          const d = n.data as { fn?: string; label?: string; kind?: string };
          return {
            id: n.id,
            fn: d.fn ?? d.label ?? n.id,
            kind: (d.kind as GraphNode["kind"]) ?? "function",
          };
        });
      const graphWires: GraphWire[] = [
        ...edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
          kind: (e.type === "execEdge" ? "exec" : "data") as GraphWire["kind"],
        })),
        {
          id: "__pending__",
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle,
          targetHandle: connection.targetHandle,
          kind: "exec",
        },
      ];
      if (detectExecCycle(graphNodes, graphWires).length > 0) {
        alert(
          `Cycle Detected: Execution flow cannot cycle back from '${connection.target}' to '${connection.source}'.`
        );
        return;
      }
    } else if (wouldCreateCycle(connection.source, connection.target, edges)) {
      alert(
        `Cycle Detected: Script execution flow cannot cycle back from '${connection.target}' to '${connection.source}'. Connecting this would create an infinite execution loop.`
      );
      return;
    }

    const isExec = wireKind === "exec";
    const newEdge: Edge = {
      id: `edge_${connection.source}_${connection.target}_${connection.sourceHandle ?? "out"}_${connection.targetHandle ?? "in"}`,
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle ?? undefined,
      targetHandle: connection.targetHandle ?? undefined,
      type: isExec ? "execEdge" : "tacticalEdge",
      animated: !isExec,
      style: isExec
        ? "stroke: #f4f4f5; stroke-width: 2.5;"
        : "stroke: #ef4444; stroke-width: 2;",
      data: { nodes, kind: wireKind },
    };
    ctx.setEdges([...edges, newEdge]);
  }

  /** Appends a Rhai source edit (anchor/native/proxy) and pushes it to Monaco. */
  function appendCode(snippet: string): void {
    const tab = workbench.activeTab;
    if (!tab) return;
    const existing = ctx.getActiveContent().trimEnd();
    const code = existing ? `${existing}\n\n${snippet}\n` : `${snippet}\n`;

    workbench.updateFileContent(tab.pluginName, tab.filename, code);
    ctx.getMonaco()?.setValue(code);
  }

  function handleAddNode(label?: string, position?: FlowPosition): void {
    const nodeLabel = (label ?? "").trim();
    if (!nodeLabel || !workbench.activeTab) return;

    if (!/^[a-zA-Z0-9_]+$/.test(nodeLabel)) {
      alert("Invalid node name. Must be alphanumeric and underscores only.");
      return;
    }

    if (ctx.getNodes().some((n) => (n.data as { label?: string }).label === nodeLabel)) {
      alert(`Node anchor '${nodeLabel}' already exists.`);
      return;
    }

    if (position) ctx.pendingNodePositions.set(nodeLabel, position);
    appendCode(`\n// --- [NODE: ${nodeLabel}] ---\n`);
  }

  function handleAddAssemblyFn(fnName: string, position?: FlowPosition): void {
    const sig = ctx.getActiveManifest().find((s) => s.name === fnName);
    if (!sig || !workbench.activeTab) return;

    const { position: pos, parentId } = resolveNodePlacement(position);
    const newNode = createAssemblyNode(sig, pos, parentId);
    newNode.zIndex = nextNodeZIndex();
    newNode.data = {
      ...newNode.data,
      onOpenSettings: ctx.onOpenSettings,
      onUngroup: handleUngroupNode,
      parentId,
    };

    recomputeGroups([...ctx.getNodes(), newNode]);
  }

  function handleAddCatalogNode(kind: string, position?: FlowPosition): void {
    if (!workbench.activeTab) return;
    const { position: pos, parentId } = resolveNodePlacement(position);
    const newNode = createCatalogNodeByKind(kind, pos, parentId);
    if (!newNode) return;
    newNode.zIndex = nextNodeZIndex();
    newNode.data = {
      ...newNode.data,
      onUngroup: handleUngroupNode,
      parentId,
    };
    recomputeGroups([...ctx.getNodes(), newNode]);
  }

  /** Best-effort import: Event node + exec chain of public manifest functions. */
  function handleImportManifest(position?: FlowPosition): void {
    if (!workbench.activeTab) return;
    const { position: pos } = resolveNodePlacement(position);
    const { nodes: imported, edges: importedEdges } = importRhaiManifestToGraph(
      ctx.getActiveManifest(),
      pos
    );
    if (imported.length === 0) return;
    const stamped = imported.map((n) => ({
      ...n,
      zIndex: nextNodeZIndex(),
      data: { ...n.data, onUngroup: handleUngroupNode, parentId: n.parentId },
    }));
    recomputeGroups([...ctx.getNodes(), ...stamped]);
    ctx.setEdges([...ctx.getEdges(), ...importedEdges]);
  }

  function handleAddControlNode(kind: "branch" | "iterator", position?: FlowPosition): void {
    if (kind === "branch") {
      handleAddCatalogNode("branch", position);
      return;
    }
    if (!workbench.activeTab) return;
    const { position: pos, parentId } = resolveNodePlacement(position);
    const newNode = createControlNode(kind, pos, parentId);
    newNode.zIndex = nextNodeZIndex();
    newNode.data = {
      ...newNode.data,
      onUngroup: handleUngroupNode,
      parentId,
    };
    recomputeGroups([...ctx.getNodes(), newNode]);
  }

  // Inserts an MCP proxy node:
  function handleAddProxyNode(
    connection: McpConnection,
    tool: McpToolSchema,
    position?: FlowPosition
  ): void {
    if (!workbench.activeTab) return;

    const existingLabels = ctx.getNodes().map((n) => (n.data as { label?: string }).label as string);
    const { anchorLabel, code: snippet } = buildProxyNodeSnippet(connection, tool, existingLabels);
    if (position) ctx.pendingNodePositions.set(anchorLabel, position);
    appendCode(snippet);
  }

  /**
   * Schema-generated palette: materializes a wrapper Actuator for a native
   * engine function, then lets the normal parse/manifest pass bind the node.
   */
  function handleAddNativeFn(fnName: string, position?: FlowPosition): void {
    if (!workbench.activeTab) return;
    const fn = engineSchema.byName(fnName);
    if (!fn) return;

    const existingLabels = ctx.getNodes().map((n) => (n.data as { label?: string }).label as string);
    const { anchorLabel, code: snippet } = buildNativeNodeSnippet(fn, existingLabels);
    if (position) ctx.pendingNodePositions.set(anchorLabel, position);
    appendCode(snippet);
  }

  /** Adds a constant literal source node (canvas-only, no Rhai function). */
  function handleAddLiteral(valueType: string, position?: FlowPosition): void {
    if (!workbench.activeTab) return;
    const { position: pos, parentId } = resolveNodePlacement(position);
    const newNode = createLiteralNode(valueType as LiteralValueType, pos, parentId);
    newNode.zIndex = nextNodeZIndex();
    newNode.data = {
      ...newNode.data,
      onUngroup: handleUngroupNode,
      parentId,
    };
    recomputeGroups([...ctx.getNodes(), newNode]);
  }

  /**
   * Creates a visual group. With a selection it wraps the selected leaf nodes;
   * with nothing selected it drops an empty group (groups may now be empty, so
   * the old "select at least 2 nodes" rule no longer applies). Empty groups are
   * parented to Main Logic when present and sized to the header-fit floor.
   */
  function handleNewGroup(): void {
    if (!workbench.activeTab) return;
    const nodes = ctx.getNodes();
    const selectedNodes = nodes.filter((n) => n.selected && n.type !== "group");

    const groupName = prompt("Enter Logic Group Name:", "Logic Segment") || "Group Node";
    const groupId = `group_${Date.now()}`;

    // No selection: drop an empty, header-fit group into Main Logic (or the root
    // when no Main Logic exists yet), offset per existing sibling group so a run
    // of New Group clicks does not stack every box on the same spot.
    if (selectedNodes.length === 0) {
      const parentId = nodes.some((n) => n.id === "main_group") ? "main_group" : undefined;
      const slot = nodes.filter((n) => n.type === "group" && n.parentId === parentId).length;
      const emptyGroup: Node = {
        id: groupId,
        type: "group",
        position: { x: 60 + slot * 40, y: 60 + slot * 40 },
        parentId,
        data: { label: groupName },
        style: formatGroupStyle(emptyGroupFloor()),
        zIndex: Z_GROUP,
      };
      recomputeGroups([...nodes, emptyGroup]);
      return;
    }

    const parentIds = new Set(selectedNodes.map((n) => n.parentId));
    const groupParentId = parentIds.size === 1 ? [...parentIds][0] : undefined;

    const bounds = computeGroupBounds(selectedNodes, ctx.getNodeSize);
    if (!bounds) return;

    const groupNode: Node = {
      id: groupId,
      type: "group",
      position: { x: bounds.x, y: bounds.y },
      parentId: groupParentId,
      data: { label: groupName },
      style: formatGroupStyle({ width: bounds.width, height: bounds.height }),
      zIndex: Z_GROUP,
    };

    const updatedNodes = nodes.map((n) => {
      if (!selectedNodes.some((sn) => sn.id === n.id)) return n;
      return {
        ...n,
        parentId: groupId,
        extent: undefined,
        position: {
          x: n.position.x - bounds.x,
          y: n.position.y - bounds.y,
        },
        data: {
          ...(n.data as Record<string, unknown>),
          parentId: groupId,
        },
      };
    });

    // Old parents of the grouped nodes lost members and must re-snug.
    const affected = new Set<string>();
    for (const sn of selectedNodes) if (sn.parentId) affected.add(sn.parentId);
    recomputeGroups(
      clearManualSizeFor([groupNode, ...updatedNodes.filter((n) => n.id !== groupId)], affected)
    );
  }

  // Remove parent-relative containment and restore node to root coordinate space.
  function handleUngroupNode(nodeId: string): void {
    moveNodeToGroup(nodeId, null);
  }

  function handleNodeDragStop(nodeId: string, dropTargetGroupId: string | null): void {
    moveNodeToGroup(nodeId, dropTargetGroupId);
  }

  /** Multi-select drop: every dragged node joins (or leaves) the target together. */
  function handleNodesDragStop(nodeIds: string[], dropTargetGroupId: string | null): void {
    moveNodesToGroup(nodeIds, dropTargetGroupId);
  }

  function handleAddToGroup(nodeId: string, groupId: string): void {
    moveNodeToGroup(nodeId, groupId);
  }

  /**
   * Commits a manual group resize. The NodeResizer plugin has already written
   * the new `width`/`height` into our reactive nodes (clamped to the per-group
   * content floor via `data.minWidth`/`minHeight`). We record dimensions as the
   * group's *manual* size floor only when they exceed the snug content footprint
   * so a user can enlarge and then shrink back down to the visibility floor.
   * Recording manual intent separately (rather than feeding the live size back)
   * is what prevents runaway growth.
   */
  function handleGroupResize(groupId: string): void {
    const nodes = ctx.getNodes();
    const group = nodes.find((n) => n.id === groupId && n.type === "group") as
      | (Node & { width?: number; height?: number })
      | undefined;
    if (!group || group.width === undefined || group.height === undefined) return;

    const resizedWidth = group.width;
    const resizedHeight = group.height;

    // Snug footprint with no manual floor, the minimum that keeps every member visible.
    const snugOnly = nodes.map((n) => {
      if (n.id !== groupId) return n;
      const data = { ...(n.data as Record<string, unknown>) };
      delete data.manualWidth;
      delete data.manualHeight;
      return { ...n, data };
    });
    const snug = resizeGroupsBottomUp(snugOnly, ctx.getNodeSize);
    const snugGroup = snug.find((n) => n.id === groupId)!;
    const snugData = snugGroup.data as { minWidth?: number; minHeight?: number };
    const contentWidth = snugData.minWidth ?? resizedWidth;
    const contentHeight = snugData.minHeight ?? resizedHeight;

    const manualWidth = resizedWidth > contentWidth ? resizedWidth : undefined;
    const manualHeight = resizedHeight > contentHeight ? resizedHeight : undefined;

    const next = nodes.map((n) => {
      if (n.id !== groupId) return n;
      const data = { ...(n.data as Record<string, unknown>) };
      if (manualWidth !== undefined) data.manualWidth = manualWidth;
      else delete data.manualWidth;
      if (manualHeight !== undefined) data.manualHeight = manualHeight;
      else delete data.manualHeight;
      return { ...n, data };
    });
    recomputeGroups(next);
  }

  /** Transient hover highlight for the Add-to-group menu (not serialized). */
  function setGroupHighlight(groupId: string | null): void {
    ctx.setNodes(
      ctx.getNodes().map((n) => {
        if (n.type !== "group") return n;
        const highlight = groupId !== null && n.id === groupId;
        const current = (n.data as { highlight?: boolean }).highlight === true;
        if (current === highlight) return n;
        return { ...n, data: { ...(n.data as object), highlight } };
      })
    );
  }

  function handlePaletteAction(action: PaletteAction, position?: FlowPosition): void {
    switch (action.type) {
      case "anchor":
        handleAddNode(action.label, position);
        break;
      case "assemblyFn":
        handleAddAssemblyFn(action.fnName, position);
        break;
      case "nativeFn":
        handleAddNativeFn(action.fnName, position);
        break;
      case "control":
        handleAddControlNode(action.kind, position);
        break;
      case "catalog":
        handleAddCatalogNode(action.kind, position);
        break;
      case "importManifest":
        handleImportManifest(position);
        break;
      case "literal":
        handleAddLiteral(action.valueType, position);
        break;
      case "proxy":
        handleAddProxyNode(action.connection, action.tool, position);
        break;
    }
  }

  /**
   * Deletes an arbitrary selection of nodes and/or groups in a single atomic
   * pass. Selected groups cascade: every descendant node and nested group is
   * removed too (`collectGroupDescendants`). Removed leaf nodes also have their
   * Rhai `[NODE: ...]` anchors stripped from the source, dangling edges are
   * dropped, surviving parent groups re-snug to their reduced contents, and the
   * canvas sidecar is rewritten in the same turn so the idempotent parse pass
   * cannot resurrect a deleted node/group from stale metadata.
   *
   * `main_group` is never deletable and is skipped if present in `ids`. Both
   * {@link handleDeleteNode} and {@link handleDeleteGroup} delegate here so all
   * deletion paths (context menu, Delete key) share one implementation.
   *
   * @param ids Node/group ids to delete (groups expand to their full subtree).
   */
  function handleDeleteSelection(ids: string[]): void {
    if (!workbench.activeTab) return;
    const nodes = ctx.getNodes();
    const byId = new Map(nodes.map((n) => [n.id, n]));

    // Expand any selected groups to their full subtree; record the original
    // parents of every deleted item so the survivors among them can re-snug.
    const removeIds = new Set<string>();
    const affected = new Set<string>();
    for (const id of ids) {
      if (id === "main_group") continue;
      const node = byId.get(id);
      if (!node) continue;
      if (node.parentId) affected.add(node.parentId);
      if (node.type === "group") {
        for (const d of collectGroupDescendants(id, nodes)) removeIds.add(d.id);
      } else {
        removeIds.add(id);
      }
    }
    if (removeIds.size === 0) return;

    // A parent that is itself being removed must not be asked to re-snug.
    for (const id of removeIds) affected.delete(id);

    let content = ctx.getActiveContent();
    let contentChanged = false;
    for (const id of removeIds) {
      const node = byId.get(id);
      if (!node || node.type === "group") continue;
      const label = (node.data as { label?: string }).label ?? "";
      if (label && content.includes(`[NODE: ${label}]`)) {
        content = removeNodeAnchor(content, label);
        contentChanged = true;
      }
    }

    const remainingEdges = ctx
      .getEdges()
      .filter((e) => !removeIds.has(e.source) && !removeIds.has(e.target));
    const next = nodes.filter((n) => !removeIds.has(n.id));

    const tab = workbench.activeTab;
    recomputeGroups(clearManualSizeFor(next, affected));
    ctx.setEdges(remainingEdges);
    // Canvas must update in the same turn as the node removal so the parse pass
    // cannot resurrect deleted groups from stale sidecar metadata.
    workbench.updateCanvasContent(
      tab.pluginName,
      tab.filename,
      buildCanvasMetadata(ctx.getNodes(), remainingEdges)
    );

    if (contentChanged) {
      workbench.updateFileContent(tab.pluginName, tab.filename, content);
      ctx.getMonaco()?.setValue(content);
    }
  }

  /** Deletes a single leaf node (groups route through {@link handleDeleteGroup}). */
  function handleDeleteNode(nodeId: string): void {
    const node = ctx.getNodes().find((n) => n.id === nodeId);
    if (!node || node.type === "group") return;
    handleDeleteSelection([nodeId]);
  }

  /** Removes a group and every descendant node/group, their edges, and Rhai anchors. */
  function handleDeleteGroup(groupId: string): void {
    handleDeleteSelection([groupId]);
  }

  return {
    resolveNodePlacement,
    handleConnect,
    handleAddNode,
    handleAddAssemblyFn,
    handleAddControlNode,
    handleAddProxyNode,
    handleAddNativeFn,
    handleAddLiteral,
    handleNewGroup,
    handleUngroupNode,
    handleNodeDragStop,
    handleNodesDragStop,
    handleAddToGroup,
    handleGroupResize,
    setGroupHighlight,
    handlePaletteAction,
    handleDeleteNode,
    handleDeleteGroup,
    handleDeleteSelection,
  };
}
