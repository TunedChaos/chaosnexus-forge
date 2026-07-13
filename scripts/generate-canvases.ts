/**
 * Canvas Generator Script
 * 
 * @module scripts/generate-canvases
 * @description Re-runnable generator: extracts Rhai public function signatures via
 * `chaosnexus-anvil --list-functions`, builds edge-free skeleton graphs, validates,
 * and writes v3 `.chaosnexus-forge/*.canvas.json` sidecars for all bundled scripts.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSkeletonGraph } from "../src/lib/dual_editor/canvas_skeleton.ts";
import { mergeCanvasAssemblyNodes } from "../src/lib/assembly_flow.ts";
import { CANVAS_COVERAGE_TARGETS } from "../src/lib/dual_editor/canvas_coverage_targets.ts";
import {
  buildCanvasMetadata,
  extractEmbeddedCanvasMetadata,
  parseRhaiToFlow,
  stripCanvasMetadata,
  type CanvasMetadata,
} from "../src/lib/parser.ts";
import {
  parseSignaturesJson,
  validateGraph,
  type FnSignature,
  type GraphNode,
  type GraphWire,
} from "../src/lib/graph.ts";
import type { Edge, Node } from "@xyflow/svelte";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CHAOSFORGE_ROOT = resolve(SCRIPT_DIR, "..");
const REPO_ROOT = resolve(CHAOSFORGE_ROOT, "..");
const CHAOSWRENCH_BIN = join(REPO_ROOT, "chaosnexus-anvil/target/debug/anvil");

/** In-scope scripts for canvas coverage (hard-coded include list). */
const CANVAS_TARGETS = CANVAS_COVERAGE_TARGETS;

function listFunctions(absRhaiPath: string): FnSignature[] {
  const json = execFileSync(CHAOSWRENCH_BIN, ["--list-functions", absRhaiPath], {
    encoding: "utf8",
  });
  const { signatures, error } = parseSignaturesJson(json);
  if (error) throw new Error(`${absRhaiPath}: ${error}`);
  return signatures;
}

function toGraphNodes(nodes: Node[]): GraphNode[] {
  return nodes
    .filter((n) => n.type !== "group")
    .map((n) => {
      const data = n.data as { fn?: string; label?: string; kind?: string };
      return {
        id: n.id,
        fn: data.fn ?? data.label ?? n.id,
        kind: (data.kind as GraphNode["kind"]) ?? "function",
      };
    });
}

function toGraphWires(edges: Edge[]): GraphWire[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? undefined,
    targetHandle: e.targetHandle ?? undefined,
    kind: e.type === "execEdge" ? "exec" : "data",
  }));
}

function sortNodes(nodes: CanvasMetadata["nodes"]) {
  return [...nodes].sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeMetadata(meta: CanvasMetadata): CanvasMetadata {
  return {
    version: meta.version,
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
    })),
    edges: [...meta.edges].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function assertValid(
  target: (typeof CANVAS_TARGETS)[number],
  metadata: CanvasMetadata,
  signatures: FnSignature[],
  flowNodes: Node[],
  flowEdges: Edge[]
): void {
  if (metadata.version !== 3) {
    throw new Error(`${target.rhaiPath}: expected version 3, got ${metadata.version}`);
  }

  const errors = validateGraph(
    toGraphNodes(flowNodes),
    toGraphWires(flowEdges),
    signatures,
    true
  ).filter((d) => d.severity === "error");

  if (errors.length > 0) {
    throw new Error(
      `${target.rhaiPath}: graph validation failed:\n${errors.map((e) => e.message).join("\n")}`
    );
  }
}

function assertRoundTrip(
  target: (typeof CANVAS_TARGETS)[number],
  rhaiSource: string,
  metadata: CanvasMetadata,
  signatures: FnSignature[]
): void {
  const stripped = stripCanvasMetadata(rhaiSource);
  const parsed = parseRhaiToFlow(stripped, [], metadata);
  const merged = mergeCanvasAssemblyNodes(parsed.nodes, metadata, signatures);
  const rebuilt = buildCanvasMetadata(merged, parsed.edges);

  const left = normalizeMetadata(metadata);
  const right = normalizeMetadata(rebuilt);

  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`${target.rhaiPath}: round-trip metadata mismatch`);
  }
}

function writeSidecar(absSidecarPath: string, metadata: CanvasMetadata): void {
  mkdirSync(dirname(absSidecarPath), { recursive: true });
  writeFileSync(absSidecarPath, `${JSON.stringify(metadata)}\n`, "utf8");
}

function generateTarget(target: (typeof CANVAS_TARGETS)[number]): void {
  const absRhai = join(REPO_ROOT, target.rhaiPath);
  const absSidecar = join(REPO_ROOT, target.sidecarPath);
  let rhaiSource = readFileSync(absRhai, "utf8");

  const signatures = listFunctions(absRhai);
  const { nodes, edges } = buildSkeletonGraph(signatures);
  const metadata = buildCanvasMetadata(nodes, edges);

  assertValid(target, metadata, signatures, nodes, edges);
  assertRoundTrip(target, rhaiSource, metadata, signatures);
  writeSidecar(absSidecar, metadata);

  if (target.rhaiPath.includes("test_plugin") && extractEmbeddedCanvasMetadata(rhaiSource)) {
    const stripped = stripCanvasMetadata(rhaiSource);
    writeFileSync(absRhai, `${stripped}\n`, "utf8");
    console.log(`  stripped embedded CANVAS_METADATA from ${target.rhaiPath}`);
  }

  const fnCount = metadata.nodes.filter((n) => n.kind === "function" || n.type === "codeNativeNode")
    .length;
  console.log(`OK ${target.rhaiPath} -> ${target.sidecarPath} (${fnCount} function nodes)`);
}

function main(): void {
  console.log(`Repo: ${REPO_ROOT}`);
  console.log(`Engine: ${CHAOSWRENCH_BIN}`);
  let failed = 0;

  for (const target of CANVAS_TARGETS) {
    try {
      generateTarget(target);
    } catch (err) {
      failed += 1;
      console.error(`FAIL ${target.rhaiPath}:`, err);
    }
  }

  if (failed > 0) {
    process.exit(1);
  }
  console.log(`\nGenerated ${CANVAS_TARGETS.length} canvas sidecars.`);
}

main();
