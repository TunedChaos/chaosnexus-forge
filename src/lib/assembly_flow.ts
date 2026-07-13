// chaosnexus-forge/src/lib/assembly_flow.ts
//
// Enriches Svelte Flow nodes with assembly-line manifest data (params, stale
// flags) and exposes helpers for adding function-bound nodes from the palette.

import type { Node } from "@xyflow/svelte";
import type { FnSignature, GraphDiagnostic } from "./graph";
import { RETURN_HANDLE, reconcileManifest, type GraphNode } from "./graph";
import type { CanvasMetadata } from "./parser";
import {
  catalogByKind,
  catalogPinsToDescriptors,
} from "./dual_editor/node_catalog";

/**
 * Applies manifest signatures to flow nodes (params, stale binding flags).
 *
 * `manifestKnown` guards stale-flagging: when the engine manifest has not yet
 * loaded (or its fetch failed), we have no ground truth about which functions
 * exist, so flagging every node as a hard "stale binding" error is a false
 * negative. Stale is only asserted once a manifest is known for the tab.
 *
 * @param nodes - The Svelte Flow nodes to enrich.
 * @param signatures - The list of known function signatures from the engine.
 * @param manifestKnown - Whether the manifest is known to be fully loaded (default: true).
 * @returns A new array of nodes with enriched data.
 */
export function enrichNodesWithManifest(
  nodes: Node[],
  signatures: FnSignature[],
  manifestKnown = true
): Node[] {
  const graphNodes: GraphNode[] = nodes
    .filter((n) => n.type !== "group")
    .map((n) => {
      const data = n.data as { fn?: string; label?: string; kind?: string };
      return {
        id: n.id,
        fn: data.fn ?? data.label ?? n.id,
        kind: (data.kind as GraphNode["kind"]) ?? "function",
      };
    });

  const { bound, stale } = reconcileManifest(graphNodes, signatures);
  const boundById = new Map(bound.map((b) => [b.node.id, b.signature]));
  const staleIds = new Set(stale.map((s) => s.id));

  return nodes.map((n) => {
    if (n.type === "group") return n;
    const sig = boundById.get(n.id);
    const data = n.data as Record<string, unknown>;
    return {
      ...n,
      data: {
        ...data,
        params: sig?.params ?? data.params,
        stale: manifestKnown && staleIds.has(n.id),
        fn: data.fn ?? sig?.name,
      },
    };
  });
}

/** 
 * Creates a new assembly-line function node descriptor for the canvas. 
 *
 * @param signature - The function signature to bind this node to.
 * @param position - The {x, y} position of the node on the canvas.
 * @param parentId - Optional ID of the parent group node.
 * @returns A Svelte Flow node initialized for an assembly-line function.
 */
export function createAssemblyNode(
  signature: FnSignature,
  position: { x: number; y: number },
  parentId?: string
): Node {
  const id = `fn_${signature.name}_${Date.now()}`;
  return {
    id,
    type:
      signature.name === "branch" || signature.name === "iterator"
        ? "codeNativeNode"
        : "codeNativeNode",
    data: {
      label: signature.name,
      fn: signature.name,
      kind: "function",
      nodeType: "codeNativeNode",
      params: signature.params,
      stale: false,
    },
    position,
    parentId,
  };
}

/** 
 * Creates a control-flow node (branch or iterator). 
 *
 * @param kind - The control flow kind ("branch" or "iterator").
 * @param position - The {x, y} position of the node on the canvas.
 * @param parentId - Optional ID of the parent group node.
 * @returns A Svelte Flow node initialized for control flow.
 */
export function createControlNode(
  kind: "branch" | "iterator",
  position: { x: number; y: number },
  parentId?: string
): Node {
  const id = `${kind}_${Date.now()}`;
  const params =
    kind === "branch"
      ? ["condition", "payload"]
      : ["items"];
  const outputs = kind === "branch" ? ["true", "false"] : [RETURN_HANDLE];
  return {
    id,
    type: kind === "branch" ? "branchNode" : "iteratorNode",
    data: {
      label: kind === "branch" ? "Branch" : "Iterator",
      fn: "",
      kind,
      nodeType: kind === "branch" ? "branchNode" : "iteratorNode",
      params,
      outputs,
      stale: false,
    },
    position,
    parentId,
  };
}

/** Supported literal value types and their default payloads. */
export type LiteralValueType = "string" | "int" | "float" | "bool" | "json";

const LITERAL_DEFAULTS: Record<LiteralValueType, unknown> = {
  string: "",
  int: 0,
  float: 0,
  bool: false,
  json: {},
};

/** 
 * Creates a constant-source literal node feeding a downstream parameter. 
 *
 * @param valueType - The literal type for the node (e.g. "string", "int").
 * @param position - The {x, y} position of the node on the canvas.
 * @param parentId - Optional ID of the parent group node.
 * @returns A Svelte Flow node initialized for a literal value.
 */
export function createLiteralNode(
  valueType: LiteralValueType,
  position: { x: number; y: number },
  parentId?: string
): Node {
  const id = `literal_${Date.now()}`;
  return {
    id,
    type: "literalNode",
    data: {
      label: "Literal",
      fn: "",
      kind: "literal",
      nodeType: "literalNode",
      value: LITERAL_DEFAULTS[valueType],
      valueType,
      stale: false,
    },
    position,
    parentId,
  };
}

/** 
 * Applies graph validation messages onto node `graphError` data for on-canvas surfacing. 
 *
 * @param nodes - The current flow nodes.
 * @param diagnostics - A list of diagnostic messages from graph validation.
 * @returns A new array of nodes with `graphError` fields populated where applicable.
 */
export function applyGraphDiagnostics(nodes: Node[], diagnostics: GraphDiagnostic[]): Node[] {
  const byNode = new Map<string, string[]>();
  for (const d of diagnostics) {
    if (!d.nodeId) continue;
    const list = byNode.get(d.nodeId) ?? [];
    list.push(d.message);
    byNode.set(d.nodeId, list);
  }
  return nodes.map((n) => {
    const errors = byNode.get(n.id);
    const data = n.data as Record<string, unknown>;
    if (!errors?.length) {
      if (data.graphError === undefined) return n;
      const { graphError: _removed, ...rest } = data;
      return { ...n, data: rest };
    }
    return { ...n, data: { ...data, graphError: errors.join("; ") } };
  });
}

/** 
 * Merges canvas v3 nodes that may not have Rhai anchors yet. 
 *
 * @param flowNodes - The current flow nodes.
 * @param canvas - The canvas metadata containing nodes and edges.
 * @param signatures - The list of known function signatures.
 * @returns A new array of nodes merging existing flow nodes with canvas v3 nodes.
 */
export function mergeCanvasAssemblyNodes(
  flowNodes: Node[],
  canvas: CanvasMetadata | null,
  signatures: FnSignature[]
): Node[] {
  if (!canvas?.nodes?.length) return flowNodes;

  const existingIds = new Set(flowNodes.map((n) => n.id));
  const sigByName = new Map(signatures.map((s) => [s.name, s]));
  const merged = [...flowNodes];

  for (const cn of canvas.nodes) {
    if (cn.type === "group" || existingIds.has(cn.id)) continue;
    const fnName = cn.fn ?? cn.label;
    const sig = sigByName.get(fnName);
    const kind = cn.kind ?? "function";
    const catalog = catalogByKind(kind);

    if (catalog) {
      merged.push({
        id: cn.id,
        type: catalog.flowType,
        data: {
          label: cn.label || catalog.title,
          fn: fnName,
          kind,
          nodeType: catalog.flowType,
          pins: cn.pins ?? catalogPinsToDescriptors(catalog.pins),
          value: cn.value,
          valueType: cn.valueType,
          scriptBody: cn.scriptBody,
          operatorId: cn.operatorId,
          varName: cn.varName,
          eventId: cn.eventId,
          stale: false,
        },
        position: { x: cn.x, y: cn.y },
        parentId: cn.parentId,
      });
      existingIds.add(cn.id);
      continue;
    }

    // Literal nodes are canvas-only constant sources; restore their payload.
    if (kind === "literal") {
      merged.push({
        id: cn.id,
        type: "literalNode",
        data: {
          label: cn.label || "Literal",
          fn: "",
          kind,
          nodeType: "literalNode",
          value: cn.value,
          valueType: typeof cn.valueType === "string" ? cn.valueType : "string",
          stale: false,
        },
        position: { x: cn.x, y: cn.y },
        parentId: cn.parentId,
      });
      existingIds.add(cn.id);
      continue;
    }

    const nodeType =
      kind === "branch" ? "branchNode" : kind === "iterator" ? "iteratorNode" : "codeNativeNode";

    merged.push({
      id: cn.id,
      type: nodeType,
      data: {
        label: cn.label || fnName,
        fn: fnName,
        kind,
        nodeType,
        params: sig?.params ?? (kind === "branch" ? ["condition", "payload"] : kind === "iterator" ? ["items"] : []),
        stale: !sig && kind === "function",
      },
      position: { x: cn.x, y: cn.y },
      parentId: cn.parentId,
    });
    existingIds.add(cn.id);
  }

  return merged;
}
