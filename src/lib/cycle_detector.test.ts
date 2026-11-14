// chaosnexus-forge/src/lib/cycle_detector.test.ts

import { describe, it, expect } from "vitest";
import type { Edge } from "@xyflow/svelte";
import { wouldCreateCycle, getCyclicEdges } from "./cycle_detector";

describe("cycle_detector tests", () => {
  it("should not detect cycles on a simple tree", () => {
    const edges: Edge[] = [
      { id: "e1", source: "node_1", target: "node_2" },
      { id: "e2", source: "node_2", target: "node_3" },
      { id: "e3", source: "node_1", target: "node_4" },
    ];

    expect(wouldCreateCycle("node_3", "node_4", edges)).toBe(false);
    expect(wouldCreateCycle("node_4", "node_2", edges)).toBe(false);
  });

  it("should detect self-loops as cycles", () => {
    const edges: Edge[] = [];
    expect(wouldCreateCycle("node_1", "node_1", edges)).toBe(true);
  });

  it("should detect a simple direct cycle", () => {
    const edges: Edge[] = [{ id: "e1", source: "node_1", target: "node_2" }];

    // Node 2 pointing back to Node 1 should create a cycle
    expect(wouldCreateCycle("node_2", "node_1", edges)).toBe(true);
  });

  it("should detect indirect cycles", () => {
    const edges: Edge[] = [
      { id: "e1", source: "node_1", target: "node_2" },
      { id: "e2", source: "node_2", target: "node_3" },
      { id: "e3", source: "node_3", target: "node_4" },
    ];

    // node_4 -> node_1 would complete a cycle
    expect(wouldCreateCycle("node_4", "node_1", edges)).toBe(true);
    // node_4 -> node_2 would complete a cycle
    expect(wouldCreateCycle("node_4", "node_2", edges)).toBe(true);
  });

  it("should identify cyclic edges correctly", () => {
    const edges: Edge[] = [
      { id: "e1", source: "node_1", target: "node_2" },
      { id: "e2", source: "node_2", target: "node_3" },
      { id: "e3", source: "node_3", target: "node_1" }, // cyclic
      { id: "e4", source: "node_3", target: "node_4" }, // non-cyclic
    ];

    const cyclicEdges = getCyclicEdges(edges);
    expect(cyclicEdges.has("e1")).toBe(true);
    expect(cyclicEdges.has("e2")).toBe(true);
    expect(cyclicEdges.has("e3")).toBe(true);
    expect(cyclicEdges.has("e4")).toBe(false);
  });
});
