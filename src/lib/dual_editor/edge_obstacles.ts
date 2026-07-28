// chaosnexus-forge/src/lib/dual_editor/edge_obstacles.ts
//
// Shared obstacle snapshot for canvas edge routing. Edges read this instead of
// stamping the full nodes array into every edge `data` on each position tick.

import { writable } from "svelte/store";

/** Minimal node shape needed for obstacle publishing (mirrors FlowNodeLike). */
export interface ObstacleNodeLike {
  id: string;
  type?: string;
  parentId?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  measured?: { width?: number; height?: number };
  style?: string;
}

/** Current obstacle nodes used by edge routers (flow-space positions). */
let snapshot: ObstacleNodeLike[] = [];
/** Bumped whenever the snapshot is replaced (invalidates route cache). */
let version = 0;
/** Reactive handle so edge components re-derive paths after publish. */
export const obstacleVersionStore = writable(0);
/** When true, routers skip A* and use bezier-only paths (mid-drag). */
let dragActive = false;
/** Reactive drag flag for edge components. */
export const edgeRoutingDragStore = writable(false);

/**
 * Publishes a new obstacle snapshot from the live flow node list.
 * Call on layout settle, parse commit, and drag-stop - not every spring frame.
 *
 * @param nodes Current Svelte Flow nodes (groups + leaves).
 */
export function publishObstacleSnapshot(nodes: ObstacleNodeLike[]): void {
  // Shallow-copy positions so later in-place flow mutations do not silently
  // mutate the snapshot mid-route without bumping the version.
  snapshot = nodes.map((n) => ({
    id: n.id,
    type: n.type,
    parentId: n.parentId,
    position: { x: n.position.x, y: n.position.y },
    width: n.width,
    height: n.height,
    measured: n.measured ? { ...n.measured } : undefined,
    style: n.style,
  }));
  version += 1;
  obstacleVersionStore.set(version);
  clearRouteCache();
}

/** Returns the last published obstacle nodes (may be empty before first publish). */
export function getObstacleSnapshot(): ObstacleNodeLike[] {
  return snapshot;
}

/** Monotonic obstacle version used as a route-cache key component. */
export function getObstacleVersion(): number {
  return version;
}

/**
 * Enables or disables bezier-only routing (skip A* while a node drag is active).
 *
 * @param active True while the user is dragging one or more nodes.
 */
export function setEdgeRoutingDragActive(active: boolean): void {
  if (dragActive === active) return;
  dragActive = active;
  edgeRoutingDragStore.set(active);
  clearRouteCache();
}

/** True when edge routers should skip A* fallback. */
export function isEdgeRoutingDragActive(): boolean {
  return dragActive;
}

// --- Route cache (keyed by edge geometry + obstacle version) ---

const routeCache = new Map<string, string>();

function roundCoord(n: number): number {
  return Math.round(n * 2) / 2;
}

/**
 * Builds a stable cache key for a routed edge path.
 */
export function routeCacheKey(
  edgeId: string,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  obstacleVersion: number,
  bezierOnly: boolean
): string {
  return `${edgeId}|${roundCoord(sourceX)},${roundCoord(sourceY)}|${roundCoord(targetX)},${roundCoord(targetY)}|v${obstacleVersion}|b${bezierOnly ? 1 : 0}`;
}

/** Returns a cached SVG path if present. */
export function getCachedRoute(key: string): string | undefined {
  return routeCache.get(key);
}

/** Stores a routed SVG path in the cache. */
export function setCachedRoute(key: string, path: string): void {
  routeCache.set(key, path);
}

/** Clears all cached edge paths (called when obstacles change). */
export function clearRouteCache(): void {
  routeCache.clear();
}
