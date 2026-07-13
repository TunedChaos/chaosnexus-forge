// chaosnexus-forge/src/lib/dual_editor/mcp_codegen.ts
//
// Proxy-node code generation for the MCP Mesh (Phase 4). Turns a registered
// downstream connection plus one of its discovered tool schemas into a ready-to
// drop Rhai block that wires mcp_connect -> mcp_call_tool -> mcp_disconnect,
// with an argument skeleton derived from the tool's JSON `inputSchema`.

import type { McpConnection, McpToolSchema } from "$lib/mcp.svelte";

/** Minimal JSON Schema shape we read for the argument skeleton. */
interface JsonSchemaLike {
  properties?: Record<string, { type?: string; description?: string }>;
  required?: string[];
}

/** Sanitizes an arbitrary tool name into a valid Rhai identifier / node label. */
export function sanitizeIdentifier(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_");
  const trimmed = cleaned.replace(/^_+|_+$/g, "");
  if (!trimmed) return "tool";
  // Rhai identifiers cannot start with a digit.
  return /^[0-9]/.test(trimmed) ? `t_${trimmed}` : trimmed;
}

/** Renders a Rhai array literal of double-quoted launch arguments. */
function renderArgsArray(args: string[]): string {
  if (args.length === 0) return "[]";
  const quoted = args.map((a) => `"${a.replace(/"/g, '\\"')}"`);
  return `[${quoted.join(", ")}]`;
}

/** Builds the `#{ ... }` argument map skeleton from a tool's input schema. */
function renderArgsMap(schema: McpToolSchema["input_schema"]): string {
  const typed = (schema ?? {}) as JsonSchemaLike;
  const properties = typed.properties ?? {};
  const keys = Object.keys(properties);
  if (keys.length === 0) return "#{}";

  const required = new Set(typed.required ?? []);
  const lines = keys.map((key) => {
    const prop = properties[key] ?? {};
    const meta: string[] = [];
    if (prop.type) meta.push(prop.type);
    if (required.has(key)) meta.push("required");
    if (prop.description) meta.push(prop.description);
    const comment = meta.length > 0 ? `  // ${meta.join(" - ")}` : "";
    return `        ${key}: args.${key},${comment}`;
  });
  return `#{\n${lines.join("\n")}\n    }`;
}

/** Result of generating a proxy node: the unique anchor label and Rhai code. */
export interface ProxyNodeSnippet {
  anchorLabel: string;
  code: string;
}

/**
 * Generates a proxy-node Rhai block for `tool` on `connection`. The returned
 * `anchorLabel` is a sanitized, collision-resistant node id; `existingLabels`
 * is used to suffix duplicates (`tool`, `tool_2`, ...).
 */
export function buildProxyNodeSnippet(
  connection: McpConnection,
  tool: McpToolSchema,
  existingLabels: string[] = []
): ProxyNodeSnippet {
  const base = sanitizeIdentifier(tool.name);
  let anchorLabel = base;
  let n = 2;
  const taken = new Set(existingLabels);
  while (taken.has(anchorLabel)) {
    anchorLabel = `${base}_${n}`;
    n += 1;
  }

  const connId = `${sanitizeIdentifier(connection.id)}_conn`;
  const argsArray = renderArgsArray(connection.args);
  const argsMap = renderArgsMap(tool.input_schema);
  const desc = tool.description ? ` ${tool.description}` : "";

  const code = `// --- [NODE: ${anchorLabel}] ---
fn ${anchorLabel}(args) {
    // MCP proxy ->${desc ? desc : ` ${connection.label || connection.id}`}
    // Tool "${tool.name}" on connection "${connection.id}".
    mcp_connect(PLUGIN_NAME, "${connId}", "${connection.command}", ${argsArray});
    let call_args = ${argsMap};
    call_args["__chaos_node"] = "${anchorLabel}";
    let result = mcp_call_tool("${connId}", "${tool.name}", call_args);
    mcp_disconnect("${connId}");
    return result;
}`;

  return { anchorLabel, code };
}
