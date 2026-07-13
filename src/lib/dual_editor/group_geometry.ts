/**
 * @module
 * chaosnexus-forge/src/lib/dual_editor/group_geometry.ts
 */

import type { Node } from "@xyflow/svelte";

/** Width and height in flow pixels. */
export interface Size {
  width: number;
  height: number;
}

/** Axis-aligned rectangle in a parent-relative coordinate space. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Fallback when a leaf node has not been measured yet. */
export const DEFAULT_NODE_SIZE: Size = { width: 200, height: 90 };

/** Inner padding between a group's edge and its members. */
export const GROUP_PADDING = { x: 30, y: 45 } as const;

/**
 * Smallest footprint that still keeps an *empty* group's header/title legible.
 * Derived from the header row in `CustomGroupNode.svelte` (`px-3` = 12px of side
 * padding each edge, `py-1` = 4px top/bottom, one bold ~14px text row plus the
 * 2px dashed border), padded out to a readable label width and a little body
 * breathing room. {@link MIN_GROUP_SIZE} MUST stay ≥ this in both axes so the
 * structural floor can never hide the header.
 */
export const GROUP_HEADER_MIN_SIZE: Size = { width: 200, height: 120 };

/** Floor so a group never collapses to a broken or negative box. */
export const MIN_GROUP_SIZE: Size = { width: 220, height: 140 };

/**
 * Minimum footprint for a group with no members: the larger of the structural
 * floor and the header-fit floor, guaranteeing the title stays visible. Single
 * source of truth for every "empty group" size decision.
 */
export function emptyGroupFloor(): Size {
  return {
    width: Math.max(MIN_GROUP_SIZE.width, GROUP_HEADER_MIN_SIZE.width),
    height: Math.max(MIN_GROUP_SIZE.height, GROUP_HEADER_MIN_SIZE.height),
  };
}

/** Size reader injected by callers (backed by `getInternalNode().measured`). */
export type SizeReader = (id: string) => Size | undefined;

/**
 * Parses `width: Npx; height: Mpx;` from a group style string.
 * Clamps non-finite or sub-minimum values to {@link MIN_GROUP_SIZE}.
 */
export function parseGroupSize(style: string | undefined): Size {
  if (!style) return { ...MIN_GROUP_SIZE };

  const wMatch = style.match(/width:\s*([-\d.]+)px/);
  const hMatch = style.match(/height:\s*([-\d.]+)px/);

  let width = wMatch ? parseFloat(wMatch[1]) : MIN_GROUP_SIZE.width;
  let height = hMatch ? parseFloat(hMatch[1]) : MIN_GROUP_SIZE.height;

  if (!Number.isFinite(width) || width < MIN_GROUP_SIZE.width) width = MIN_GROUP_SIZE.width;
  if (!Number.isFinite(height) || height < MIN_GROUP_SIZE.height) height = MIN_GROUP_SIZE.height;

  return { width, height };
}

/** Serializes a size into the canonical group CSS style string. */
export function formatGroupStyle(size: Size): string {
  const width = Math.max(MIN_GROUP_SIZE.width, Math.round(size.width));
  const height = Math.max(MIN_GROUP_SIZE.height, Math.round(size.height));
  return `width: ${width}px; height: ${height}px;`;
}

/**
 * Effective render size of any node: groups use their parsed style; leaf nodes
 * prefer measured dimensions with a conservative fallback.
 */
export function effectiveSize(node: Node, read: SizeReader): Size {
  if (node.type === "group") {
    return parseGroupSize(typeof node.style === "string" ? node.style : undefined);
  }

  const measured = read(node.id);
  if (measured && measured.width > 0 && measured.height > 0) {
    return measured;
  }

  const inline = (node as { measured?: Size }).measured;
  if (inline?.width && inline?.height) {
    return inline;
  }

  return { ...DEFAULT_NODE_SIZE };
}

/**
 * Bounding envelope (parent-relative) covering all children plus padding.
 * Returns null when there are no children.
 */
export function computeGroupBounds(children: Node[], read: SizeReader): Rect | null {
  if (children.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const child of children) {
    const size = effectiveSize(child, read);
    minX = Math.min(minX, child.position.x);
    minY = Math.min(minY, child.position.y);
    maxX = Math.max(maxX, child.position.x + size.width);
    maxY = Math.max(maxY, child.position.y + size.height);
  }

  return {
    x: minX - GROUP_PADDING.x,
    y: minY - GROUP_PADDING.y,
    width: maxX - minX + GROUP_PADDING.x * 2,
    height: maxY - minY + GROUP_PADDING.y * 2,
  };
}

/** Depth of a group from the root parent chain (`main_group` at root = 0). */
export function groupDepth(id: string, byId: Map<string, Node>): number {
  let depth = 0;
  let current = byId.get(id);
  const visited = new Set<string>();

  while (current?.parentId) {
    if (visited.has(current.parentId)) break;
    visited.add(current.parentId);
    depth++;
    current = byId.get(current.parentId);
  }

  return depth;
}

/**
 * Minimum size a group must have to contain its members (content bounds clamped
 * to {@link MIN_GROUP_SIZE}). Used both for grow-only auto-resize and as the
 * floor for manual resize so a user can never shrink a group past its contents.
 */
export function minGroupSizeForChildren(children: Node[], read: SizeReader): Size {
  const bounds = computeGroupBounds(children, read);
  if (!bounds) return emptyGroupFloor();
  return {
    width: Math.max(MIN_GROUP_SIZE.width, Math.round(bounds.width)),
    height: Math.max(MIN_GROUP_SIZE.height, Math.round(bounds.height)),
  };
}

/** A group's user-chosen manual size (set only by an explicit manual resize). */
export function readManualSize(group: Node): { width?: number; height?: number } {
  const data = (group.data ?? {}) as { manualWidth?: number; manualHeight?: number };
  return { width: data.manualWidth, height: data.manualHeight };
}

/**
 * Recomputes every group's style and position bottom-up (deepest first) so inner
 * resizes bubble into outer groups. Returns a new nodes array.
 *
 * Each group is sized to **snugly fit its members** (content extent + padding,
 * clamped to {@link MIN_GROUP_SIZE}) and then expanded to a user's manual size
 * when one is larger (see {@link readManualSize}). Crucially the group's own
 * *current* size is never fed back into the calculation, so a group can never
 * inflate itself: it grows to fit content dragged in, shrinks back when members
 * leave, and only stays large when the user explicitly resized it. This replaces
 * the previous grow-only logic, whose `max(currentSize, …)` feedback combined
 * with the origin shift could balloon a group without bound.
 *
 * Content is re-anchored to the padding inset on every pass: members are shifted
 * so the top-left child sits at exactly {@link GROUP_PADDING}, and the group
 * origin moves the opposite way to preserve absolute canvas positions. That
 * bidirectional normalization collapses dead space left by a top/left manual
 * resize (which would otherwise inflate the content floor and block shrinking)
 * while still nudging members that extend above/left of the inset. The pass is
 * idempotent once the top-left member is at exactly `padding`.
 */
export function resizeGroupsBottomUp(nodes: Node[], read: SizeReader): Node[] {
  const result = nodes.map((n) => ({
    ...n,
    position: { ...n.position },
    data: n.data ? { ...n.data } : n.data,
  }));
  const byId = new Map(result.map((n) => [n.id, n]));

  const childrenByParent = new Map<string | undefined, Node[]>();
  for (const node of result) {
    const parentKey = node.parentId;
    if (!childrenByParent.has(parentKey)) childrenByParent.set(parentKey, []);
    childrenByParent.get(parentKey)!.push(node);
  }

  const groups = result.filter((n) => n.type === "group");
  const sortedGroups = [...groups].sort(
    (a, b) => groupDepth(b.id, byId) - groupDepth(a.id, byId)
  );

  for (const group of sortedGroups) {
    const children = childrenByParent.get(group.id) ?? [];
    const manual = readManualSize(group);

    if (children.length === 0) {
      const floor = emptyGroupFloor();
      const size: Size = {
        width: Math.max(floor.width, manual.width ?? 0),
        height: Math.max(floor.height, manual.height ?? 0),
      };
      applyGroupSize(group, size, floor);
      continue;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxRight = -Infinity;
    let maxBottom = -Infinity;
    for (const child of children) {
      const size = effectiveSize(child, read);
      minX = Math.min(minX, child.position.x);
      minY = Math.min(minY, child.position.y);
      maxRight = Math.max(maxRight, child.position.x + size.width);
      maxBottom = Math.max(maxBottom, child.position.y + size.height);
    }

    // Bidirectional: negative shift pulls members up/left when they sit below the
    // padding inset (dead space from a prior top/left resize); positive shift
    // nudges members that extend past the inset. Group origin moves opposite so
    // absolute positions stay fixed on the canvas.
    const shiftX = GROUP_PADDING.x - minX;
    const shiftY = GROUP_PADDING.y - minY;
    if (shiftX !== 0 || shiftY !== 0) {
      group.position = { x: group.position.x - shiftX, y: group.position.y - shiftY };
      for (const child of children) {
        child.position = { x: child.position.x + shiftX, y: child.position.y + shiftY };
      }
      maxRight += shiftX;
      maxBottom += shiftY;
    }

    // Snug content footprint: rightmost/bottommost member edge plus a trailing
    // pad. The left/top pad is already baked in via the shift above. No term
    // here references the group's existing size, so it cannot self-inflate.
    const contentFloor: Size = {
      width: Math.max(MIN_GROUP_SIZE.width, Math.round(maxRight + GROUP_PADDING.x)),
      height: Math.max(MIN_GROUP_SIZE.height, Math.round(maxBottom + GROUP_PADDING.y)),
    };
    const size: Size = {
      width: Math.max(contentFloor.width, manual.width ?? 0),
      height: Math.max(contentFloor.height, manual.height ?? 0),
    };
    applyGroupSize(group, size, contentFloor);
  }

  return result;
}

/**
 * Writes a group's size to every source of truth at once: the serialized
 * `style` string, the explicit `width`/`height` fields (which Svelte Flow's
 * NodeWrapper applies *after* `style`, so they must agree), and the
 * `data.minWidth`/`data.minHeight` floor consumed by the manual resize handle.
 */
function applyGroupSize(group: Node, size: Size, minSize: Size): void {
  const width = Math.max(MIN_GROUP_SIZE.width, Math.round(size.width));
  const height = Math.max(MIN_GROUP_SIZE.height, Math.round(size.height));
  group.style = formatGroupStyle({ width, height });
  (group as { width?: number }).width = width;
  (group as { height?: number }).height = height;
  if (group.data) {
    const data = group.data as Record<string, unknown>;
    data.minWidth = Math.max(MIN_GROUP_SIZE.width, Math.round(minSize.width));
    data.minHeight = Math.max(MIN_GROUP_SIZE.height, Math.round(minSize.height));
  }
}
