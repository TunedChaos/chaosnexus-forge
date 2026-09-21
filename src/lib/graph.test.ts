/**
 * @file graph.test.ts
 * @description Unit coverage for the "Assembly Line" visual scripting model (Phase 6a).
 * Tests cover manifest parsing, node/manifest reconciliation, topological compilation,
 * and graph validation (e.g., arity, duplicates, dangling wires, cycles).
 */

// chaosnexus-forge/src/lib/graph.test.ts

import { describe, it, expect } from "vitest";
import {
  parseSignaturesJson,
  reconcileManifest,
  compileTopology,
  validateGraph,
  validatePinConnection,
  detectExecCycle,
  isControlNode,
  type FnSignature,
  type GraphNode,
  type GraphWire,
} from "./graph";
import { EXEC_IN } from "./dual_editor/node_catalog";

const sig = (name: string, params: string[] = [], access: "public" | "private" = "public"): FnSignature => ({
  name,
  params,
  access,
  doc: "",
});

describe("parseSignaturesJson", () => {
  it("parses a well-formed signature array", () => {
    const json = JSON.stringify([
      { name: "build", params: ["target"], access: "public", doc: "Builds." },
    ]);
    const { signatures, error } = parseSignaturesJson(json);
    expect(error).toBeNull();
    expect(signatures).toHaveLength(1);
    expect(signatures[0]).toMatchObject({ name: "build", params: ["target"], access: "public" });
  });

  it("surfaces the engine error object", () => {
    const { signatures, error } = parseSignaturesJson('{"error":"bad syntax"}');
    expect(signatures).toEqual([]);
    expect(error).toBe("bad syntax");
  });

  it("returns empty for blank input", () => {
    expect(parseSignaturesJson("")).toEqual({ signatures: [], error: null });
  });

  it("flags malformed JSON", () => {
    const { error } = parseSignaturesJson("{not json");
    expect(error).toContain("Malformed");
  });

  it("defaults missing fields defensively", () => {
    const { signatures } = parseSignaturesJson('[{"name":"x"}]');
    expect(signatures[0]).toMatchObject({ name: "x", params: [], access: "public", doc: "" });
  });
});

describe("isControlNode", () => {
  it("identifies branch and iterator nodes", () => {
    expect(isControlNode({ id: "a", fn: "", kind: "branch" })).toBe(true);
    expect(isControlNode({ id: "b", fn: "", kind: "iterator" })).toBe(true);
    expect(isControlNode({ id: "c", fn: "build", kind: "function" })).toBe(false);
  });
});

describe("reconcileManifest", () => {
  it("classifies bound, stale, and unbound functions", () => {
    const nodes: GraphNode[] = [
      { id: "n1", fn: "build" },
      { id: "n2", fn: "deleted_fn" },
    ];
    const signatures = [sig("build", ["target"]), sig("ship", ["artifact"]), sig("secret", [], "private")];

    const { bound, stale, unbound } = reconcileManifest(nodes, signatures);

    expect(bound).toHaveLength(1);
    expect(bound[0].node.id).toBe("n1");
    expect(bound[0].signature.name).toBe("build");

    expect(stale).toHaveLength(1);
    expect(stale[0].id).toBe("n2");

    // "ship" is public + unused; "secret" is private and excluded.
    expect(unbound.map((s) => s.name)).toEqual(["ship"]);
  });

  it("skips control nodes during reconciliation", () => {
    const nodes: GraphNode[] = [{ id: "br", fn: "", kind: "branch" }];
    const { bound, stale } = reconcileManifest(nodes, [sig("build")]);
    expect(bound).toEqual([]);
    expect(stale).toEqual([]);
  });
});

describe("compileTopology", () => {
  it("orders a linear pipeline upstream-first", () => {
    const nodes: GraphNode[] = [
      { id: "c", fn: "c" },
      { id: "a", fn: "a" },
      { id: "b", fn: "b" },
    ];
    const wires: GraphWire[] = [
      { id: "w1", source: "a", target: "b", targetHandle: "x" },
      { id: "w2", source: "b", target: "c", targetHandle: "y" },
    ];
    const plan = compileTopology(nodes, wires);
    expect(plan.errors).toEqual([]);
    expect(plan.order.indexOf("a")).toBeLessThan(plan.order.indexOf("b"));
    expect(plan.order.indexOf("b")).toBeLessThan(plan.order.indexOf("c"));
  });

  it("detects cycles and returns an empty order", () => {
    const nodes: GraphNode[] = [
      { id: "a", fn: "a" },
      { id: "b", fn: "b" },
    ];
    const wires: GraphWire[] = [
      { id: "w1", source: "a", target: "b" },
      { id: "w2", source: "b", target: "a" },
    ];
    const plan = compileTopology(nodes, wires);
    expect(plan.order).toEqual([]);
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0].code).toBe("cycle");
  });

  it("ignores dangling wires when ordering", () => {
    const nodes: GraphNode[] = [{ id: "a", fn: "a" }];
    const wires: GraphWire[] = [{ id: "w1", source: "ghost", target: "a" }];
    const plan = compileTopology(nodes, wires);
    expect(plan.errors).toEqual([]);
    expect(plan.order).toEqual(["a"]);
  });
});

describe("validateGraph", () => {
  it("reports stale bindings", () => {
    const diags = validateGraph([{ id: "n1", fn: "gone" }], [], [sig("build")]);
    expect(diags.some((d) => d.code === "stale-binding" && d.nodeId === "n1")).toBe(true);
  });

  it("flags wires to unknown parameters", () => {
    const nodes: GraphNode[] = [
      { id: "a", fn: "src" },
      { id: "b", fn: "dst" },
    ];
    const wires: GraphWire[] = [{ id: "w1", source: "a", target: "b", targetHandle: "nope" }];
    const diags = validateGraph(nodes, wires, [sig("src"), sig("dst", ["real"])]);
    expect(diags.some((d) => d.code === "unknown-param" && d.wireId === "w1")).toBe(true);
  });

  it("flags duplicate inbound wires to one parameter", () => {
    const nodes: GraphNode[] = [
      { id: "a", fn: "src" },
      { id: "a2", fn: "src" },
      { id: "b", fn: "dst" },
    ];
    const wires: GraphWire[] = [
      { id: "w1", source: "a", target: "b", targetHandle: "x" },
      { id: "w2", source: "a2", target: "b", targetHandle: "x" },
    ];
    const diags = validateGraph(nodes, wires, [sig("src"), sig("dst", ["x"])]);
    expect(diags.some((d) => d.code === "duplicate-param")).toBe(true);
  });

  it("warns about unconnected parameters", () => {
    const nodes: GraphNode[] = [{ id: "b", fn: "dst" }];
    const diags = validateGraph(nodes, [], [sig("dst", ["x"])]);
    const warn = diags.find((d) => d.code === "unconnected-param");
    expect(warn?.severity).toBe("warning");
  });

  it("suppresses stale-binding diagnostics when the manifest is unknown", () => {
    const nodes: GraphNode[] = [{ id: "n1", fn: "gone" }];
    const known = validateGraph(nodes, [], [], true);
    const unknown = validateGraph(nodes, [], [], false);
    expect(known.some((d) => d.code === "stale-binding")).toBe(true);
    expect(unknown.some((d) => d.code === "stale-binding")).toBe(false);
  });

  it("flags dangling wires", () => {
    const nodes: GraphNode[] = [{ id: "a", fn: "src" }];
    const wires: GraphWire[] = [{ id: "w1", source: "a", target: "ghost" }];
    const diags = validateGraph(nodes, wires, [sig("src")]);
    expect(diags.some((d) => d.code === "dangling-wire")).toBe(true);
  });

  it("propagates cycle diagnostics", () => {
    const nodes: GraphNode[] = [
      { id: "a", fn: "a" },
      { id: "b", fn: "b" },
    ];
    const wires: GraphWire[] = [
      { id: "w1", source: "a", target: "b" },
      { id: "w2", source: "b", target: "a" },
    ];
    const diags = validateGraph(nodes, wires, [sig("a"), sig("b")]);
    expect(diags.some((d) => d.code === "cycle")).toBe(true);
  });

  it("detects exec-flow cycles separately from data topo", () => {
    const nodes: GraphNode[] = [
      { id: "e", fn: "", kind: "event" },
      { id: "a", fn: "", kind: "sequence" },
    ];
    const wires: GraphWire[] = [
      { id: "x", source: "e", target: "a", kind: "exec" },
      { id: "y", source: "a", target: "e", kind: "exec" },
    ];
    expect(detectExecCycle(nodes, wires).length).toBeGreaterThan(0);
    const diags = validateGraph(nodes, wires, []);
    expect(diags.some((d) => d.code === "exec-cycle")).toBe(true);
  });

  it("warns when exec wires exist without an event root", () => {
    const nodes: GraphNode[] = [{ id: "a", fn: "", kind: "sequence" }];
    const wires: GraphWire[] = [{ id: "w", source: "a", target: "a", kind: "exec" }];
    const diags = validateGraph(nodes, wires, []);
    expect(diags.some((d) => d.code === "missing-event")).toBe(true);
  });
});

describe("validatePinConnection", () => {
  it("rejects data wire to exec input", () => {
    const err = validatePinConnection("literal", "value", "branch", EXEC_IN, "data");
    expect(err).toContain("execution pin");
  });

  it("allows exec wire to exec_in", () => {
    expect(validatePinConnection("event", "then", "branch", EXEC_IN, "exec")).toBeNull();
  });
});
