// chaosnexus-forge/src/lib/dual_editor/mcp_codegen.test.ts

import { describe, expect, it } from "vitest";
import { buildProxyNodeSnippet, sanitizeIdentifier } from "./mcp_codegen";
import type { McpConnection, McpToolSchema } from "$lib/mcp.svelte";

const conn: McpConnection = {
  id: "github",
  label: "GitHub",
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-github"],
  scope: "read-write",
};

const tool: McpToolSchema = {
  name: "create-issue",
  description: "Create a new issue",
  input_schema: {
    type: "object",
    properties: {
      repo: { type: "string", description: "Repository slug" },
      title: { type: "string" },
    },
    required: ["repo"],
  },
};

describe("sanitizeIdentifier", () => {
  it("replaces non-identifier characters with underscores", () => {
    expect(sanitizeIdentifier("create-issue")).toBe("create_issue");
    expect(sanitizeIdentifier("a.b/c")).toBe("a_b_c");
  });

  it("prefixes identifiers that start with a digit", () => {
    expect(sanitizeIdentifier("3d-render")).toBe("t_3d_render");
  });

  it("falls back to 'tool' for empty input", () => {
    expect(sanitizeIdentifier("***")).toBe("tool");
  });
});

describe("buildProxyNodeSnippet", () => {
  it("generates a NODE anchor and mcp_call_tool wiring", () => {
    const { anchorLabel, code } = buildProxyNodeSnippet(conn, tool);
    expect(anchorLabel).toBe("create_issue");
    expect(code).toContain("// --- [NODE: create_issue] ---");
    expect(code).toContain('mcp_connect(PLUGIN_NAME, "github_conn", "npx", ["-y"');
    expect(code).toContain('mcp_call_tool("github_conn", "create-issue"');
    expect(code).toContain('call_args["__chaos_node"] = "create_issue"');
    expect(code).toContain("repo: args.repo,");
    expect(code).toContain("title: args.title,");
    expect(code).toContain('mcp_disconnect("github_conn");');
  });

  it("suffixes duplicate anchor labels", () => {
    const { anchorLabel } = buildProxyNodeSnippet(conn, tool, ["create_issue"]);
    expect(anchorLabel).toBe("create_issue_2");
  });

  it("emits an empty map when the tool has no properties", () => {
    const noArgs: McpToolSchema = { name: "ping", description: "", input_schema: {} };
    const { code } = buildProxyNodeSnippet(conn, noArgs);
    expect(code).toContain('mcp_call_tool("github_conn", "ping", call_args)');
    expect(code).toContain('call_args["__chaos_node"]');
  });
});
