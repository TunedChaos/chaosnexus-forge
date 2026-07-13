/**
 * @file node_catalog.ts
 *
 * Declarative SSOT for Vhai logic nodes. Each entry defines stable
 * dispatch keys (mirrored in chaosnexus-anvil `node_catalog.rs`), pin layout, and
 * palette metadata. The Forge UI, connect validator, and executor all derive
 * behavior from this catalog to stay in lockstep (DRY).
 */

import type { CanvasNodeKind, CanvasPinDescriptor } from "./canvas_schema";
import type { PinRole } from "./pin_roles";

/** Palette grouping for the visual scripting library. */
export type CatalogCategory =
  | "event"
  | "function"
  | "native"
  | "control"
  | "flow"
  | "variable"
  | "operator"
  | "literal"
  | "data"
  | "error"
  | "escape"
  | "mcp"
  | "anchor"
  | "machine-learning"
  | "science";

/** Pin definition used by catalog entries and NodeShell rendering. */
export interface CatalogPin {
  id: string;
  label: string;
  direction: "input" | "output";
  pinKind: "exec" | "data";
  dataType?: string;
  role?: PinRole;
}

/** A single catalogued logic node type. */
export interface CatalogNodeDef {
  /** Stable dispatch key (must match Rust `NODE_KIND_*` constants). */
  kind: CanvasNodeKind;
  /** Svelte Flow component type id. */
  flowType: string;
  /** Human title shown in the node header. */
  title: string;
  /** Short palette description. */
  description: string;
  category: CatalogCategory;
  pins: CatalogPin[];
  /** Default data fields when spawning from the palette. */
  defaults?: Record<string, unknown>;
}

/** Standard exec pin ids (shared with Rust executor). */
export const EXEC_IN = "exec_in";
/** Standard output exec pin id. */
export const EXEC_OUT = "exec_out";
/** True branch exec pin id. */
export const EXEC_TRUE = "true";
/** False branch exec pin id. */
export const EXEC_FALSE = "false";
/** Loop body exec pin id. */
export const EXEC_BODY = "body";
/** Loop completed exec pin id. */
export const EXEC_COMPLETED = "completed";
/** Error catch exec pin id. */
export const EXEC_CATCH = "catch";
/** Standard return data pin id. */
export const RETURN_HANDLE = "return";

function execIn(): CatalogPin {
  return { id: EXEC_IN, label: "in", direction: "input", pinKind: "exec", role: "exec" };
}
function execOut(id = EXEC_OUT, label = "out"): CatalogPin {
  return { id, label, direction: "output", pinKind: "exec", role: "exec" };
}
function dataIn(id: string, label: string, dataType: string, role?: PinRole): CatalogPin {
  return {
    id,
    label,
    direction: "input",
    pinKind: "data",
    dataType,
    role: role ?? (dataType as PinRole),
  };
}
function dataOut(id: string, label: string, dataType: string, role?: PinRole): CatalogPin {
  return {
    id,
    label,
    direction: "output",
    pinKind: "data",
    dataType,
    role: role ?? (dataType as PinRole),
  };
}

/**
 * Master catalog of built-in logic nodes. Dynamic entries (manifest functions,
 * native API, MCP) are merged at palette-build time.
 */
export const NODE_CATALOG: CatalogNodeDef[] = [
  {
    kind: "event",
    flowType: "eventNode",
    title: "Event",
    description: "Plugin lifecycle entry point (exec root)",
    category: "event",
    pins: [execOut("then", "then")],
    defaults: { eventId: "on_plugin_start" },
  },
  {
    kind: "sequence",
    flowType: "sequenceNode",
    title: "Sequence",
    description: "Run exec outputs in order (then 0, then 1, …)",
    category: "control",
    pins: [execIn(), execOut("then_0", "then 0"), execOut("then_1", "then 1")],
  },
  {
    kind: "branch",
    flowType: "branchNode",
    title: "Branch",
    description: "If condition then route exec true/false",
    category: "control",
    pins: [
      execIn(),
      dataIn("condition", "condition", "bool", "bool"),
      dataIn("payload", "payload", "generic", "generic"),
      execOut(EXEC_TRUE, "true"),
      execOut(EXEC_FALSE, "false"),
    ],
  },
  {
    kind: "while",
    flowType: "whileNode",
    title: "While",
    description: "Loop while condition is true",
    category: "flow",
    pins: [
      execIn(),
      dataIn("condition", "condition", "bool", "bool"),
      execOut(EXEC_BODY, "body"),
      execOut(EXEC_COMPLETED, "completed"),
    ],
  },
  {
    kind: "loop",
    flowType: "loopNode",
    title: "Loop",
    description: "Infinite loop until Break",
    category: "flow",
    pins: [execIn(), execOut(EXEC_BODY, "body"), execOut(EXEC_COMPLETED, "completed")],
  },
  {
    kind: "do-while",
    flowType: "doWhileNode",
    title: "Do While",
    description: "Run body at least once, repeat while condition",
    category: "flow",
    pins: [
      execIn(),
      dataIn("condition", "condition", "bool", "bool"),
      execOut(EXEC_BODY, "body"),
      execOut(EXEC_COMPLETED, "completed"),
    ],
  },
  {
    kind: "for-each",
    flowType: "forEachNode",
    title: "For Each",
    description: "Iterate array or range; exec body per element",
    category: "flow",
    pins: [
      execIn(),
      dataIn("items", "items", "array", "array"),
      execOut("item", "item"),
      dataOut("index", "index", "int", "int"),
      execOut(EXEC_COMPLETED, "completed"),
    ],
  },
  {
    kind: "iterator",
    flowType: "iteratorNode",
    title: "Iterator",
    description: "Legacy array fan-out (data-gated)",
    category: "flow",
    pins: [
      dataIn("items", "items", "array", "array"),
      dataOut("item", "item", "generic", "generic"),
      dataOut(RETURN_HANDLE, "return", "generic", "generic"),
    ],
  },
  {
    kind: "break",
    flowType: "breakNode",
    title: "Break",
    description: "Exit innermost loop",
    category: "flow",
    pins: [execIn()],
  },
  {
    kind: "continue",
    flowType: "continueNode",
    title: "Continue",
    description: "Skip to next loop iteration",
    category: "flow",
    pins: [execIn()],
  },
  {
    kind: "return",
    flowType: "returnNode",
    title: "Return",
    description: "Return value and stop graph execution",
    category: "flow",
    pins: [execIn(), dataIn("value", "value", "generic", "generic")],
  },
  {
    kind: "try-catch",
    flowType: "tryCatchNode",
    title: "Try / Catch",
    description: "Run try body; on error route to catch",
    category: "error",
    pins: [
      execIn(),
      execOut("try", "try"),
      execOut(EXEC_CATCH, "catch"),
      dataOut("error", "error", "string", "string"),
    ],
  },
  {
    kind: "switch",
    flowType: "switchNode",
    title: "Switch",
    description: "Route by value match (default + cases)",
    category: "control",
    pins: [
      execIn(),
      dataIn("value", "value", "generic", "generic"),
      execOut("default", "default"),
      execOut("case_0", "case 0"),
      execOut("case_1", "case 1"),
    ],
  },
  {
    kind: "literal",
    flowType: "literalNode",
    title: "Literal",
    description: "Constant value source",
    category: "literal",
    pins: [dataOut(RETURN_HANDLE, "value", "generic", "generic")],
    defaults: { value: "", valueType: "string" },
  },
  {
    kind: "get-variable",
    flowType: "getVariableNode",
    title: "Get Variable",
    description: "Read a named variable from run scope",
    category: "variable",
    pins: [dataOut(RETURN_HANDLE, "value", "generic", "generic")],
    defaults: { varName: "my_var" },
  },
  {
    kind: "set-variable",
    flowType: "setVariableNode",
    title: "Set Variable",
    description: "Write a named variable in run scope",
    category: "variable",
    pins: [
      execIn(),
      dataIn("value", "value", "generic", "generic"),
      execOut(EXEC_OUT, "out"),
    ],
    defaults: { varName: "my_var" },
  },
  {
    kind: "operator",
    flowType: "operatorNode",
    title: "Operator",
    description: "Binary/unary Rhai expression (micro-AST eval)",
    category: "operator",
    pins: [
      dataIn("a", "A", "generic", "generic"),
      dataIn("b", "B", "generic", "generic"),
      dataOut(RETURN_HANDLE, "result", "generic", "generic"),
    ],
    defaults: { operatorId: "add" },
  },
  {
    kind: "make-array",
    flowType: "makeArrayNode",
    title: "Make Array",
    description: "Build array from element inputs",
    category: "data",
    pins: [
      dataIn("elem_0", "0", "generic", "generic"),
      dataIn("elem_1", "1", "generic", "generic"),
      dataOut(RETURN_HANDLE, "array", "array", "array"),
    ],
  },
  {
    kind: "make-map",
    flowType: "makeMapNode",
    title: "Make Map",
    description: "Build object map from key/value pairs",
    category: "data",
    pins: [
      dataIn("key", "key", "string", "string"),
      dataIn("value", "value", "generic", "generic"),
      dataOut(RETURN_HANDLE, "map", "object", "object"),
    ],
  },
  {
    kind: "index",
    flowType: "indexNode",
    title: "Index",
    description: "Index array or map by key",
    category: "data",
    pins: [
      dataIn("target", "target", "generic", "generic"),
      dataIn("index", "index", "generic", "generic"),
      dataOut(RETURN_HANDLE, "value", "generic", "generic"),
    ],
  },
  {
    kind: "member-get",
    flowType: "memberGetNode",
    title: "Get Member",
    description: "Read object property by name",
    category: "data",
    pins: [
      dataIn("object", "object", "object", "object"),
      dataIn("member", "member", "string", "string"),
      dataOut(RETURN_HANDLE, "value", "generic", "generic"),
    ],
  },
  {
    kind: "script",
    flowType: "scriptNode",
    title: "Script Block",
    description: "Opaque Rhai statements (escape hatch)",
    category: "escape",
    pins: [
      execIn(),
      execOut(EXEC_OUT, "out"),
      dataOut(RETURN_HANDLE, "return", "generic", "generic"),
    ],
    defaults: { scriptBody: "// Rhai statements\n" },
  },
  {
    kind: "expression",
    flowType: "expressionNode",
    title: "Expression",
    description: "Opaque Rhai expression (escape hatch)",
    category: "escape",
    pins: [
      dataIn("a", "a", "generic", "generic"),
      dataOut(RETURN_HANDLE, "result", "generic", "generic"),
    ],
    defaults: { scriptBody: "a + 1" },
  },
  {
    kind: "comment",
    flowType: "commentNode",
    title: "Comment",
    description: "Non-executing annotation",
    category: "escape",
    pins: [],
  },
  {
    kind: "ml-train",
    flowType: "mlTrainNode",
    title: "Train ML Model",
    description: "Train a machine learning model on a dataset",
    category: "machine-learning",
    pins: [
      execIn(),
      dataIn("x", "features", "array", "array"),
      dataIn("y", "targets", "array", "array"),
      dataIn("algorithm", "algorithm", "string", "string"),
      execOut("try", "try"),
      execOut(EXEC_CATCH, "catch"),
      dataOut(RETURN_HANDLE, "model", "generic", "generic"),
      dataOut("error", "error", "string", "string"),
    ],
    defaults: { fn: "train", algorithm: "kmeans" },
  },
  {
    kind: "ml-predict",
    flowType: "mlPredictNode",
    title: "Predict",
    description: "Run predictions using a trained model",
    category: "machine-learning",
    pins: [
      execIn(),
      dataIn("model", "model", "generic", "generic"),
      dataIn("x", "features", "array", "array"),
      execOut("try", "try"),
      execOut(EXEC_CATCH, "catch"),
      dataOut(RETURN_HANDLE, "predictions", "array", "array"),
      dataOut("error", "error", "string", "string"),
    ],
    defaults: { fn: "predict" },
  },
  {
    kind: "sci-math",
    flowType: "sciMathNode",
    title: "Math Function",
    description: "Execute a scientific math function (sin, cos, exp, etc)",
    category: "science",
    pins: [
      dataIn("x", "x", "generic", "generic"),
      dataOut(RETURN_HANDLE, "result", "generic", "generic"),
    ],
    defaults: { fn: "sin" },
  },
];

/** Lookup catalog entry by node kind. */
export function catalogByKind(kind: string): CatalogNodeDef | undefined {
  return NODE_CATALOG.find((n) => n.kind === kind);
}

/** Lookup catalog entry by Svelte Flow type id. */
export function catalogByFlowType(flowType: string): CatalogNodeDef | undefined {
  return NODE_CATALOG.find((n) => n.flowType === flowType);
}

/** Converts catalog pins to canvas pin descriptors for sidecar persistence. */
export function catalogPinsToDescriptors(pins: CatalogPin[]): CanvasPinDescriptor[] {
  return pins.map((p) => ({
    id: p.id,
    label: p.label,
    direction: p.direction,
    pinKind: p.pinKind,
    dataType: p.dataType,
  }));
}

/** Operator micro-AST ids supported by the executor. */
export const OPERATOR_IDS = [
  "add",
  "sub",
  "mul",
  "div",
  "mod",
  "pow",
  "eq",
  "ne",
  "lt",
  "le",
  "gt",
  "ge",
  "and",
  "or",
  "not",
  "neg",
  "bit_and",
  "bit_or",
  "bit_xor",
  "shl",
  "shr",
  "in",
] as const;

/** Valid operator micro-AST ids. */
export type OperatorId = (typeof OPERATOR_IDS)[number];

/** Rhai expression template for an operator id (uses `a`, `b` placeholders). */
export function operatorExpression(id: OperatorId): string {
  const map: Record<OperatorId, string> = {
    add: "a + b",
    sub: "a - b",
    mul: "a * b",
    div: "a / b",
    mod: "a % b",
    pow: "a ** b",
    eq: "a == b",
    ne: "a != b",
    lt: "a < b",
    le: "a <= b",
    gt: "a > b",
    ge: "a >= b",
    and: "a && b",
    or: "a || b",
    not: "!a",
    neg: "-a",
    bit_and: "a & b",
    bit_or: "a | b",
    bit_xor: "a ^ b",
    shl: "a << b",
    shr: "a >> b",
    in: "a in b",
  };
  return map[id];
}

/** Resolves pin kind for a handle on a catalog node. */
export function pinKindForHandle(
  nodeKind: string | undefined,
  handle: string | undefined
): "exec" | "data" | undefined {
  if (!handle) return undefined;
  if (handle === EXEC_IN) return "exec";
  const cat = nodeKind ? catalogByKind(nodeKind) : undefined;
  return cat?.pins.find((p) => p.id === handle)?.pinKind;
}

/** Infers exec vs data wire kind from connection endpoints. */
export function resolveConnectionWireKind(
  sourceKind: string | undefined,
  sourceHandle: string | undefined,
  targetKind: string | undefined,
  targetHandle: string | undefined
): "exec" | "data" {
  if (targetHandle === EXEC_IN || pinKindForHandle(targetKind, targetHandle) === "exec") {
    return "exec";
  }
  if (pinKindForHandle(sourceKind, sourceHandle) === "exec") {
    return "exec";
  }
  return "data";
}

/** Palette category display labels. */
export const CATALOG_CATEGORY_LABELS: Record<CatalogCategory, string> = {
  event: "Events",
  function: "Script Functions",
  native: "Native API",
  control: "Control Flow",
  flow: "Loops & Flow",
  variable: "Variables",
  operator: "Operators",
  literal: "Literals",
  data: "Data Structures",
  error: "Errors",
  escape: "Script Blocks",
  mcp: "MCP Proxy",
  anchor: "Anchors",
  "machine-learning": "Machine Learning",
  science: "Scientific Math",
};
