/**
 * @file mcp.svelte.ts
 * @description Reactive client for the MCP Mesh registry (Phase 4).
 * Wraps the Forge-native MCP client commands (see src-tauri/src/mcp_registry.rs)
 * that manage downstream MCP servers for the connected workspace. It handles persisted CRUD
 * operations and connection tests, which also double as tool-schema discovery for the
 * visual proxy-node palette.
 */

// chaosnexus-forge/src/lib/mcp.svelte.ts

import { invoke } from "@tauri-apps/api/core";
import { workbench } from "./state.svelte";

/** Permission scope mirrored from the backend (kebab-case wire contract). */
export type McpScope = "read-only" | "read-write" | "no-network";

/** A registered downstream MCP server. */
export interface McpConnection {
  id: string;
  label: string;
  command: string;
  args: string[];
  scope: McpScope;
}

/** A tool exposed by a downstream server (drives the proxy-node palette). */
export interface McpToolSchema {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  input_schema: unknown;
}

/** Health report returned by a connection test. */
export interface McpHealthReport {
  ok: boolean;
  message: string;
  tools: McpToolSchema[];
}

/** UI-facing health state per connection id. */
export interface McpHealth {
  state: "unknown" | "testing" | "online" | "offline";
  message: string;
}

/** Tools whose names imply mutation; suppressed when a connection is Read-Only. */
const WRITE_TOOL_HINTS = [
  "write",
  "create",
  "update",
  "delete",
  "remove",
  "set",
  "put",
  "patch",
  "post",
  "insert",
  "append",
  "edit",
  "move",
  "rename",
  "exec",
  "run",
  "send",
];

/** Returns true when a tool name suggests a write/side-effecting operation. */
export function isWriteTool(toolName: string): boolean {
  const lower = toolName.toLowerCase();
  return WRITE_TOOL_HINTS.some((hint) => lower.includes(hint));
}

/**
 * Client for managing Model Context Protocol (MCP) server connections
 * and their associated tools and health statuses.
 */
class McpClient {
  /** Persisted downstream connections for the active workspace. */
  connections = $state<McpConnection[]>([]);
  /** Discovered tool schemas keyed by connection id (populated on test). */
  toolsByConn = $state<Record<string, McpToolSchema[]>>({});
  /** Health state keyed by connection id. */
  health = $state<Record<string, McpHealth>>({});

  #loadedFor = "";

  /** Loads the registry for the active workspace (idempotent per path). */
  async load(force = false): Promise<void> {
    const path = workbench.projectPath;
    if (!path) {
      this.connections = [];
      return;
    }
    if (!force && this.#loadedFor === path) return;
    this.#loadedFor = path;
    try {
      this.connections = await invoke<McpConnection[]>("mcp_registry_list", {
        projectPath: path,
      });
    } catch (err) {
      console.error("[mcp] Failed to load registry:", err);
      this.connections = [];
    }
  }

  /** Adds or updates a connection (upsert by id) and refreshes the list. */
  async upsert(connection: McpConnection): Promise<void> {
    const path = workbench.projectPath;
    if (!path) throw new Error("Connect a workspace first.");
    this.connections = await invoke<McpConnection[]>("mcp_registry_add", {
      projectPath: path,
      connection,
    });
  }

  /** Removes a connection by id and clears its cached tools/health. */
  async remove(id: string): Promise<void> {
    const path = workbench.projectPath;
    if (!path) return;
    this.connections = await invoke<McpConnection[]>("mcp_registry_remove", {
      projectPath: path,
      id,
    });
    const { [id]: _tools, ...restTools } = this.toolsByConn;
    this.toolsByConn = restTools;
    const { [id]: _health, ...restHealth } = this.health;
    this.health = restHealth;
  }

  /**
   * Tests a connection. On success, caches the discovered tool schemas so the
   * proxy-node palette can populate. No-Network connections report offline
   * without spawning a process (enforced in the backend).
   */
  async test(connection: McpConnection): Promise<McpHealthReport> {
    this.health = {
      ...this.health,
      [connection.id]: { state: "testing", message: "Connecting..." },
    };
    try {
      const report = await invoke<McpHealthReport>("mcp_registry_test", { connection });
      this.health = {
        ...this.health,
        [connection.id]: {
          state: report.ok ? "online" : "offline",
          message: report.message,
        },
      };
      if (report.ok) {
        this.toolsByConn = { ...this.toolsByConn, [connection.id]: report.tools };
      }
      return report;
    } catch (err) {
      const message = String(err);
      this.health = {
        ...this.health,
        [connection.id]: { state: "offline", message },
      };
      return { ok: false, message, tools: [] };
    }
  }

  /**
   * Tools available to the visual palette for a connection, honoring scope:
   * Read-Only connections expose only read-style tools.
   */
  paletteTools(connection: McpConnection): McpToolSchema[] {
    const tools = this.toolsByConn[connection.id] ?? [];
    if (connection.scope === "read-only") {
      return tools.filter((t) => !isWriteTool(t.name));
    }
    return tools;
  }
}

/** Singleton client for managing MCP registry and connections. */
export const mcp = new McpClient();
