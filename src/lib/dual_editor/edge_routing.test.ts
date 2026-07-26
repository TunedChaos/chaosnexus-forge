// chaosnexus-forge/src/lib/dual_editor/edge_routing.test.ts

/**
 * @module
 * @description Unit tests for the orthogonal A* fallback and Bezier curve routing
 * logic used for drawing edges around nodes.
 */
import { describe, expect, it } from "vitest";
import {
  buildObstacles,
  GROUP_HEADER_BAND_H,
  routeEdge,
  routeEdgePath,
  type FlowNodeLike,
} from "./edge_routing";

/** A mock main group for bounding obstacles. */
const mainGroup: FlowNodeLike = {
  id: "main_group",
  type: "group",
  position: { x: 50, y: 50 },
  width: 600,
  height: 400,
  style: "width: 600px; height: 400px;",
};

/** A mock left-side node used as an edge source. */
const left: FlowNodeLike = {
  id: "left",
  position: { x: 30, y: 120 },
  parentId: "main_group",
  width: 220,
  height: 120,
};

/** A mock right-side node used as an edge target. */
const right: FlowNodeLike = {
  id: "right",
  position: { x: 330, y: 120 },
  parentId: "main_group",
  width: 220,
  height: 120,
};

describe("edge_routing buildObstacles", () => {
  it("includes group header band obstacles", () => {
    const obstacles = buildObstacles([mainGroup, left, right], {
      source: "left",
      target: "right",
    });
    const header = obstacles.find((o) => o.width > 500 && o.height < GROUP_HEADER_BAND_H + 40);
    expect(header).toBeDefined();
  });
});

describe("edge_routing routeEdgePath", () => {
  it("produces a routed SVG path between distant nodes", () => {
    const nodes = [mainGroup, left, right];
    const d = routeEdgePath(140, 180, 440, 180, nodes, {
      source: "left",
      target: "right",
      verticalFirst: true,
    });
    expect(d.length).toBeGreaterThan(0);
    expect(d.startsWith("M")).toBe(true);
  });
});

describe("edge_routing routeEdge", () => {
  it("returns a clean cubic bezier when no obstacle blocks the wire", () => {
    // Source/target pins sit clear of any other node body.
    const d = routeEdge(250, 180, 330, 180, [mainGroup, left, right], {
      source: "left",
      target: "right",
    });
    expect(d).toContain("C");
  });

  it("falls back to orthogonal A* routing when an obstacle sits on the straight line", () => {
    // A blocker node directly between source and target forces the A* fallback.
    const blocker: FlowNodeLike = {
      id: "blocker",
      position: { x: 250, y: 140 },
      parentId: "main_group",
      width: 120,
      height: 120,
    };
    const d = routeEdge(180, 200, 520, 200, [mainGroup, left, right, blocker], {
      source: "left",
      target: "right",
    });
    expect(d.length).toBeGreaterThan(0);
    expect(d).not.toContain("C");
  });
});
