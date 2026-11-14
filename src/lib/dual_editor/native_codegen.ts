// chaosnexus-forge/src/lib/dual_editor/native_codegen.ts
//
// Schema-generated node code generation (Phase 6c). Turns a native ChaosNexus Anvil
// function (from the engine SSOT schema) into a ready-to-drop wrapper Actuator.
//
// The visual model binds canvas nodes to Rhai functions, so dropping a native
// from the palette materializes a small forwarding wrapper. This keeps the
// "node == function" invariant intact while letting the user freely edit the
// generated body. The leading `plugin_name` parameter (a near-universal
// ChaosNexus Anvil convention) is auto-bound to the `PLUGIN_NAME` constant so it
// never becomes a manual input handle.

import type { SchemaFunction, SchemaParam } from "$lib/schema.svelte";
import { sanitizeIdentifier } from "./mcp_codegen";

/** A generated native wrapper: anchor id, exposed params, and Rhai source. */
export interface NativeNodeSnippet {
  anchorLabel: string;
  /** Parameter names exposed as input handles (excludes auto-bound ones). */
  params: string[];
  code: string;
}

/** Parameters auto-bound to engine constants instead of wired input handles. */
const AUTO_BOUND: Record<string, string> = {
  plugin_name: "PLUGIN_NAME",
};

/** Picks a collision-free wrapper identifier derived from the native name. */
function uniqueAnchor(base: string, existingLabels: string[]): string {
  let anchor = base;
  let n = 2;
  const taken = new Set(existingLabels);
  while (taken.has(anchor)) {
    anchor = `${base}_${n}`;
    n += 1;
  }
  return anchor;
}

/**
 * Generates a wrapper Actuator block for native `fn`. The returned snippet's
 * `params` lists only the input handles the node should expose (auto-bound
 * parameters such as `plugin_name` are folded into the call body).
 */
export function buildNativeNodeSnippet(
  fn: SchemaFunction,
  existingLabels: string[] = []
): NativeNodeSnippet {
  const base = sanitizeIdentifier(fn.name);
  const anchorLabel = uniqueAnchor(base, existingLabels);

  const exposed: SchemaParam[] = fn.params.filter((p) => !(p.name in AUTO_BOUND));
  const exposedNames = exposed.map((p) => p.name);

  const callArgs = fn.params.map((p) => AUTO_BOUND[p.name] ?? p.name);
  const desc = fn.description ? `: ${fn.description}` : "";

  const code = `// --- [NODE: ${anchorLabel}] ---
fn ${anchorLabel}(${exposedNames.join(", ")}) {
    // Native call -> ${fn.name}${desc}
    return ${fn.name}(${callArgs.join(", ")});
}`;

  return { anchorLabel, params: exposedNames, code };
}
