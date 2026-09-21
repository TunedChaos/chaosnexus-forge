/**
 * @module
 * chaosnexus-forge/src/lib/dual_editor/group_membership.ts
 */

import type { Node } from "@xyflow/svelte";
import { Z_MAIN_GROUP, Z_GROUP, Z_NODE_BASE } from "$lib/parser";
import { effectiveSize, groupDepth, type SizeReader } from "./group_geometry";

/** Absolute top-left of a node, walking the `parentId` chain. */
export function absolutePosition(
  node: Node,
  byId: Map<string, Node>
): { x: number; y: number } {
  let x = node.position.x;
  let y = node.position.y;
  let current: Node | undefined = node;
  const visited = new Set<string>();

  while (current?.parentId) {
    if (visited.has(current.parentId)) break;
    visited.add(current.parentId);
    const parent = byId.get(current.parentId);
    if (!parent) break;
    x += parent.position.x;
    y += parent.position.y;
    current = parent;
  }

  return { x, y };
}

/** Absolute axis-aligned bounds of a node. */
export function rectOf(
  node: Node,
  byId: Map<string, Node>,
  read: SizeReader
): { x: number; y: number; width: number; height: number } {
  const pos = absolutePosition(node, byId);
  const size = effectiveSize(node, read);
  return { x: pos.x, y: pos.y, width: size.width, height: size.height };
}

/**
 * Whether a node may be re-parented by dragging. The root `main_group` spans the
 * whole canvas and must always stay put, so it is the single exception; every
 * other node and (nested) group is freely draggable into or out of any group.
 * Shared by the drag-highlight and drag-stop handlers so the rule lives in one
 * place. Narrows the type so callers can use `targetNode.id` afterwards.
 */
export function isReparentableOnDrag(node: Node | null | undefined): node is Node {
  return !!node && node.id !== "main_group";
}

/** True when `candidateId` is `nodeId` or a descendant of it. */
export function isSelfOrDescendant(
  candidateId: string,
  nodeId: string,
  byId: Map<string, Node>
): boolean {
  if (candidateId === nodeId) return true;

  let current = byId.get(candidateId);
  const visited = new Set<string>();

  while (current?.parentId) {
    if (current.parentId === nodeId) return true;
    if (visited.has(current.parentId)) break;
    visited.add(current.parentId);
    current = byId.get(current.parentId);
  }

  return false;
}

/**
 * Picks the best drop target from overlapping groups: deepest first, then
 * highest z-index. Excludes self and descendants.
 */
export function pickDeepestGroup(
  candidateGroupIds: string[],
  draggedNodeId: string,
  byId: Map<string, Node>
): string | null {
  const eligible = candidateGroupIds.filter(
    (id) => !isSelfOrDescendant(id, draggedNodeId, byId)
  );
  if (eligible.length === 0) return null;

  eligible.sort((a, b) => {
    const depthDiff = groupDepth(b, byId) - groupDepth(a, byId);
    if (depthDiff !== 0) return depthDiff;
    const za = byId.get(a)?.zIndex ?? 0;
    const zb = byId.get(b)?.zIndex ?? 0;
    return zb - za;
  });

  return eligible[0];
}

/** True when a flow-space point lies inside an axis-aligned rectangle. */
export function pointInRect(
  point: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * Every group whose absolute bounds contain `point` (flow coordinates). Used to
 * resolve drop membership from the mouse cursor rather than node overlap.
 */
export function groupsContainingPoint(
  point: { x: number; y: number },
  nodes: Node[],
  read: SizeReader
): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hits: string[] = [];
  for (const node of nodes) {
    if (node.type !== "group") continue;
    const rect = rectOf(node, byId, read);
    if (pointInRect(point, rect)) hits.push(node.id);
  }
  return hits;
}

/**
 * Lifts dragged nodes to the canvas root with absolute coordinates so Svelte Flow
 * does not clamp them inside a parent's bounds mid-drag. Drop handlers re-parent.
 */
export function liftNodesToRootForDrag(nodes: Node[], nodeIds: string[]): Node[] {
  if (nodeIds.length === 0) return nodes;
  const idSet = new Set(nodeIds);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const lifted = nodes.map((n) => {
    if (!idSet.has(n.id) || !n.parentId) return n;
    const abs = absolutePosition(n, byId);
    return {
      ...n,
      parentId: undefined,
      extent: undefined,
      position: abs,
      data: { ...(n.data as Record<string, unknown>), dragLifted: true },
    };
  });
  return orderNodesParentFirst(lifted);
}

/**
 * Collects `groupId` and every descendant node (nested groups and leaves) in a
 * stable depth-first order. Used for cascade delete warnings and removal.
 */
export function collectGroupDescendants(groupId: string, nodes: Node[]): Node[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const group = byId.get(groupId);
  if (!group || group.type !== "group") return [];

  const childrenOf = new Map<string, Node[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    if (!childrenOf.has(node.parentId)) childrenOf.set(node.parentId, []);
    childrenOf.get(node.parentId)!.push(node);
  }

  const out: Node[] = [group];
  const visited = new Set<string>([groupId]);
  const walk = (parentId: string): void => {
    for (const child of childrenOf.get(parentId) ?? []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      out.push(child);
      if (child.type === "group") walk(child.id);
    }
  };
  walk(groupId);
  return out;
}

/**
 * Flow-space point used to resolve drop membership for a dragged node or group.
 *
 * The cursor is authoritative for both leaves and groups: a group is dragged by
 * its header, so the cursor *is* the user's pointer and "the group it is over"
 * means the group under that pointer. Using the cursor (rather than the dragged
 * group's geometric center) lets a group drop into whatever group its header is
 * released over, and still detaches when the header is dragged outside every
 * group. The parameters beyond `cursorFlow` are retained for call-site symmetry
 * with the other resolvers (and a stable signature for tests).
 */
export function dropPointForDrag(
  _draggedNode: Node,
  _nodes: Node[],
  cursorFlow: { x: number; y: number },
  _read: SizeReader
): { x: number; y: number } {
  return cursorFlow;
}

/**
 * Resolves drop membership for a dragged node or group from the cursor position:
 * the deepest eligible group whose bounds contain the cursor wins, or `null`
 * (detach to root) when the cursor is outside every group. See
 * {@link dropPointForDrag} for why the cursor is authoritative for groups too.
 */
export function resolveDropTargetForDrag(
  draggedNode: Node,
  nodes: Node[],
  cursorFlow: { x: number; y: number },
  read: SizeReader
): string | null {
  const point = dropPointForDrag(draggedNode, nodes, cursorFlow, read);
  return resolveDropTargetAtPoint(draggedNode, nodes, point, read);
}

/**
 * Resolves the group a dragged node should belong to after drop from the mouse
 * cursor position (flow coordinates). The deepest eligible group whose bounds
 * contain the cursor wins; `null` when the cursor is outside every group
 * (including `main_group`) so the item becomes standalone at the canvas root.
 *
 * This replaces overlap-based hit testing, which could not reliably ungroup
 * because `main_group` spans the layout and always intersected dragged nodes.
 */
export function resolveDropTargetAtPoint(
  draggedNode: Node,
  nodes: Node[],
  cursorFlow: { x: number; y: number },
  read: SizeReader
): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const overlapping = groupsContainingPoint(cursorFlow, nodes, read);
  return pickDeepestGroup(overlapping, draggedNode.id, byId);
}

/**
 * Resolves the group a dragged node should belong to after drop. Uses overlapping
 * groups when present; otherwise keeps the current parent only when the node
 * center is still inside that parent's bounds (drag-out otherwise clears parent).
 *
 * @deprecated Prefer {@link resolveDropTargetAtPoint} for canvas drag-drop; overlap
 *   hit testing cannot distinguish inner vs outer groups when `main_group` spans
 *   the layout.
 */
export function resolveDropTarget(
  draggedNode: Node,
  nodes: Node[],
  overlappingGroupIds: string[],
  read: SizeReader
): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const picked = pickDeepestGroup(overlappingGroupIds, draggedNode.id, byId);
  if (picked) return picked;

  const parentId = draggedNode.parentId;
  if (!parentId) return null;

  const parent = byId.get(parentId);
  if (!parent) return null;

  const nodeRect = rectOf(draggedNode, byId, read);
  const center = {
    x: nodeRect.x + nodeRect.width / 2,
    y: nodeRect.y + nodeRect.height / 2,
  };
  const parentRect = rectOf(parent, byId, read);
  const stillInside =
    center.x >= parentRect.x &&
    center.x <= parentRect.x + parentRect.width &&
    center.y >= parentRect.y &&
    center.y <= parentRect.y + parentRect.height;

  return stillInside ? parentId : null;
}

/** Converts an absolute position into coordinates relative to `newParentId`. */
export function rebaseToParent(
  absPos: { x: number; y: number },
  newParentId: string | undefined,
  byId: Map<string, Node>
): { x: number; y: number } {
  if (!newParentId) {
    return { x: absPos.x, y: absPos.y };
  }

  const parent = byId.get(newParentId);
  if (!parent) return { x: absPos.x, y: absPos.y };

  const parentAbs = absolutePosition(parent, byId);
  return { x: absPos.x - parentAbs.x, y: absPos.y - parentAbs.y };
}

/**
 * Reorders nodes so every parent appears before its children (a stable
 * depth-first walk that preserves sibling order). Svelte Flow positions child
 * nodes relative to whichever parent precedes them in the array; if a re-parented
 * child ends up before its new parent, its on-screen position and drag math go
 * wrong (the offsets that look "strange" when panning/zooming and dragging).
 * Running this after every membership change keeps containment math correct.
 */
export function orderNodesParentFirst(nodes: Node[]): Node[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string | undefined, Node[]>();

  for (const node of nodes) {
    const key = node.parentId && byId.has(node.parentId) ? node.parentId : undefined;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(node);
  }

  const ordered: Node[] = [];
  const visited = new Set<string>();
  const visit = (parentKey: string | undefined): void => {
    for (const node of childrenOf.get(parentKey) ?? []) {
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      ordered.push(node);
      visit(node.id);
    }
  };
  visit(undefined);

  // Safety net for cyclic/dangling parentId chains: keep any unreached node.
  if (ordered.length !== nodes.length) {
    for (const node of nodes) {
      if (!visited.has(node.id)) ordered.push(node);
    }
  }

  return ordered;
}

/**
 * Reassigns z-index for manual `zIndexMode` (after enforcing parent-first order):
 * - `main_group` → {@link Z_MAIN_GROUP}
 * - other groups → {@link Z_GROUP} + depth
 * - leaf nodes → {@link Z_NODE_BASE} + stable index
 */
export function restackGroups(nodes: Node[]): Node[] {
  const ordered = orderNodesParentFirst(nodes);
  const byId = new Map(ordered.map((n) => [n.id, n]));
  let leafIndex = 0;

  return ordered.map((n) => {
    if (n.type === "group") {
      if (n.id === "main_group") {
        return { ...n, zIndex: Z_MAIN_GROUP };
      }
      return { ...n, zIndex: Z_GROUP + groupDepth(n.id, byId) };
    }

    const zIndex = Z_NODE_BASE + leafIndex;
    leafIndex++;
    return { ...n, zIndex };
  });
}
