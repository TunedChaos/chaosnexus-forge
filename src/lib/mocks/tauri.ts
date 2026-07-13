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
    case "engine_cvars_list":
    case "engine_cvars_set":
    case "engine_cvars_save":
    case "engine_traces_list":
      // IPC is event-driven; the browser mock has no live engine.
      return null;
    case "get_app_settings":
      return {
        chaoswrench_bin: null,
        valkey_url: null,
        debug_log: null,
      };
    case "set_app_settings":
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
