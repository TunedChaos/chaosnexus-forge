/**
 * chaosnexus-forge/src/lib/dual_editor/canvas_generation.test.ts
 *
 * Data-driven validation matrix for committed bundled canvas sidecars.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CANVAS_COVERAGE_TARGETS } from "./canvas_coverage_targets";
import { mergeCanvasAssemblyNodes } from "$lib/assembly_flow";
import {
  buildCanvasMetadata,
  extractEmbeddedCanvasMetadata,
  parseRhaiToFlow,
  stripCanvasMetadata,
  type CanvasMetadata,
} from "$lib/parser";
import { validateGraph } from "$lib/graph";

const REPO_ROOT = resolve(process.cwd(), "..");

function readRepo(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

function sortNodes(nodes: CanvasMetadata["nodes"]) {
  return [...nodes].sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeMetadata(meta: CanvasMetadata): CanvasMetadata {
  return {
    version: meta.version,
    displayOnly: meta.displayOnly,
    nodes: sortNodes(meta.nodes).map((n) => ({
      id: n.id,
      label: n.label,
      x: n.x,
      y: n.y,
      type: n.type,
      parentId: n.parentId,
      style: n.style,
      class: n.class,
      fn: n.fn,
      kind: n.kind,
      pins: n.pins,
      scriptBody: n.scriptBody,
      varName: n.varName,
      eventId: n.eventId,
    })),
    edges: [...meta.edges]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        kind: e.kind,
      })),
  };
}

function signaturesFromSidecar(meta: CanvasMetadata) {
  return meta.nodes
    .filter((n) => n.type !== "group" && (n.kind === "function" || n.type === "codeNativeNode"))
    .map((n) => ({
      name: n.fn ?? n.label,
      params: [] as string[],
      access: "public" as const,
      doc: "",
    }));
}

describe("bundled canvas sidecars", () => {
  it.each(CANVAS_COVERAGE_TARGETS.map((t) => [t.rhaiPath, t] as const))(
    "%s sidecar is v3, valid, and round-trips",
    (_label, target) => {
      const sidecarAbs = join(REPO_ROOT, target.sidecarPath);
      expect(existsSync(sidecarAbs), `missing sidecar ${target.sidecarPath}`).toBe(true);

      const rhaiSource = readRepo(target.rhaiPath);
      const metadata = JSON.parse(readFileSync(sidecarAbs, "utf8")) as CanvasMetadata;

      expect(metadata.version).toBe(3);

      if (metadata.displayOnly) {
        expect(metadata.edges.length).toBeGreaterThan(0);
        expect(metadata.nodes.filter((n) => n.type !== "group").length).toBeGreaterThan(0);
      } else {
        expect(metadata.edges).toEqual([]);
      }

      const signatures = signaturesFromSidecar(metadata);
      if (!metadata.displayOnly) {
        expect(signatures.length).toBeGreaterThan(0);
      }

      for (const edge of metadata.edges) {
        expect(metadata.nodes.some((n) => n.id === edge.source)).toBe(true);
        expect(metadata.nodes.some((n) => n.id === edge.target)).toBe(true);
      }

      const graphNodes = metadata.nodes
        .filter((n) => n.type !== "group")
        .map((n) => ({
          id: n.id,
          fn: n.fn ?? n.label,
          kind: (n.kind ?? "function") as "function",
        }));

      const graphEdges = metadata.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        type: e.kind === "exec" ? "execEdge" : "tacticalEdge",
      }));

      const errors = metadata.displayOnly
        ? []
        : validateGraph(graphNodes, graphEdges, signatures, true).filter(
            (d) => d.severity === "error"
          );
      expect(errors).toEqual([]);

      const stripped = stripCanvasMetadata(rhaiSource);
      const parsed = parseRhaiToFlow(stripped, [], metadata);
      const merged = mergeCanvasAssemblyNodes(parsed.nodes, metadata, signatures);
      const rebuilt = buildCanvasMetadata(merged, parsed.edges, {
        displayOnly: metadata.displayOnly,
      });

      if (metadata.displayOnly) {
        expect(rebuilt.displayOnly).toBe(true);
        expect(rebuilt.edges.length).toBe(metadata.edges.length);
        expect(rebuilt.nodes.filter((n) => n.type !== "group").length).toBe(
          metadata.nodes.filter((n) => n.type !== "group").length
        );
      } else {
        expect(normalizeMetadata(rebuilt)).toEqual(normalizeMetadata(metadata));
      }

      if (target.rhaiPath.includes("test_plugin")) {
        expect(extractEmbeddedCanvasMetadata(rhaiSource)).toBeNull();
      }
    }
  );
});
