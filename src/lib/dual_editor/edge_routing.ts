// chaosnexus-forge/src/lib/dual_editor/edge_routing.ts
//
// Shared obstacle model and SVG path routing for exec and data canvas edges.

import { findSmartPath, type Obstacle } from "$lib/pathfinder";
import { parseGroupSize } from "./group_geometry";
import {
  getCachedRoute,
  getObstacleVersion,
  routeCacheKey,
  setCachedRoute,
} from "./edge_obstacles";

/** Top strip of a group node that wires must not cross (matches CustomGroupNode header). */
export const GROUP_HEADER_BAND_H = 32;

/**
 * Padding applied around obstacles to prevent edges from routing too close to node bodies.
 */
export const OBSTACLE_PAD = 12;
/**
 * The straight length of the stub segment originating from a pin before routing freely.
 */
export const STUB_LENGTH = 16;

const DEFAULT_NODE_W = 190;
const DEFAULT_NODE_H = 110;

/**
 * Minimal structural representation of a flow node required for routing.
 */
export interface FlowNodeLike {
  /** The unique identifier of the node. */
  id: string;
  /** The type of the node. */
  type?: string;
  /** The parent identifier, if nested inside a group. */
  parentId?: string;
  /** The relative position of the node. */
  position: { x: number; y: number };
  /** The width of the node (if defined). */
  width?: number;
  /** The height of the node (if defined). */
  height?: number;
  /** The measured width and height, if available. */
  measured?: { width?: number; height?: number };
  /** An inline style string to parse size from. */
  style?: string;
}

/**
 * Options used to determine obstacle bounding boxes and routing behaviors.
 */
export interface BuildObstaclesOptions {
  source: string;
  target: string;
  /** When true, first stub step prefers vertical (exec top/bottom pins). */
  verticalFirst?: boolean;
  /** Stable edge id for route caching (optional). */
  edgeId?: string;
  /**
   * When true, never fall back to A* - return the horizontal bezier even if it
   * crosses a node (used mid-drag for GPU/CPU headroom).
   */
  bezierOnly?: boolean;
}

function nodeSize(n: FlowNodeLike): { width: number; height: number } {
  return {
    width: n.measured?.width ?? (typeof n.width === "number" ? n.width : DEFAULT_NODE_W),
    height: n.measured?.height ?? (typeof n.height === "number" ? n.height : DEFAULT_NODE_H),
  };
}

/** 
 * Absolute flow-space origin for a node (adds parent group offset when nested). 
 * 
 * @param n The node to find the origin for.
 * @param byId A map of all nodes by their ID.
 * @returns The absolute X and Y coordinates.
 */
export function absoluteNodeOrigin(
  n: FlowNodeLike,
  byId: Map<string, FlowNodeLike>
): { x: number; y: number } {
  let x = n.position.x;
  let y = n.position.y;
  if (n.parentId) {
    const parent = byId.get(n.parentId);
    if (parent) {
      const p = absoluteNodeOrigin(parent, byId);
      x += p.x;
      y += p.y;
    }
  }
  return { x, y };
}

function inflateObstacle(x: number, y: number, width: number, height: number): Obstacle {
  return {
    x: x - OBSTACLE_PAD,
    y: y - OBSTACLE_PAD,
    width: width + OBSTACLE_PAD * 2,
    height: height + OBSTACLE_PAD * 2,
  };
}

/**
 * Builds routing obstacles: leaf node bodies (excluding source/target) plus each
 * group's header band (not the full group body, so internal wires can still route).
 * 
 * @param rawNodes All available nodes in the flow.
 * @param options Routing options to determine source and target nodes.
 * @returns An array of inflated obstacles to avoid during routing.
 */
export function buildObstacles(
  rawNodes: FlowNodeLike[],
  options: BuildObstaclesOptions
): Obstacle[] {
  const { source, target } = options;
  const byId = new Map(rawNodes.map((n) => [n.id, n]));
  const obstacles: Obstacle[] = [];

  for (const n of rawNodes) {
    if (n.type === "group") {
      const origin = absoluteNodeOrigin(n, byId);
      const size =
        typeof n.width === "number" && typeof n.height === "number"
          ? { width: n.width, height: n.height }
          : parseGroupSize(typeof n.style === "string" ? n.style : undefined);
      obstacles.push(
        inflateObstacle(origin.x, origin.y, size.width, GROUP_HEADER_BAND_H)
      );
      continue;
    }

    if (n.id === source || n.id === target) continue;

    const origin = absoluteNodeOrigin(n, byId);
    const { width, height } = nodeSize(n);
    obstacles.push(inflateObstacle(origin.x, origin.y, width, height));
  }

  return obstacles;
}

/**
 * Computes a coordinate extended outward from a starting point towards a target point.
 * 
 * @param x The starting X coordinate.
 * @param y The starting Y coordinate.
 * @param towardX The target X coordinate to point towards.
 * @param towardY The target Y coordinate to point towards.
 * @param distance The length of the stub segment to compute.
 * @param verticalFirst When true, prefers vertical extension over horizontal when distances are comparable.
 * @returns The computed stub endpoint coordinate.
 */
export function stubPoint(
  x: number,
  y: number,
  towardX: number,
  towardY: number,
  distance: number,
  verticalFirst = false
): { x: number; y: number } {
  const dx = towardX - x;
  const dy = towardY - y;
  const len = Math.hypot(dx, dy) || 1;

  if (verticalFirst) {
    if (Math.abs(dy) >= Math.abs(dx)) {
      return { x, y: y + (Math.sign(dy) || 1) * distance };
    }
    return { x: x + (Math.sign(dx) || 1) * distance, y };
  }

  return {
    x: x + (dx / len) * distance,
    y: y + (dy / len) * distance,
  };
}

/** 
 * Routes an edge through A* and returns an SVG path `d` string (orthogonal fallback). 
 * 
 * @param sourceX The source pin X coordinate.
 * @param sourceY The source pin Y coordinate.
 * @param targetX The target pin X coordinate.
 * @param targetY The target pin Y coordinate.
 * @param rawNodes All flow nodes used to compute obstacles.
 * @param options Routing options.
 * @returns The SVG `d` path string representing the routed edge.
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Simplifies consecutive collinear or near-duplicate points to clean up SVG path generation.
 */
export function simplifyPoints(pts: Point[]): Point[] {
  if (pts.length <= 2) return pts;
  const result: Point[] = [pts[0]];

  for (let i = 1; i < pts.length; i++) {
    const prev = result[result.length - 1];
    const curr = pts[i];

    if (Math.hypot(curr.x - prev.x, curr.y - prev.y) < 0.5) {
      continue;
    }

    if (result.length >= 2) {
      const p0 = result[result.length - 2];
      const isCollinear =
        (Math.abs(p0.x - prev.x) < 0.1 && Math.abs(prev.x - curr.x) < 0.1) ||
        (Math.abs(p0.y - prev.y) < 0.1 && Math.abs(prev.y - curr.y) < 0.1);
      if (isCollinear) {
        result[result.length - 1] = curr;
        continue;
      }
    }

    result.push(curr);
  }

  return result;
}

/**
 * Builds an SVG path string from 2D waypoints, rounding all interior corners with quadratic
 * bezier arcs (`Q`) of up to `borderRadius` pixels to prevent sharp stair-stepping.
 */
export function buildRoundedPath(points: Point[], borderRadius = 16): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  if (points.length === 2) {
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} L ${points[1].x.toFixed(1)} ${points[1].y.toFixed(1)}`;
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const len1 = Math.hypot(v1x, v1y);

    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const len2 = Math.hypot(v2x, v2y);

    if (len1 < 0.001 || len2 < 0.001) {
      d += ` L ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
      continue;
    }

    const r = Math.min(borderRadius, len1 / 2, len2 / 2);

    const startX = curr.x - (v1x / len1) * r;
    const startY = curr.y - (v1y / len1) * r;

    const endX = curr.x + (v2x / len2) * r;
    const endY = curr.y + (v2y / len2) * r;

    d += ` L ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`;
  }

  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

/**
 * Builds tight obstacles with minimal padding (2px) specifically for testing if a smooth
 * bezier curve intersects node bodies, preventing false-positive fallback triggers.
 */
export function buildStrictObstacles(
  rawNodes: FlowNodeLike[],
  options: BuildObstaclesOptions
): Obstacle[] {
  const { source, target } = options;
  const byId = new Map(rawNodes.map((n) => [n.id, n]));
  const obstacles: Obstacle[] = [];

  for (const n of rawNodes) {
    if (n.type === "group") {
      const origin = absoluteNodeOrigin(n, byId);
      const size =
        typeof n.width === "number" && typeof n.height === "number"
          ? { width: n.width, height: n.height }
          : parseGroupSize(typeof n.style === "string" ? n.style : undefined);
      obstacles.push({
        x: origin.x - 2,
        y: origin.y - 2,
        width: size.width + 4,
        height: GROUP_HEADER_BAND_H + 4,
      });
      continue;
    }

    if (n.id === source || n.id === target) continue;

    const origin = absoluteNodeOrigin(n, byId);
    const { width, height } = nodeSize(n);
    obstacles.push({
      x: origin.x - 2,
      y: origin.y - 2,
      width: width + 4,
      height: height + 4,
    });
  }

  return obstacles;
}

/** 
 * Routes an edge through A* and returns an SVG path string with rounded corners.
 * 
 * @param sourceX The source pin X coordinate.
 * @param sourceY The source pin Y coordinate.
 * @param targetX The target pin X coordinate.
 * @param targetY The target pin Y coordinate.
 * @param rawNodes All flow nodes used to compute obstacles.
 * @param options Routing options.
 * @returns The SVG `d` path string representing the routed edge.
 */
export function routeEdgePath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  rawNodes: FlowNodeLike[],
  options: BuildObstaclesOptions
): string {
  const obstacles = buildObstacles(rawNodes, options);
  const verticalFirst = options.verticalFirst ?? false;

  const start = stubPoint(sourceX, sourceY, targetX, targetY, STUB_LENGTH, verticalFirst);
  const end = stubPoint(targetX, targetY, sourceX, sourceY, STUB_LENGTH, verticalFirst);

  const pts = findSmartPath(start.x, start.y, end.x, end.y, obstacles);
  if (pts.length === 0) return "";

  const fullPoints: Point[] = [
    { x: sourceX, y: sourceY },
    start,
    ...pts,
    end,
    { x: targetX, y: targetY },
  ];

  const cleaned = simplifyPoints(fullPoints);
  return buildRoundedPath(cleaned, 16);
}

const BEZIER_SAMPLES = 24;

function cubicAt(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * Unreal-style horizontal cubic spline: control points pull out to the right of
 * the source pin and into the left of the target pin. Returns the SVG `d` plus
 * sampled points for obstacle hit-testing.
 */
function horizontalBezier(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number
): { d: string; samples: Point[] } {
  const p0 = { x: sourceX, y: sourceY };
  const p3 = { x: targetX, y: targetY };
  const k = Math.max(40, Math.abs(targetX - sourceX) * 0.5);
  const p1 = { x: sourceX + k, y: sourceY };
  const p2 = { x: targetX - k, y: targetY };

  const d = `M ${p0.x.toFixed(1)},${p0.y.toFixed(1)} C ${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} ${p3.x.toFixed(1)},${p3.y.toFixed(1)}`;
  const samples: Point[] = [];
  for (let i = 0; i <= BEZIER_SAMPLES; i++) {
    samples.push(cubicAt(i / BEZIER_SAMPLES, p0, p1, p2, p3));
  }
  return { d, samples };
}

function pointInObstacle(p: Point, obstacles: { x: number; y: number; width: number; height: number }[]): boolean {
  for (const o of obstacles) {
    if (p.x >= o.x && p.x <= o.x + o.width && p.y >= o.y && p.y <= o.y + o.height) {
      return true;
    }
  }
  return false;
}

/**
 * Primary edge router: a clean horizontal bezier when it does not cross any node
 * body or group-header band, otherwise the obstacle-avoiding A* path with smooth rounded corners.
 *
 * Results are cached by edge id + rounded endpoints + obstacle version when `edgeId` is set.
 *
 * @param sourceX The source pin X coordinate.
 * @param sourceY The source pin Y coordinate.
 * @param targetX The target pin X coordinate.
 * @param targetY The target pin Y coordinate.
 * @param rawNodes All flow nodes used to compute obstacles.
 * @param options Routing options.
 * @returns The SVG `d` path string representing the routed edge.
 */
export function routeEdge(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  rawNodes: FlowNodeLike[],
  options: BuildObstaclesOptions
): string {
  const bezierOnly = options.bezierOnly === true;
  const edgeId = options.edgeId;

  if (edgeId) {
    const key = routeCacheKey(
      edgeId,
      sourceX,
      sourceY,
      targetX,
      targetY,
      getObstacleVersion(),
      bezierOnly
    );
    const cached = getCachedRoute(key);
    if (cached !== undefined) return cached;
    const path = routeEdgeUncached(sourceX, sourceY, targetX, targetY, rawNodes, options);
    setCachedRoute(key, path);
    return path;
  }

  return routeEdgeUncached(sourceX, sourceY, targetX, targetY, rawNodes, options);
}

function routeEdgeUncached(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  rawNodes: FlowNodeLike[],
  options: BuildObstaclesOptions
): string {
  const bezier = horizontalBezier(sourceX, sourceY, targetX, targetY);
  if (options.bezierOnly) return bezier.d;

  const strictObstacles = buildStrictObstacles(rawNodes, options);
  const blocked = bezier.samples.some((p) => pointInObstacle(p, strictObstacles));
  if (!blocked) return bezier.d;

  return routeEdgePath(sourceX, sourceY, targetX, targetY, rawNodes, options);
}

