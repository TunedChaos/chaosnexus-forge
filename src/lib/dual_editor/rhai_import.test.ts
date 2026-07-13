/**
 * @file rhai_import.test.ts
 *
 * Tests for the Rhai manifest importer.
 */
import { describe, expect, it } from "vitest";
import { importRhaiManifestToGraph } from "./rhai_import";
import { MAIN_GROUP_ID } from "./canvas_skeleton";
import type { FnSignature } from "$lib/graph";

const sig = (name: string): FnSignature => ({
  name,
  params: [],
  access: "public",
  doc: "",
});

describe("rhai_import", () => {
  it("builds edge-free Main Logic group with deterministic function nodes", () => {
    const { nodes, edges } = importRhaiManifestToGraph([sig("step_a"), sig("step_b")]);
    expect(nodes.find((n) => n.id === MAIN_GROUP_ID)?.type).toBe("group");
    expect(nodes.filter((n) => n.type === "codeNativeNode")).toHaveLength(2);
    expect(nodes.map((n) => n.id)).toContain("fn_step_a");
    expect(nodes.map((n) => n.id)).toContain("fn_step_b");
    expect(edges).toHaveLength(0);
  });

  it("skips private functions", () => {
    const { nodes } = importRhaiManifestToGraph([
      { name: "hidden", params: [], access: "private", doc: "" },
    ]);
    expect(nodes.filter((n) => n.type === "codeNativeNode")).toHaveLength(0);
  });

  it("supports legacy chained exec import when chainExec is true", () => {
    const { nodes, edges } = importRhaiManifestToGraph(
      [sig("step_a"), sig("step_b")],
      { x: 120, y: 120 },
      { chainExec: true }
    );
    expect(nodes.some((n) => n.id === "evt_on_plugin_start")).toBe(true);
    expect(edges.every((e) => e.type === "execEdge")).toBe(true);
    expect(edges).toHaveLength(2);
  });
});
