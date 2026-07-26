/**
 * chaosnexus-forge/src/lib/dual_editor/canvas_skeleton.ts
 *
 * Pure, deterministic skeleton graph builder for Rhai plugin manifests. Produces
 * edge-free function-binding canvases (one codeNativeNode per public function,
 * parented under Main Logic) matching the terminal sidecar convention.
 */

import type { Node, Edge } from "@xyflow/svelte";
import type { FnSignature } from "$lib/graph";
import { EXEC_IN, EXEC_OUT } from "./node_catalog";
import { createCatalogNodeByKind } from "./catalog_node_factory";
import { formatGroupStyle } from "./group_geometry";
import { Z_MAIN_GROUP } from "$lib/parser";

/** Stable id for the default Main Logic group. */
export const MAIN_GROUP_ID = "main_group";

/** Main Logic group chrome class (matches parser.ts synthesized group). */
export const MAIN_GROUP_CLASS =
  "main-logic-group border-2 !border-primary/80 bg-primary/5 rounded-xl shadow-lg shadow-primary/20 backdrop-blur-md";

/** Options for configuring the generated skeleton graph. */
export interface SkeletonGraphOptions {
  /** Top-left anchor for Main Logic (default 50, 50). */
  startPosition?: { x: number; y: number };
  /** When true, chains public functions with exec wires (legacy import UI). */
  chainExec?: boolean;
  /** Wrap function nodes in a Main Logic group (default true). */
  includeMainGroup?: boolean;
  /** Deterministic id prefix for function nodes (default "fn"). */
  idPrefix?: string;
}

/** Result of building a skeleton graph, containing generated nodes and edges. */
export interface SkeletonGraphResult {
  nodes: Node[];
  edges: Edge[];
}

/** Deterministic node id for a bound public function. */
export function stableFnNodeId(name: string, prefix = "fn"): string {
  return `${prefix}_${name}`;
}

/**
 * Builds a function-binding skeleton: Main Logic group + one `codeNativeNode`
 * per public signature. Default layout is edge-free (terminal convention).
 */
export function buildSkeletonGraph(
  signatures: FnSignature[],
  opts: SkeletonGraphOptions = {}
): SkeletonGraphResult {
  const start = opts.startPosition ?? { x: 50, y: 50 };
  const chainExec = opts.chainExec ?? false;
  const includeMainGroup = opts.includeMainGroup ?? true;
  const idPrefix = opts.idPrefix ?? "fn";

  const publicSigs = signatures.filter((s) => s.access === "public");
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  const parentId = includeMainGroup ? MAIN_GROUP_ID : undefined;
  const columnX = 30;
  const rowStride = 100;
  let rowY = 45;

  if (includeMainGroup) {
    const memberCount = Math.max(publicSigs.length, 1);
    const width = 320;
    const height = Math.max(200, rowY + memberCount * rowStride + 30);
    const size = { width, height };
    nodes.push({
      id: MAIN_GROUP_ID,
      type: "group",
      data: { label: "Main Logic" },
      position: { x: start.x, y: start.y },
      width: size.width,
      height: size.height,
      style: formatGroupStyle(size),
      class: MAIN_GROUP_CLASS,
      zIndex: Z_MAIN_GROUP,
    });
  }

  let prevExecSource: string | null = null;
  let prevHandle: string | null = null;

  if (chainExec) {
    const event = createCatalogNodeByKind(
      "event",
      { x: start.x + 40, y: start.y + 120 },
      parentId,
      { eventId: "on_plugin_start", label: "on_plugin_start" }
    );
    if (event) {
      event.id = "evt_on_plugin_start";
      nodes.push(event);
      prevExecSource = event.id;
      prevHandle = "then";
      rowY = 45;
    }
  }

  for (const sig of publicSigs) {
    const id = stableFnNodeId(sig.name, idPrefix);
    const fnNode: Node = {
      id,
      type: "codeNativeNode",
      position: { x: columnX, y: rowY },
      parentId,
      data: {
        label: sig.name,
        fn: sig.name,
        kind: "function",
        nodeType: "codeNativeNode",
        params: sig.params,
        stale: false,
      },
    };
    nodes.push(fnNode);

    if (chainExec && prevExecSource && prevHandle) {
      edges.push({
        id: `import_exec_${prevExecSource}_${id}`,
        source: prevExecSource,
        target: id,
        sourceHandle: prevHandle,
        targetHandle: EXEC_IN,
        type: "execEdge",
        style: "stroke: #f4f4f5; stroke-width: 2.5;",
      });
      prevExecSource = id;
      prevHandle = EXEC_OUT;
    }

    rowY += rowStride;
  }

  return { nodes, edges };
}
