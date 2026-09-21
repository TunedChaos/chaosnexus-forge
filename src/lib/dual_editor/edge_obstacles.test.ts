// chaosnexus-forge/src/lib/dual_editor/edge_obstacles.test.ts
//
// Unit tests for obstacle snapshot publishing and route cache keys.

import { describe, expect, it, beforeEach } from "vitest";
import {
  clearRouteCache,
  getCachedRoute,
  getObstacleSnapshot,
  getObstacleVersion,
  publishObstacleSnapshot,
  routeCacheKey,
  setCachedRoute,
  setEdgeRoutingDragActive,
  isEdgeRoutingDragActive,
} from "./edge_obstacles";
import { routeEdge } from "./edge_routing";

describe("edge_obstacles snapshot + cache", () => {
  beforeEach(() => {
    setEdgeRoutingDragActive(false);
    clearRouteCache();
    publishObstacleSnapshot([]);
  });

  it("publishes a defensive copy of node positions", () => {
    const nodes = [{ id: "a", position: { x: 10, y: 20 }, type: "scriptNode" }];
    publishObstacleSnapshot(nodes);
    nodes[0].position.x = 999;
    expect(getObstacleSnapshot()[0].position.x).toBe(10);
  });

  it("bumps version and clears cache on publish", () => {
    const v0 = getObstacleVersion();
    setCachedRoute("k", "M 0 0");
    publishObstacleSnapshot([{ id: "a", position: { x: 0, y: 0 } }]);
    expect(getObstacleVersion()).toBeGreaterThan(v0);
    expect(getCachedRoute("k")).toBeUndefined();
  });

  it("caches routeEdge results by edge id + endpoints + version", () => {
    publishObstacleSnapshot([
      { id: "a", position: { x: 0, y: 0 }, type: "scriptNode" },
      { id: "b", position: { x: 300, y: 0 }, type: "scriptNode" },
    ]);
    const opts = { source: "a", target: "b", edgeId: "e1" };
    const p1 = routeEdge(0, 50, 300, 50, getObstacleSnapshot(), opts);
    const p2 = routeEdge(0, 50, 300, 50, getObstacleSnapshot(), opts);
    expect(p1).toBe(p2);
    expect(p1.length).toBeGreaterThan(0);

    const key = routeCacheKey("e1", 0, 50, 300, 50, getObstacleVersion(), false);
    expect(getCachedRoute(key)).toBe(p1);
  });

  it("bezierOnly skips A* and still returns a path", () => {
    setEdgeRoutingDragActive(true);
    expect(isEdgeRoutingDragActive()).toBe(true);
    const path = routeEdge(0, 0, 100, 0, [], {
      source: "a",
      target: "b",
      edgeId: "e2",
      bezierOnly: true,
    });
    expect(path.startsWith("M ")).toBe(true);
  });
});
