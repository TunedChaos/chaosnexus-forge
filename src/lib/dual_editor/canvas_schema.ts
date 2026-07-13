/**
 * @file canvas_schema.ts
 *
 * Canvas sidecar schema v3 (Vhai logic flow). Pure types shared by the
 * parser, graph validator, and node catalog. v3 is additive over v2: edges gain
 * an optional `kind` ("exec" | "data"), nodes gain optional `pins` descriptors,
 * and the `kind` taxonomy expands for control/value/escape-hatch nodes.
 */

/** Current sidecar schema version emitted by ChaosNexus Forge. */
export const CANVAS_SCHEMA_VERSION = 3;

/** Wire kind: execution flow (white) vs data payload (typed). */
export type WireKind = "exec" | "data";

/** Pin direction on a node boundary. */
export type PinDirection = "input" | "output";

/** Whether a pin carries execution flow or a typed data payload. */
export type PinKind = "exec" | "data";

/**
 * Full taxonomy of canvas node kinds understood by the Forge UI and the
 * chaosnexus-anvil executor. Legacy v2 values remain valid; absent `kind` defaults
 * to "function".
 */
export type CanvasNodeKind =
  | "event"
  | "function"
  | "code-native"
  | "branch"
  | "iterator"
  | "sequence"
  | "while"
  | "loop"
  | "do-while"
  | "for-each"
  | "break"
  | "continue"
  | "return"
  | "try-catch"
  | "switch"
  | "literal"
  | "get-variable"
  | "set-variable"
  | "operator"
  | "make-array"
  | "make-map"
  | "index"
  | "member-get"
  | "member-set"
  | "script"
  | "expression"
  | "ml-train"
  | "ml-predict"
  | "sci-math"
  | "comment";

/** Descriptor for a single pin on a node (persisted for round-trip fidelity). */
export interface CanvasPinDescriptor {
  id: string;
  label: string;
  direction: PinDirection;
  pinKind: PinKind;
  /** Rhai/engine data type hint for data pins (drives pin color). */
  dataType?: string;
}

/** A node row in the canvas sidecar. */
export interface CanvasNodeRecord {
  id: string;
  label: string;
  x: number;
  y: number;
  type?: string;
  parentId?: string;
  width?: number;
  height?: number;
  style?: string;
  class?: string;
  manualWidth?: number;
  manualHeight?: number;
  /** Bound Rhai function name for function/native nodes. */
  fn?: string;
  kind?: CanvasNodeKind | string;
  value?: unknown;
  valueType?: string;
  /** v3: optional explicit pin layout (when absent, catalog defaults apply). */
  pins?: CanvasPinDescriptor[];
  /** v3: opaque Script/Expression node body (verbatim Rhai). */
  scriptBody?: string;
  /** v3: operator id for operator nodes (catalog key). */
  operatorId?: string;
  /** v3: variable name for get/set variable nodes. */
  varName?: string;
  /** v3: event hook id (e.g. on_plugin_start). */
  eventId?: string;
}

/** A wire row in the canvas sidecar. */
export interface CanvasEdgeRecord {
  id: string;
  source: string;
  target: string;
  label?: string;
  sourceHandle?: string;
  targetHandle?: string;
  /** v3: defaults to "data" when absent (v2 compatibility). */
  kind?: WireKind;
}

/** Parsed canvas sidecar document (v1 to v3). */
export interface CanvasDocumentV3 {
  version?: number;
  nodes: CanvasNodeRecord[];
  edges: CanvasEdgeRecord[];
  /** When true, the canvas is illustrative only; Rhai remains the runtime source of truth. */
  displayOnly?: boolean;
}

/** True when the canvas is marked display-only (illustrative wiring). */
export function isDisplayOnlyCanvas(doc: CanvasDocumentV3 | null | undefined): boolean {
  return doc?.displayOnly === true;
}

/** Resolves wire kind with v2 fallback. */
export function resolveWireKind(edge: CanvasEdgeRecord): WireKind {
  return edge.kind === "exec" ? "exec" : "data";
}

/** True when the node kind is a native structural control node (executor dispatch). */
export function isStructuralControlKind(kind: string | undefined): boolean {
  if (!kind) return false;
  return [
    "branch",
    "iterator",
    "sequence",
    "while",
    "loop",
    "do-while",
    "for-each",
    "break",
    "continue",
    "return",
    "try-catch",
    "switch",
    "event",
  ].includes(kind);
}

/** True when the node kind is a pure data/value node (no exec pins required). */
export function isPureDataKind(kind: string | undefined): boolean {
  if (!kind) return false;
  return [
    "literal",
    "get-variable",
    "operator",
    "make-array",
    "make-map",
    "index",
    "member-get",
    "expression",
  ].includes(kind);
}
