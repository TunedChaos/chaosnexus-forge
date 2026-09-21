// chaosnexus-forge/src/lib/assembly_flow.test.ts

import { describe, it, expect } from "vitest";
import { enrichNodesWithManifest, mergeCanvasAssemblyNodes } from "./assembly_flow";
import type { FnSignature } from "./graph";

/**
 * Helper to create a mock function signature for testing.
 *
 * @param name - The name of the function.
 * @param params - The list of parameter names.
 * @returns A mocked FnSignature.
 */
const sig = (name: string, params: string[] = []): FnSignature => ({
  name,
  params,
  access: "public",
  doc: "",
});

describe("enrichNodesWithManifest", () => {
  it("adds params and stale flags", () => {
    const nodes = [
      {
        id: "n1",
        type: "codeNativeNode",
        data: { label: "build", fn: "build" },
        position: { x: 0, y: 0 },
      },
      {
        id: "n2",
        type: "codeNativeNode",
        data: { label: "gone", fn: "gone" },
        position: { x: 0, y: 0 },
      },
    ] as any[];
    const enriched = enrichNodesWithManifest(nodes, [sig("build", ["target"])]);
    expect((enriched[0].data as any).params).toEqual(["target"]);
    expect((enriched[0].data as any).stale).toBe(false);
    expect((enriched[1].data as any).stale).toBe(true);
  });

  it("suppresses stale flags when the manifest is unknown", () => {
    const nodes = [
      {
        id: "n1",
        type: "codeNativeNode",
        data: { label: "execute", fn: "execute" },
        position: { x: 0, y: 0 },
      },
    ] as any[];
    const enriched = enrichNodesWithManifest(nodes, [], false);
    expect((enriched[0].data as any).stale).toBe(false);
  });
});

describe("mergeCanvasAssemblyNodes", () => {
  it("adds canvas-only function nodes from metadata", () => {
    const flow = [
      {
        id: "n1",
        type: "codeNativeNode",
        data: { label: "a", fn: "a" },
        position: { x: 0, y: 0 },
      },
    ] as any[];
    const canvas = {
      version: 2,
      nodes: [
        { id: "n1", label: "a", x: 0, y: 0, fn: "a" },
        { id: "n2", label: "ship", x: 50, y: 50, fn: "ship" },
      ],
      edges: [],
    };
    const merged = mergeCanvasAssemblyNodes(flow, canvas, [sig("a"), sig("ship", ["artifact"])]);
    expect(merged).toHaveLength(2);
    expect(merged[1].id).toBe("n2");
    expect((merged[1].data as any).params).toEqual(["artifact"]);
  });
});
