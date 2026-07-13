// chaosnexus-forge/src/lib/dual_editor/illustrative_layout.ts
//
// Spacing grid and deterministic de-overlap for display-only illustrative canvases.

import type { CanvasNodeRecord } from "./canvas_schema";

/** Rendered card max-width (`NodeShell` uses min-w 190 / max-w 260). */
export const NODE_W = 260;
/** Approximate rendered card height (Branch / For Each nodes run taller). */
export const NODE_H = 200;
/** Vertical gap between nodes in the layout grid. */
export const GAP_Y = 40;
/** Horizontal gap between nodes in the layout grid. */
export const GAP_X = 40;
/** Padding applied around the main group to encapsulate its children. */
export const GROUP_PAD = 48;

/** Y band within which nodes are treated as the same horizontal row. */
const ROW_BAND = 36;

/** 
 * Column index -> x inside a group (0 = left anchor column). 
 * 
 * @param index The column index.
 * @param base The base offset.
 * @returns The X coordinate for the given column.
 */
export function col(index: number, base = 30): number {
  return base + index * (NODE_W + GAP_X);
}

/** 
 * Row index -> y inside a group (0 = top anchor row). 
 * 
 * @param index The row index.
 * @param base The base offset.
 * @returns The Y coordinate for the given row.
 */
export function row(index: number, base = 45): number {
  return base + index * (NODE_H + GAP_Y);
}

function rect(n: CanvasNodeRecord) {
  return { x: n.x, y: n.y, w: NODE_W, h: NODE_H };
}

function rectsOverlap(
  a: ReturnType<typeof rect>,
  b: ReturnType<typeof rect>
): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function sameRow(a: ReturnType<typeof rect>, b: ReturnType<typeof rect>): boolean {
  return Math.abs(a.y - b.y) < ROW_BAND;
}

function sameColumn(a: ReturnType<typeof rect>, b: ReturnType<typeof rect>): boolean {
  return Math.abs(a.x - b.x) < NODE_W / 2;
}

/** Pushes `moving` out of `fixed` along row/column-aware axes (left-to-right flow). */
function separate(moving: CanvasNodeRecord, fixed: CanvasNodeRecord): void {
  const ri = rect(moving);
  const rj = rect(fixed);
  if (!rectsOverlap(ri, rj)) return;

  if (sameRow(ri, rj)) {
    moving.x = rj.x + rj.w + GAP_X;
  } else if (sameColumn(ri, rj)) {
    moving.y = rj.y + rj.h + GAP_Y;
  } else {
    // Mixed overlap: prefer horizontal separation for illustrative exec lanes.
    moving.x = rj.x + rj.w + GAP_X;
  }
}

/** 
 * Nudges sibling nodes apart when bounding boxes overlap (stable, reproducible). 
 * 
 * @param nodes The nodes to de-overlap.
 * @returns A new array of nodes with positions adjusted to prevent overlaps.
 */
export function deOverlapNodes(nodes: CanvasNodeRecord[]): CanvasNodeRecord[] {
  const out = nodes.map((n) => ({ ...n }));
  const byParent = new Map<string, CanvasNodeRecord[]>();

  for (const n of out) {
    if (n.type === "group") continue;
    const key = n.parentId ?? "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(n);
  }

  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.y - b.y || a.x - b.x);
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 1; i < siblings.length; i++) {
        for (let j = 0; j < i; j++) {
          const beforeX = siblings[i].x;
          const beforeY = siblings[i].y;
          separate(siblings[i], siblings[j]);
          if (siblings[i].x !== beforeX || siblings[i].y !== beforeY) {
            changed = true;
          }
        }
      }
    }
  }

  return out;
}

/** 
 * Resizes `main_group` to fit all child nodes after layout. 
 * 
 * @param nodes The nodes to evaluate and resize the group for.
 * @returns A new array of nodes with the `main_group` size adjusted.
 */
export function fitMainGroup(nodes: CanvasNodeRecord[]): CanvasNodeRecord[] {
  const out = nodes.map((n) => ({ ...n }));
  const group = out.find((n) => n.id === "main_group");
  if (!group) return out;

  const children = out.filter((n) => n.parentId === "main_group" && n.type !== "group");
  if (children.length === 0) return out;

  let maxX = 0;
  let maxY = 0;
  for (const c of children) {
    maxX = Math.max(maxX, c.x + NODE_W);
    maxY = Math.max(maxY, c.y + NODE_H);
  }

  group.style = `width: ${maxX + GROUP_PAD}px; height: ${maxY + GROUP_PAD}px;`;
  return out;
}

/**
 * Finalizes the illustrative layout by running de-overlap and then fitting the main group.
 * 
 * @param nodes The nodes to layout.
 * @returns The finalized array of nodes.
 */
export function finalizeLayout(nodes: CanvasNodeRecord[]): CanvasNodeRecord[] {
  return fitMainGroup(deOverlapNodes(nodes));
}
