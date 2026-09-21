// chaosnexus-forge/src/lib/dual_editor/native_codegen.test.ts
import { describe, expect, test } from "vitest";
import { buildNativeNodeSnippet } from "./native_codegen";
import type { SchemaFunction } from "$lib/schema.svelte";

function fn(overrides: Partial<SchemaFunction> = {}): SchemaFunction {
  return {
    name: "log_info",
    module: "global",
    signature: "log_info(plugin_name: &str, msg: &str)",
    description: "Logs an info line.",
    params: [
      { name: "plugin_name", type: "&str" },
      { name: "msg", type: "&str" },
    ],
    ...overrides,
  };
}

describe("buildNativeNodeSnippet", () => {
  test("auto-binds plugin_name and exposes remaining params", () => {
    const snippet = buildNativeNodeSnippet(fn());
    expect(snippet.anchorLabel).toBe("log_info");
    expect(snippet.params).toEqual(["msg"]);
    expect(snippet.code).toContain("fn log_info(msg) {");
    expect(snippet.code).toContain("return log_info(PLUGIN_NAME, msg);");
    expect(snippet.code).toContain("// --- [NODE: log_info] ---");
  });

  test("suffixes collisions against existing labels", () => {
    const snippet = buildNativeNodeSnippet(fn(), ["log_info"]);
    expect(snippet.anchorLabel).toBe("log_info_2");
    expect(snippet.code).toContain("fn log_info_2(msg) {");
  });

  test("handles zero-parameter natives", () => {
    const snippet = buildNativeNodeSnippet(
      fn({ name: "now", params: [], signature: "now() -> i64", description: "" })
    );
    expect(snippet.params).toEqual([]);
    expect(snippet.code).toContain("fn now() {");
    expect(snippet.code).toContain("return now();");
  });

  test("sanitizes non-identifier names", () => {
    const snippet = buildNativeNodeSnippet(
      fn({ name: "json.parse", params: [{ name: "text", type: "&str" }] })
    );
    expect(snippet.anchorLabel).toBe("json_parse");
    expect(snippet.params).toEqual(["text"]);
    expect(snippet.code).toContain("return json.parse(text);");
  });
});
