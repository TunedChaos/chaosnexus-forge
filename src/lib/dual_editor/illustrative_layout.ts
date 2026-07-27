// chaosnexus-forge/src/lib/dual_editor/illustrative_layout.ts
//
// Spacing grid, soft bubble repulsion, and hard AABB de-overlap for Vhai canvases.
// Lane placement stays structured; physics only keeps sibling cards from crowding.

import type { CanvasNodeRecord } from "./canvas_schema";
import type { Size } from "./group_geometry";

/** Rendered card max-width (`NodeShell` uses min-w 190 / max-w 240). */
export const NODE_W = 220;
/** Floor height for unknown leaf cards (script/branch cards are often taller). */
export const NODE_H = 150;
/** Vertical gap between nodes in the layout grid. */
export const GAP_Y = 28;
/** Horizontal gap between nodes in the layout grid. */
export const GAP_X = 40;
/** Soft personal-space margin beyond hard AABB gaps (bubble field). */
export const BUBBLE_PAD = 28;
/** Padding applied around the main group to encapsulate its children snugly. */
export const GROUP_PAD = 40;
/** Default iteration budget for soft + hard separation passes. */
export const PHYSICS_MAX_ITERS = 40;

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
  return { x: n.x, y: n.y, w: n.width ?? NODE_W, h: n.height ?? NODE_H };
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

/** Bubble radius from half-diagonal of the card AABB. */
export function bubbleRadius(w: number, h: number): number {
  return Math.hypot(w / 2, h / 2);
}

/** True when two sibling AABBs still penetrate given pad margins. */
export function siblingsOverlapWithPad(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  padX = GAP_X,
  padY = GAP_Y
): boolean {
  const overlapX = Math.min(ax + aw + padX - bx, bx + bw + padX - ax);
  const overlapY = Math.min(ay + ah + padY - by, by + bh + padY - ay);
  return overlapX > 0 && overlapY > 0;
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
 * Nudges sibling nodes apart when bounding boxes overlap using soft bubble + hard AABB.
 *
 * @param nodes The nodes to de-overlap.
 * @returns A new array of nodes with positions adjusted to prevent overlaps.
 */
export function deOverlapNodes(nodes: CanvasNodeRecord[]): CanvasNodeRecord[] {
  return physicsDeOverlapNodes(nodes);
}

type SizedPos = { x: number; y: number; w: number; h: number };

/**
 * Soft circular personal-space push, then hard AABB penetration resolve.
 * Prefer min-penetration axis so exec lanes stay horizontally readable.
 */
function separateSiblingPair(
  a: SizedPos,
  b: SizedPos,
  padX: number,
  padY: number,
  bubblePad: number
): boolean {
  let moved = false;

  const cxA = a.x + a.w / 2;
  const cyA = a.y + a.h / 2;
  const cxB = b.x + b.w / 2;
  const cyB = b.y + b.h / 2;
  let dx = cxB - cxA;
  let dy = cyB - cyA;
  let dist = Math.hypot(dx, dy);
  const minDist = bubbleRadius(a.w, a.h) + bubbleRadius(b.w, b.h) + bubblePad;

  if (dist < 1e-6) {
    // Identical centers: nudge along +X so hard pass can finish separation.
    dx = 1;
    dy = 0;
    dist = 1;
  }

  if (dist < minDist) {
    const push = (minDist - dist) / 2;
    const nx = dx / dist;
    const ny = dy / dist;
    a.x -= nx * push;
    a.y -= ny * push;
    b.x += nx * push;
    b.y += ny * push;
    moved = true;
  }

  const overlapX = Math.min(a.x + a.w + padX - b.x, b.x + b.w + padX - a.x);
  const overlapY = Math.min(a.y + a.h + padY - b.y, b.y + b.h + padY - a.y);

  if (overlapX > 0 && overlapY > 0) {
    moved = true;
    if (overlapX < overlapY) {
      if (a.x < b.x) {
        b.x += overlapX;
      } else {
        a.x += overlapX;
      }
    } else if (a.y < b.y) {
      b.y += overlapY;
    } else {
      a.y += overlapY;
    }
  }

  return moved;
}

/**
 * Resolves crowding with soft bubble fields then hard AABB clamps.
 * Enforces personal space between sibling nodes inside each parent group.
 */
export function physicsDeOverlapNodes(
  nodes: CanvasNodeRecord[],
  padX = GAP_X,
  padY = GAP_Y,
  maxIterations = PHYSICS_MAX_ITERS,
  bubblePad = BUBBLE_PAD
): CanvasNodeRecord[] {
  const out = nodes.map((n) => ({ ...n }));
  const byParent = new Map<string, CanvasNodeRecord[]>();

  for (const n of out) {
    if (n.type === "group") continue;
    const key = n.parentId ?? "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(n);
  }

  for (const siblings of byParent.values()) {
    if (siblings.length < 2) continue;

    for (let iter = 0; iter < maxIterations; iter++) {
      let moved = false;

      for (let i = 0; i < siblings.length; i++) {
        for (let j = i + 1; j < siblings.length; j++) {
          const na = siblings[i];
          const nb = siblings[j];
          const a: SizedPos = {
            x: na.x,
            y: na.y,
            w: na.width ?? NODE_W,
            h: na.height ?? NODE_H,
          };
          const b: SizedPos = {
            x: nb.x,
            y: nb.y,
            w: nb.width ?? NODE_W,
            h: nb.height ?? NODE_H,
          };

          if (separateSiblingPair(a, b, padX, padY, bubblePad)) {
            moved = true;
            na.x = a.x;
            na.y = a.y;
            nb.x = b.x;
            nb.y = b.y;
          }
        }
      }

      if (!moved) break;
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
    const w = c.width ?? NODE_W;
    const h = c.height ?? NODE_H;
    maxX = Math.max(maxX, c.x + w);
    maxY = Math.max(maxY, c.y + h);
  }

  const width = Math.max(340, maxX + GROUP_PAD);
  const height = Math.max(220, maxY + GROUP_PAD);

  // xyflow requires finite group coordinates; null/undefined collapses children to 0,0.
  group.x = Number.isFinite(group.x) ? group.x : 50;
  group.y = Number.isFinite(group.y) ? group.y : 50;
  group.style = `width: ${width}px; height: ${height}px;`;
  return out;
}

/**
 * Applies soft bubble + hard AABB collision resolution directly to SvelteFlow Node[].
 * Ensures no two sibling nodes occupy the same space or crowd personal space.
 */
export function applyPhysicsToFlowNodes<
  T extends {
    id: string;
    type?: string;
    parentId?: string;
    position: { x: number; y: number };
    width?: number;
    height?: number;
  },
>(
  nodes: T[],
  getNodeSize?: (id: string) => Size | undefined,
  padX = GAP_X,
  padY = GAP_Y,
  maxIterations = PHYSICS_MAX_ITERS,
  bubblePad = BUBBLE_PAD
): T[] {
  const out = nodes.map((n) => ({
    ...n,
    position: { ...n.position },
  }));

  const byParent = new Map<string, T[]>();

  for (const n of out) {
    if (n.type === "group") continue;
    const key = n.parentId ?? "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(n);
  }

  for (const siblings of byParent.values()) {
    if (siblings.length < 2) continue;

    for (let iter = 0; iter < maxIterations; iter++) {
      let moved = false;

      for (let i = 0; i < siblings.length; i++) {
        for (let j = i + 1; j < siblings.length; j++) {
          const na = siblings[i];
          const nb = siblings[j];
          const sizeA = getNodeSize?.(na.id);
          const sizeB = getNodeSize?.(nb.id);

          const a: SizedPos = {
            x: na.position.x,
            y: na.position.y,
            w: na.width ?? sizeA?.width ?? NODE_W,
            h: na.height ?? sizeA?.height ?? NODE_H,
          };
          const b: SizedPos = {
            x: nb.position.x,
            y: nb.position.y,
            w: nb.width ?? sizeB?.width ?? NODE_W,
            h: nb.height ?? sizeB?.height ?? NODE_H,
          };

          if (separateSiblingPair(a, b, padX, padY, bubblePad)) {
            moved = true;
            na.position.x = a.x;
            na.position.y = a.y;
            nb.position.x = b.x;
            nb.position.y = b.y;
          }
        }
      }

      if (!moved) break;
    }
  }

  return out;
}

/**
 * Returns true when any sibling leaf pair still overlaps with bubble-aware padding.
 */
export function flowNodesHaveBubbleOverlaps<
  T extends {
    id: string;
    type?: string;
    parentId?: string;
    position: { x: number; y: number };
    width?: number;
    height?: number;
  },
>(nodes: T[], getNodeSize?: (id: string) => Size | undefined): boolean {
  const byParent = new Map<string, T[]>();
  for (const n of nodes) {
    if (n.type === "group") continue;
    const key = n.parentId ?? "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(n);
  }

  for (const siblings of byParent.values()) {
    for (let i = 0; i < siblings.length; i++) {
      for (let j = i + 1; j < siblings.length; j++) {
        const a = siblings[i];
        const b = siblings[j];
        const sizeA = getNodeSize?.(a.id);
        const sizeB = getNodeSize?.(b.id);
        const wA = a.width ?? sizeA?.width ?? NODE_W;
        const hA = a.height ?? sizeA?.height ?? NODE_H;
        const wB = b.width ?? sizeB?.width ?? NODE_W;
        const hB = b.height ?? sizeB?.height ?? NODE_H;
        if (
          siblingsOverlapWithPad(
            a.position.x,
            a.position.y,
            wA,
            hA,
            b.position.x,
            b.position.y,
            wB,
            hB,
            GAP_X + BUBBLE_PAD / 2,
            GAP_Y + BUBBLE_PAD / 2
          )
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Finalizes the illustrative layout by running bubble de-overlap and then fitting the main group.
 *
 * @param nodes The nodes to layout.
 * @returns The finalized array of nodes.
 */
export function finalizeLayout(nodes: CanvasNodeRecord[]): CanvasNodeRecord[] {
  return fitMainGroup(physicsDeOverlapNodes(nodes));
}

// Keep `separate` referenced for legacy call sites / dead-code clarity in tests.
void separate;
