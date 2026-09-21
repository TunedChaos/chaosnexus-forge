// chaosnexus-forge/src/lib/mocks/tauri.ts
// Mock implementation of @tauri-apps/api/core

// Mock state persists across page reloads (needed for "startup" regression
// tests). It is stored in localStorage so Playwright can pre-seed values
// before reload.
type MockPendingPlugin = {
  name: string;
  tool_name: string;
  description: string;
  requested_capabilities: string[];
  created_at: string;
  rhai_source: string;
  plugin_toml: string;
};

const STORAGE_PENDING = "chaosnexus-forge:e2e_mock_pending_plugins";
const STORAGE_PLUGINS = "chaosnexus-forge:e2e_mock_live_plugins";
const STORAGE_INSTANCES = "chaosnexus-forge:e2e_mock_chaoswrench_instances";
const STORAGE_ACTIVE = "chaosnexus-forge:e2e_mock_active";
const STORAGE_SKILLS = "chaosnexus-forge:e2e_mock_skills_rules";
const STORAGE_ANVIL_MCP = "chaosnexus-forge:e2e_mock_anvil_mcp";
const STORAGE_APP_SETTINGS = "chaosnexus-forge:e2e_mock_app_settings";

type MockSkillItem = {
  name: string;
  kind: "rule" | "skill";
  scope: "user" | "project";
  path: string;
  description: string;
  content: string;
};

type MockAnvilMcpServer = {
  name: string;
  command: string;
  args: string[];
  prefix?: string | null;
};

type MockAppSettings = {
  chaoswrench_bin?: string | null;
  valkey_url?: string | null;
  debug_log?: string | null;
  crucible_bin?: string | null;
  crucible_port?: number | null;
  crucible_backend?: string | null;
  hf_token?: string | null;
  crucible_model_id?: string | null;
  crucible_gguf_file?: string | null;
};

function shouldUseStoredE2EState(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_ACTIVE) === "true";
  } catch {
    return false;
  }
}

function readStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStoredJson<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Non-fatal: mock state will remain in-memory only.
  }
}

// Mock in-memory pending plugin queue for browser E2E.
let mockPending: MockPendingPlugin[] = shouldUseStoredE2EState()
  ? readStoredJson<MockPendingPlugin[]>(STORAGE_PENDING, [])
  : [];

// Mock in-memory live plugin list for browser E2E.
const defaultMockPlugins = [
  {
    name: "mock_plugin",
    version: "0.1.0",
    description: "Mock plugin for browser preview.",
    dependencies: [],
    files: [],
  },
];

let mockPlugins: any[] = shouldUseStoredE2EState()
  ? readStoredJson<any[]>(STORAGE_PLUGINS, defaultMockPlugins)
  : defaultMockPlugins;

// Mock ChaosNexus Anvil instances for browser E2E.
let mockInstances: any[] = shouldUseStoredE2EState()
  ? readStoredJson<any[]>(STORAGE_INSTANCES, [])
  : [];

/** In-memory Skills/Rules store for browser E2E (user + project scopes). */
let mockSkillsRules: MockSkillItem[] = shouldUseStoredE2EState()
  ? readStoredJson<MockSkillItem[]>(STORAGE_SKILLS, [])
  : [];

/** In-memory Anvil `[mcp_servers]` list for browser E2E. */
let mockAnvilMcp: MockAnvilMcpServer[] = shouldUseStoredE2EState()
  ? readStoredJson<MockAnvilMcpServer[]>(STORAGE_ANVIL_MCP, [])
  : [];

/** Persisted app settings for get/set round-trips in browser E2E. */
let mockAppSettings: MockAppSettings = shouldUseStoredE2EState()
  ? readStoredJson<MockAppSettings>(STORAGE_APP_SETTINGS, {
      chaoswrench_bin: null,
      valkey_url: null,
      debug_log: null,
    })
  : {
      chaoswrench_bin: null,
      valkey_url: null,
      debug_log: null,
    };

/**
 * Mocks the Tauri `invoke` API for E2E testing in browser environments.
 * Simulates IPC calls to the backend and provides predefined responses based on the command.
 *
 * @param cmd - The Tauri command to execute.
 * @param args - Optional arguments to pass with the command.
 * @returns A promise resolving to the mocked command response.
 */
export async function invoke(cmd: string, args: Record<string, unknown> = {}): Promise<any> {
  console.log(`[Tauri Mock] invoke called: ${cmd}`, args);

  // Add mock responses for specific commands here
  switch (cmd) {
    case "greet":
      return `Hello, ${args.name}! You've been greeted from a test mock!`;
    case "submit_chat_message": {
      const message = String(args.message || "");
      if (message.includes("File system parsing test")) {
        return "File system parsed successfully";
      } else if (message.includes("SQLite plugin test")) {
        return "SQLite plugin operational";
      } else {
        return `Agent received: ${message}`;
      }
    }
    case "load_engine_schema":
    case "sync_engine_schema":
      return JSON.stringify({
        meta: { version: "0.0.0-mock", generated_at: null },
        modules: {
          global: {
            description: "Mock global module for browser/dev mode.",
            functions: [
              {
                name: "mock_func",
                signature: "mock_func(value: &str) -> String",
                return_type: "String",
                parameters: [{ name: "value", type: "&str", description: "A mock parameter." }],
                description: "A mock engine function used when Tauri is unavailable.",
                docs_url: "https://chaosnexus.ai/api/rhai/global/mock_func",
              },
            ],
          },
        },
      });
    case "engine_status":
      return "stopped";
    case "engine_start":
      return "starting";
    case "engine_stop":
      return "stopped";
    case "engine_reload":
      return "reloading";
    case "crucible_status":
      return { status: "stopped", detail: "Mock mode", base_url: null };
    case "crucible_start":
    case "crucible_stop":
    case "crucible_restart":
      return null;
    case "watch_pending_plugins":
      return null;
    case "engine_cvars_list":
    case "engine_cvars_set":
    case "engine_cvars_save":
    case "engine_traces_list":
      // IPC is event-driven; the browser mock has no live engine.
      return null;
    case "get_app_settings":
      return { ...mockAppSettings };
    case "set_app_settings": {
      const incoming = (args.settings ?? {}) as MockAppSettings;
      mockAppSettings = { ...mockAppSettings, ...incoming };
      writeStoredJson(STORAGE_APP_SETTINGS, mockAppSettings);
      return null;
    }
    case "skills_rules_list": {
      const scope = String(args.scope ?? "project") as MockSkillItem["scope"];
      const kind = String(args.kind ?? "rule") as MockSkillItem["kind"];
      return mockSkillsRules
        .filter((item) => item.scope === scope && item.kind === kind)
        .map(({ content: _c, ...summary }) => summary);
    }
    case "skills_rules_read": {
      const path = String(args.path ?? "");
      const item = mockSkillsRules.find((entry) => entry.path === path);
      if (!item) throw new Error(`Skills/Rules path not found: ${path}`);
      return item.content;
    }
    case "skills_rules_write": {
      const scope = String(args.scope ?? "project") as MockSkillItem["scope"];
      const kind = String(args.kind ?? "rule") as MockSkillItem["kind"];
      const name = String(args.name ?? "").trim();
      const content = String(args.content ?? "");
      if (!name) throw new Error("Name is required.");
      const path = `mock://${scope}/${kind}/${name}.md`;
      const next: MockSkillItem = {
        name,
        kind,
        scope,
        path,
        description: content.split("\n").find((line) => line.trim()) ?? "",
        content,
      };
      const idx = mockSkillsRules.findIndex((entry) => entry.path === path);
      if (idx >= 0) mockSkillsRules[idx] = next;
      else mockSkillsRules.push(next);
      writeStoredJson(STORAGE_SKILLS, mockSkillsRules);
      const { content: _c, ...summary } = next;
      return summary;
    }
    case "skills_rules_delete": {
      const path = String(args.path ?? "");
      mockSkillsRules = mockSkillsRules.filter((entry) => entry.path !== path);
      writeStoredJson(STORAGE_SKILLS, mockSkillsRules);
      return null;
    }
    case "anvil_mcp_config_path":
      return args.projectPath
        ? `${String(args.projectPath)}/.chaosnexus/anvil.toml`
        : "/mock/user/.chaosnexus/anvil.toml";
    case "anvil_mcp_list":
      return mockAnvilMcp.map((server) => ({ ...server }));
    case "anvil_mcp_upsert": {
      const server = args.server as MockAnvilMcpServer | undefined;
      if (!server?.name || !server?.command) {
        throw new Error("Anvil MCP server name and command are required.");
      }
      const next: MockAnvilMcpServer = {
        name: String(server.name),
        command: String(server.command),
        args: Array.isArray(server.args) ? server.args.map(String) : [],
        prefix: server.prefix ?? null,
      };
      const idx = mockAnvilMcp.findIndex((entry) => entry.name === next.name);
      if (idx >= 0) mockAnvilMcp[idx] = next;
      else mockAnvilMcp.push(next);
      writeStoredJson(STORAGE_ANVIL_MCP, mockAnvilMcp);
      return null;
    }
    case "anvil_mcp_remove": {
      const name = String(args.name ?? "");
      mockAnvilMcp = mockAnvilMcp.filter((entry) => entry.name !== name);
      writeStoredJson(STORAGE_ANVIL_MCP, mockAnvilMcp);
      return null;
    }
    case "anvil_mcp_apply_restart":
      return null;
    case "pick_file":
      return null;
    case "test_chaoswrench_bin":
      return "Mock mode: ChaosNexus Anvil binary test skipped.";
    case "mcp_registry_list":
      return [];
    case "mcp_registry_add":
      // Echo back a single-item registry so the UI reflects the add optimistically.
      return args.connection ? [args.connection] : [];
    case "mcp_registry_remove":
      return [];
    case "mcp_registry_test":
      return {
        ok: false,
        message: "Mock mode: no live MCP client in browser preview.",
        tools: [],
      };
    case "extract_plugin_functions":
      // Assembly-line manifest (Phase 6): no live engine in browser preview.
      return JSON.stringify([
        { name: "on_plugin_start", params: [], access: "public", doc: "Mock entry actuator." },
      ]);
    case "scan_plugins":
      return mockPlugins;
    case "update_plugin_dependencies":
      return null;
    case "list_pending_plugins":
      return mockPending.map(({ rhai_source: _r, plugin_toml: _p, ...summary }) => summary);
    case "read_pending_plugin": {
      const name = String(args.pluginName ?? "");
      const item = mockPending.find((p) => p.name === name);
      if (!item) throw new Error(`Pending plugin '${name}' not found.`);
      return {
        summary: {
          name: item.name,
          tool_name: item.tool_name,
          description: item.description,
          requested_capabilities: item.requested_capabilities,
          created_at: item.created_at,
        },
        rhai_source: item.rhai_source,
        plugin_toml: item.plugin_toml,
      };
    }
    case "approve_pending_plugin": {
      const name = String(args.pluginName ?? "");
      const idx = mockPending.findIndex((p) => p.name === name);
      if (idx >= 0) mockPending.splice(idx, 1);
      writeStoredJson(STORAGE_PENDING, mockPending);
      return `Approved mock plugin '${name}'.`;
    }
    case "reject_pending_plugin": {
      const name = String(args.pluginName ?? "");
      const idx = mockPending.findIndex((p) => p.name === name);
      if (idx >= 0) mockPending.splice(idx, 1);
      writeStoredJson(STORAGE_PENDING, mockPending);
      return null;
    }
    case "seed_mock_plugins": {
      const incoming = args.plugins;
      const next = Array.isArray(incoming)
        ? incoming.map((p) => ({
            name: String((p as any).name ?? "mock_plugin"),
            version: String((p as any).version ?? "0.1.0"),
            description: String((p as any).description ?? ""),
            dependencies: Array.isArray((p as any).dependencies)
              ? (p as any).dependencies
              : [],
            files: Array.isArray((p as any).files) ? (p as any).files : [],
          }))
        : [];
      mockPlugins = next;
      writeStoredJson(STORAGE_PLUGINS, mockPlugins);
      return null;
    }
    case "get_chaoswrench_instances":
      return mockInstances;
    case "seed_mock_chaoswrench_instances": {
      const incoming = args.instances;
      mockInstances = Array.isArray(incoming) ? incoming : [];
      writeStoredJson(STORAGE_INSTANCES, mockInstances);
      return null;
    }
    case "seed_mock_pending_plugin": {
      const name = String(args.name ?? "mock_pending");
      mockPending = [
        {
          name,
          tool_name: `${name}_run`,
          description: "Mock pending plugin for E2E.",
          requested_capabilities: ["shell"],
          created_at: new Date().toISOString(),
          rhai_source: 'fn execute(tool_name, args) { return "mock"; }',
          plugin_toml: `name = "${name}"\nversion = "0.1.0"\n`,
        },
      ];
      writeStoredJson(STORAGE_PENDING, mockPending);
      return null;
    }
    case "chaoswrench_parse_rhai_ast": {
      const source = String(args.source ?? "");
      return {
        ast_canvas: "",
        rhai_source: source,
      };
    }
    case "get_node_registry":
      return [];
    case "list_agent_profiles":
      return [
        {
          id: "goose",
          name: "Goose CLI Agent",
          binary: "goose",
          args: ["run", "--text", "{prompt}"],
          env: {},
          description: "Block's open-source autonomous CLI agent.",
        },
        {
          id: "agy",
          name: "Antigravity CLI (agy)",
          binary: "agy",
          args: ["exec", "--prompt", "{prompt}"],
          env: {},
          description: "Antigravity autonomous agent CLI.",
        },
        {
          id: "custom",
          name: "Custom CLI Script",
          binary: "sh",
          args: ["-c", "{prompt}"],
          env: {},
          description: "Custom shell command or script runner.",
        },
      ];
    case "pick_folder":
      return "/home/flyingmongoose/Projects/TunedChaos/tuned-chaos/chaosnexus-scripts/plugins";
    case "get_suite_plugins_dir":
    case "get_suite_scripts_dir":
    case "resolve_codex_bin":
      return null;
    case "spawn_cli_agent":
      return null;
    case "stop_cli_agent":
      return true;
    default:
      console.warn(`[Tauri Mock] Unhandled invoke command: ${cmd}`);
      return null;
  }
}

/**
 * Mocks the Tauri `convertFileSrc` API, allowing local file paths to be
 * translated into browser-accessible asset URLs during E2E testing.
 *
 * @param filePath - The local file path to convert.
 * @param protocol - The custom protocol scheme to use (defaults to "asset").
 * @returns The converted asset URL string.
 */
export function convertFileSrc(filePath: string, protocol = "asset"): string {
  console.log(`[Tauri Mock] convertFileSrc called: ${filePath}`);
  return `${protocol}://localhost/${filePath}`;
}

/**
 * Mocks the Tauri `listen` API for global event subscription.
 *
 * @param event - The name of the event to listen for.
 * @param handler - The callback function to execute when the event fires.
 * @returns A promise resolving to an unlisten function.
 */
export async function listen(event: string, handler: Function) {
  console.log(`[Tauri Mock] listen called for event: ${event}`);
  return () => console.log(`[Tauri Mock] unlisten called for event: ${event}`);
}

/**
 * Mocks the Tauri `emit` API for global event broadcasting.
 *
 * @param event - The name of the event to emit.
 * @param payload - Optional payload data to send with the event.
 */
export async function emit(event: string, payload?: unknown) {
  console.log(`[Tauri Mock] emit called for event: ${event}`, payload);
}

// Add other Tauri core API mocks as needed (e.g. event object if still needed somewhere)
/**
 * A mocked implementation of the Tauri `event` module object,
 * providing the `listen` and `emit` methods.
 */
export const event = {
  listen,
  emit,
};

/**
 * Mocks the Tauri `getCurrentWindow` API, providing a dummy window object
 * with minimal methods (metadata, listen) required by frontend components.
 *
 * @returns A mock window object.
 */
export function getCurrentWindow() {
  console.log(`[Tauri Mock] getCurrentWindow called`);
  return {
    metadata: () => ({}),
    listen: listen,
    onCloseRequested: () => Promise.resolve(() => {}),
  };
}
