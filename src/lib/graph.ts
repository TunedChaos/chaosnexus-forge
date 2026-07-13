// chaosnexus-forge/src/lib/graph.ts
//
// Vhai visual scripting model (Phase 7+).
//
// Architecture (the Co-Manifest pair):
//   * `<plugin>.rhai`         - a clean library of decoupled functions (Actuators).
//   * `<plugin>.canvas.json`  - the topology mesh (exec + data wires, node bindings).
//
// Execution uses first-class execution pins (white exec wires) for control flow
// and typed data pins for payloads. The chaosnexus-anvil exec VM walks exec edges
// from Event nodes; data wires satisfy parameter inputs on demand.
import type { CanvasNodeKind } from "./dual_editor/canvas_schema";
import { EXEC_IN, EXEC_OUT } from "./dual_editor/node_catalog";
import { catalogByKind } from "./dual_editor/node_catalog";

/** Wire kind: execution flow vs data payload. */
export type WireKind = "exec" | "data";

/** Visibility of a script function (mirrors the engine `FnAccess`). */
export type FnAccess = "public" | "private";

/** A function signature extracted from the Rhai AST by the engine. */
export interface FnSignature {
  /** Function name; the identifier a node binds to. */
  name: string;
  /** Ordered parameter names; each maps 1:1 to an inbound data handle. */
  params: string[];
  /** Declared visibility. */
  access: FnAccess;
  /** Joined leading doc comments (may be empty). */
  doc: string;
}

/** The kind of canvas node. Control nodes are understood by the executor. */
export type GraphNodeKind = CanvasNodeKind | "function" | "code-native";

/** Output handle id used for a node's single return payload. */
export const RETURN_HANDLE = "return";

/** A topology node: binds a canvas node id to a Rhai function. */
export interface GraphNode {
  /** Canvas-stable node id. */
  id: string;
  /** Bound Rhai function name (the Actuator this node invokes). */
  fn: string;
  /** Node kind; defaults to "function" when omitted. */
  kind?: GraphNodeKind;
}

/**
 * A directed wire. `targetHandle` is the destination parameter name; a missing
 * handle means the payload is passed positionally to the first free parameter.
 */
export interface GraphWire {
  id: string;
  source: string;
  sourceHandle?: string | null;
  target: string;
  targetHandle?: string | null;
  /** v3: exec vs data wire; defaults to "data" when absent. */
  kind?: WireKind;
}

/** Severity of a graph diagnostic. */
export type DiagnosticSeverity = "error" | "warning";

/** A single validation finding, attributable to a node or a wire. */
export interface GraphDiagnostic {
  severity: DiagnosticSeverity;
  /** Stable code for programmatic handling / styling. */
  code:
    | "stale-binding"
    | "cycle"
    | "exec-cycle"
    | "pin-mismatch"
    | "unknown-param"
    | "duplicate-param"
    | "unconnected-param"
    | "dangling-wire"
    | "missing-event";
  message: string;
  nodeId?: string;
  wireId?: string;
}

/** A node bound to its resolved signature. */
export interface BoundNode {
  node: GraphNode;
  signature: FnSignature;
}

/** Result of reconciling canvas nodes against the engine manifest. */
export interface ReconcileResult {
  /** Nodes whose `fn` resolves to a current public signature. */
  bound: BoundNode[];
  /** Nodes whose bound function no longer exists in the `.rhai` file. */
  stale: GraphNode[];
  /** Public functions that have no node yet (palette candidates). */
  unbound: FnSignature[];
}

/** A compiled, runnable plan derived from the topology. */
export interface ExecutionPlan {
  /** Node ids in a valid execution order (empty when a cycle is present). */
  order: string[];
  /** Blocking diagnostics that prevented or compromised compilation. */
  errors: GraphDiagnostic[];
}

/**
 * Parses the engine's `--list-functions` JSON. Returns the signatures plus an
 * optional compile error (the engine emits `{ "error": "..." }` on failure).
 *
 * @param json - The raw JSON string from the engine.
 * @returns An object containing the parsed `signatures` and any `error` encountered.
 */
export function parseSignaturesJson(json: string): {
  signatures: FnSignature[];
  error: string | null;
} {
  if (!json || !json.trim()) return { signatures: [], error: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { signatures: [], error: `Malformed manifest JSON: ${String(e)}` };
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const err = (parsed as { error?: unknown }).error;
    return { signatures: [], error: typeof err === "string" ? err : "Unknown manifest error" };
  }

  if (!Array.isArray(parsed)) {
    return { signatures: [], error: "Manifest is not an array" };
  }

  const signatures = parsed
    .filter((s): s is FnSignature => !!s && typeof (s as FnSignature).name === "string")
    .map(
      (s): FnSignature => ({
        name: s.name,
        params: Array.isArray(s.params) ? s.params.map(String) : [],
        access: s.access === "private" ? "private" : "public",
        doc: typeof s.doc === "string" ? s.doc : "",
      })
    );

  return { signatures, error: null };
}

/** 
 * Returns true for nodes the executor handles natively (no Rhai function). 
 *
 * @param node - The node to check.
 * @returns True if the node is a native control node.
 */
export function isControlNode(node: GraphNode): boolean {
  const k = node.kind ?? "function";
  if (k === "function" || k === "code-native") return false;
  return catalogByKind(k) !== undefined || k === "branch" || k === "iterator" || k === "literal";
}

/** 
 * Resolves wire kind with v2 fallback. 
 *
 * @param wire - The wire to resolve.
 * @returns "exec" if it's an execution wire, "data" otherwise.
 */
export function resolveGraphWireKind(wire: GraphWire): WireKind {
  return wire.kind === "exec" ? "exec" : "data";
}

/** 
 * Returns exec wires only. 
 *
 * @param wires - The list of wires to filter.
 * @returns An array containing only the execution wires.
 */
export function execWires(wires: GraphWire[]): GraphWire[] {
  return wires.filter((w) => resolveGraphWireKind(w) === "exec");
}

/** 
 * Returns data wires only. 
 *
 * @param wires - The list of wires to filter.
 * @returns An array containing only the data wires.
 */
export function dataWires(wires: GraphWire[]): GraphWire[] {
  return wires.filter((w) => resolveGraphWireKind(w) === "data");
}

/**
 * Detects cycles in the exec-flow subgraph (Kahn on exec edges only).
 * Returns involved node ids when a cycle exists.
 *
 * @param nodes - The graph nodes.
 * @param wires - The graph wires.
 * @returns An array of node IDs involved in a cycle, or an empty array if acyclic.
 */
export function detectExecCycle(nodes: GraphNode[], wires: GraphWire[]): string[] {
  const ids = new Set(nodes.map((n) => n.id));
  const execOnly = execWires(wires).filter((w) => ids.has(w.source) && ids.has(w.target));
  const indegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of ids) {
    indegree.set(id, 0);
    adj.set(id, []);
  }
  for (const w of execOnly) {
    adj.get(w.source)!.push(w.target);
    indegree.set(w.target, (indegree.get(w.target) ?? 0) + 1);
  }
  const queue = [...ids].filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    order.push(cur);
    for (const next of adj.get(cur) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (order.length === ids.size) return [];
  return [...ids].filter((id) => !order.includes(id));
}

/** 
 * Validates exec pin compatibility for a proposed connection. 
 *
 * @param sourceKind - The node kind of the source node.
 * @param sourceHandle - The specific source pin identifier.
 * @param targetKind - The node kind of the target node.
 * @param targetHandle - The specific target pin identifier.
 * @param wireKind - Whether this is an "exec" or "data" wire connection.
 * @returns An error message string if invalid, or null if the connection is valid.
 */
export function validatePinConnection(
  sourceKind: string | undefined,
  sourceHandle: string | undefined,
  targetKind: string | undefined,
  targetHandle: string | undefined,
  wireKind: WireKind
): string | null {
  const srcCat = sourceKind ? catalogByKind(sourceKind) : undefined;
  const tgtCat = targetKind ? catalogByKind(targetKind) : undefined;
  if (wireKind === "exec") {
    if (targetHandle && targetHandle !== EXEC_IN) {
      return `Exec wire must target the "${EXEC_IN}" pin`;
    }
    if (sourceHandle) {
      const srcPin = srcCat?.pins.find((p) => p.id === sourceHandle);
      if (srcPin && srcPin.pinKind !== "exec") {
        return `Source handle "${sourceHandle}" is not an execution pin`;
      }
    }
    return null;
  }
  // Data wire: target must be a data input pin
  if (targetHandle) {
    const tgtPin = tgtCat?.pins.find((p) => p.id === targetHandle);
    if (tgtPin && tgtPin.pinKind === "exec") {
      return `Cannot connect data wire to execution pin "${targetHandle}"`;
    }
  }
  return null;
}

/**
 * Reconciles canvas nodes against the engine manifest: classifies each node as
 * bound or stale, and reports public functions that have no node yet.
 *
 * Control nodes (branch/iterator) and code-native nodes are excluded from
 * reconciliation since they do not bind to a manifest signature.
 *
 * @param nodes - The canvas nodes to reconcile.
 * @param signatures - The engine manifest signatures.
 * @returns A structured `ReconcileResult` describing bound, stale, and unbound nodes.
 */
export function reconcileManifest(
  nodes: GraphNode[],
  signatures: FnSignature[]
): ReconcileResult {
  const sigByName = new Map(signatures.map((s) => [s.name, s]));
  const usedFns = new Set<string>();

  const bound: BoundNode[] = [];
  const stale: GraphNode[] = [];

  for (const node of nodes) {
    if (isControlNode(node) || node.kind === "code-native") continue;
    const signature = sigByName.get(node.fn);
    if (signature) {
      bound.push({ node, signature });
      usedFns.add(signature.name);
    } else {
      stale.push(node);
    }
  }

  const unbound = signatures.filter((s) => s.access === "public" && !usedFns.has(s.name));

  return { bound, stale, unbound };
}

/**
 * Topologically orders the nodes (Kahn's algorithm). On success `errors` is
 * empty; if a cycle remains, `order` is empty and a single `cycle` diagnostic is
 * returned listing the involved nodes.
 *
 * @param nodes - The nodes to order.
 * @param wires - The wires that determine dependencies.
 * @returns An `ExecutionPlan` detailing the final order and any errors.
 */
export function compileTopology(nodes: GraphNode[], wires: GraphWire[]): ExecutionPlan {
  const ids = new Set(nodes.map((n) => n.id));
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const id of ids) {
    indegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const wire of wires) {
    // Dangling wires (referencing missing nodes) cannot constrain ordering.
    if (!ids.has(wire.source) || !ids.has(wire.target)) continue;
    if (resolveGraphWireKind(wire) === "exec") continue;
    adjacency.get(wire.source)!.push(wire.target);
    indegree.set(wire.target, (indegree.get(wire.target) ?? 0) + 1);
  }

  // Seed the queue with all zero-indegree roots, preserving node declaration
  // order for stable, deterministic plans.
  const queue: string[] = nodes.filter((n) => (indegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current);
    for (const next of adjacency.get(current) ?? []) {
      const deg = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  if (order.length !== ids.size) {
    const stuck = [...ids].filter((id) => !order.includes(id));
    return {
      order: [],
      errors: [
        {
          severity: "error",
          code: "cycle",
          message: `Cyclic dependency detected among nodes: ${stuck.join(", ")}. The assembly line must be acyclic.`,
        },
      ],
    };
  }

  return { order, errors: [] };
}

/**
 * Full graph validation: stale bindings, wire arity (unknown / duplicate
 * parameters), dangling wires, unconnected parameters, and cycles. Returns a
 * flat, severity-tagged diagnostic list suitable for node/wire error styling.
 *
 * @param nodes - The nodes to validate.
 * @param wires - The wires to validate.
 * @param signatures - Known function signatures from the manifest.
 * @param manifestKnown - Whether the manifest has fully loaded (default: true).
 * @returns A list of graph diagnostics.
 */
export function validateGraph(
  nodes: GraphNode[],
  wires: GraphWire[],
  signatures: FnSignature[],
  manifestKnown = true
): GraphDiagnostic[] {
  const diagnostics: GraphDiagnostic[] = [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const { bound, stale } = reconcileManifest(nodes, signatures);
  const sigByNodeId = new Map(bound.map((b) => [b.node.id, b.signature]));

  // Only assert stale bindings when the manifest is known: an unloaded/failed
  // manifest gives no ground truth, so flagging every node would be a false
  // negative (e.g. the engine binary briefly unavailable on first canvas open).
  if (manifestKnown) {
    for (const node of stale) {
      diagnostics.push({
        severity: "error",
        code: "stale-binding",
        nodeId: node.id,
        message: `Node "${node.id}" is bound to function "${node.fn}", which no longer exists in the script.`,
      });
    }
  }

  // Track which (node, param) handles already received a wire.
  const filledHandles = new Map<string, Set<string>>();

  for (const wire of wires) {
    const sourceNode = nodeById.get(wire.source);
    const targetNode = nodeById.get(wire.target);
    if (!sourceNode || !targetNode) {
      diagnostics.push({
        severity: "error",
        code: "dangling-wire",
        wireId: wire.id,
        message: `Wire "${wire.id}" references a node that no longer exists.`,
      });
      continue;
    }

    const signature = sigByNodeId.get(targetNode.id);
    // Only function nodes have a fixed parameter contract to validate against.
    if (!signature) continue;

    const handle = wire.targetHandle ?? undefined;
    if (handle === undefined) continue;

    if (!signature.params.includes(handle)) {
      diagnostics.push({
        severity: "error",
        code: "unknown-param",
        wireId: wire.id,
        nodeId: targetNode.id,
        message: `Wire targets parameter "${handle}", which is not a parameter of "${signature.name}".`,
      });
      continue;
    }

    const filled = filledHandles.get(targetNode.id) ?? new Set<string>();
    if (filled.has(handle)) {
      diagnostics.push({
        severity: "error",
        code: "duplicate-param",
        wireId: wire.id,
        nodeId: targetNode.id,
        message: `Parameter "${handle}" of "${signature.name}" already has an inbound wire.`,
      });
    }
    filled.add(handle);
    filledHandles.set(targetNode.id, filled);
  }

  // Warn about required parameters with no inbound wire (runtime gets Unit).
  for (const { node, signature } of bound) {
    const filled = filledHandles.get(node.id) ?? new Set<string>();
    for (const param of signature.params) {
      if (!filled.has(param)) {
        diagnostics.push({
          severity: "warning",
          code: "unconnected-param",
          nodeId: node.id,
          message: `Parameter "${param}" of "${signature.name}" has no inbound wire; it will receive Unit at runtime.`,
        });
      }
    }
  }

  diagnostics.push(...compileTopology(nodes, wires).errors);

  const execCycleNodes = detectExecCycle(nodes, wires);
  if (execCycleNodes.length > 0) {
    diagnostics.push({
      severity: "error",
      code: "exec-cycle",
      message: `Execution flow cycle detected among nodes: ${execCycleNodes.join(", ")}.`,
    });
  }

  const hasEvent = nodes.some((n) => n.kind === "event");
  const hasExec = execWires(wires).length > 0;
  if (hasExec && !hasEvent) {
    diagnostics.push({
      severity: "warning",
      code: "missing-event",
      message: "Graph has execution wires but no Event node as exec root.",
    });
  }

  return diagnostics;
}
