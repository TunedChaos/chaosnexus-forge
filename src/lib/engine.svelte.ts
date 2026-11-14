// chaosnexus-forge/src/lib/engine.svelte.ts
//
// Reactive client for the live ChaosNexus Anvil engine supervised by the Forge
// backend (see src-tauri/src/engine_supervisor.rs). It listens for streamed
// `engine://log`, `engine://status`, `engine://cvars`, and `engine://traces` events and exposes
// lifecycle controls (start / stop / reload) plus the CVar Controller
// (list / set / save) and Trace Explorer (list / select) consumed by the
// terminal drawer, menu, CVar panel, and trace timeline.

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Engine lifecycle states mirrored from the backend supervisor or attached state. */
export type EngineStatus = "stopped" | "starting" | "running" | "stopping" | "crashed" | "attached";

/** A single streamed log entry; the timestamp is stamped on receipt. */
export interface EngineLog {
  level: string;
  plugin: string;
  message: string;
  time: string;
}

/** A runtime CVar as reported by the supervised engine. */
export interface EngineCvar {
  /** Owning plugin (empty when set purely from the launch config). */
  plugin_name: string;
  name: string;
  value: string;
  description: string;
}

/** A single MCP execution span from the engine trace ring buffer. */
export interface EngineTraceSpan {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  conn_id: string | null;
  hop: number;
  latency_ms: number;
  error: string | null;
  node_label: string | null;
  kind: string;
  started_at_ms: number;
}

/** Maximum number of log lines retained in memory for the terminal drawer. */
const MAX_LOGS = 500;

/** Backend event names (must match engine_supervisor.rs). */
const EVENT_LOG = "engine://log";
const EVENT_STATUS = "engine://status";
const EVENT_CVARS = "engine://cvars";
const EVENT_TRACES = "engine://traces";

interface RawLogPayload {
  level: string;
  plugin: string;
  message: string;
}

interface StatusPayload {
  status: EngineStatus;
  detail?: string;
}

function nowStamp(): string {
  return new Date().toLocaleTimeString();
}

/**
 * Matches the backend error raised when the ChaosNexus Anvil binary cannot be
 * launched because the configured path is missing or wrong (ENOENT on Linux/
 * macOS, "program not found" / os error 2 on Windows). Used to surface the
 * binary-path setup prompt instead of a silent terminal error.
 */
const BINARY_MISSING_RE =
  /failed to spawn|no such file or directory|os error 2|not found|cannot find|enoent/i;

/** 
 * Reactive client for managing the engine lifecycle and state.
 */
class EngineClient {
  /** Current lifecycle status of the supervised engine. */
  status = $state<EngineStatus>("stopped");
  /** Rolling buffer of streamed log lines (oldest first). */
  logs = $state<EngineLog[]>([]);
  /** Latest CVar snapshot from the engine (sorted by name on the backend). */
  cvars = $state<EngineCvar[]>([]);
  /** Latest MCP trace snapshot from the engine ring buffer. */
  traces = $state<EngineTraceSpan[]>([]);
  /** Selected span for error attribution / canvas highlight. */
  selectedTraceSpanId = $state<string | null>(null);
  /**
   * True when the last start attempt failed because the ChaosNexus Anvil binary
   * could not be found. Drives the binary-path setup modal so the user can
   * point the Forge at their `chaosnexus-anvil` executable and retry.
   */
  binarySetupNeeded = $state(false);

  /** Workspace path of the most recent start attempt, replayed on retry. */
  #pendingStartPath = "";

  /** The currently attached Anvil instance port, if any. */
  #activePort: number | null = null;
  /** The currently attached Anvil instance token, if any. */
  #activeToken: string | null = null;

  get activePort(): number | null {
    return this.#activePort;
  }

  get activeToken(): string | null {
    return this.#activeToken;
  }

  /** Node label to highlight on the visual canvas (derived from selection). */
  highlightedNodeLabel = $derived.by(() => {
    if (!this.selectedTraceSpanId) return null;
    const span = this.traces.find((s) => s.span_id === this.selectedTraceSpanId);
    if (!span) return null;
    return span.node_label ?? span.name;
  });

  #initialized = false;
  #unlisteners: Array<() => void> = [];
  /** When true, the next `running` status event triggers `#onReloadComplete`. */
  #pendingWorkspaceRefresh = false;
  #onReloadComplete: (() => void) | null = null;

  /**
   * Registers a callback invoked after an in-process engine reload completes
   * (when `CHAOSFORGE_READY` is received). Used to rescan the workspace for
   * plugins created externally (e.g. via the ChaosNexus Anvil MCP create-script tool).
   *
   * @param callback - The function to call on reload complete, or null to clear.
   */
  setOnReloadComplete(callback: (() => void) | null): void {
    this.#onReloadComplete = callback;
  }

  /** 
   * Registers event listeners and syncs the initial status. Idempotent. 
   *
   * @returns A promise that resolves when initialization completes.
   */
  async init(): Promise<void> {
    if (this.#initialized || typeof window === "undefined") return;
    this.#initialized = true;

    try {
      const unlistenLog = await listen<RawLogPayload>(EVENT_LOG, (event) => {
        this.#pushLog(event.payload);
      });
      const unlistenStatus = await listen<StatusPayload>(EVENT_STATUS, (event) => {
        this.status = event.payload.status;
        if (event.payload.detail) {
          this.#pushLog({ level: "info", plugin: "engine", message: event.payload.detail });
        }
        if (event.payload.status === "running" && this.#pendingWorkspaceRefresh) {
          this.#pendingWorkspaceRefresh = false;
          this.#onReloadComplete?.();
        }
        // CVars only exist while the engine is alive; drop the stale snapshot
        // on any terminal transition so the panel reflects reality.
        if (event.payload.status === "stopped" || event.payload.status === "crashed") {
          this.cvars = [];
          this.traces = [];
          this.selectedTraceSpanId = null;
        }
      });
      const unlistenCvars = await listen<EngineCvar[]>(EVENT_CVARS, (event) => {
        this.cvars = event.payload ?? [];
      });
      const unlistenTraces = await listen<EngineTraceSpan[]>(EVENT_TRACES, (event) => {
        this.traces = event.payload ?? [];
      });
      this.#unlisteners.push(unlistenLog, unlistenStatus, unlistenCvars, unlistenTraces);
    } catch (err) {
      console.error("[engine] Failed to subscribe to engine events:", err);
    }

    // Reconcile with any engine already running (e.g. after a webview reload).
    try {
      const status = (await invoke<string>("engine_status")) as EngineStatus;
      this.status = status;
      // Re-request the snapshot we may have missed before subscribing.
      if (status === "running") {
        void this.listCvars();
        void this.listTraces();
      }
    } catch (err) {
      console.error("[engine] Failed to query engine status:", err);
    }
  }

  /** Tears down event listeners. */
  dispose(): void {
    for (const unlisten of this.#unlisteners) unlisten();
    this.#unlisteners = [];
    this.#initialized = false;
  }

  #pushLog(payload: RawLogPayload): void {
    const entry: EngineLog = { ...payload, time: nowStamp() };
    const next = [...this.logs, entry];
    this.logs = next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next;
  }

  /** 
   * Starts the engine for the given workspace `plugins/` directory. 
   *
   * @param projectPath - The absolute path to the workspace to start the engine for.
   * @returns A promise that resolves when the start command is issued.
   */
  async start(projectPath: string): Promise<void> {
    if (!projectPath) {
      this.#pushLog({
        level: "error",
        plugin: "engine",
        message: "Connect a workspace before starting the engine.",
      });
      return;
    }
    this.status = "starting";
    this.#pendingStartPath = projectPath;
    try {
      await invoke("engine_start", { projectPath });
    } catch (err) {
      this.status = "stopped";
      const message = String(err);
      this.#pushLog({ level: "error", plugin: "engine", message });
      // A missing/incorrect binary path is recoverable: prompt the user to set
      // it rather than burying the failure in the terminal log.
      if (BINARY_MISSING_RE.test(message)) {
        this.binarySetupNeeded = true;
      }
    }
  }

  /** Dismisses the binary-path setup prompt without retrying. */
  dismissBinarySetup(): void {
    this.binarySetupNeeded = false;
  }

  /** 
   * Closes the setup prompt and replays the last start attempt. 
   *
   * @returns A promise that resolves when the start attempt completes.
   */
  async retryStart(): Promise<void> {
    this.binarySetupNeeded = false;
    if (this.#pendingStartPath) await this.start(this.#pendingStartPath);
  }

  /** 
   * Stops the running engine. 
   *
   * @returns A promise that resolves when the engine stops.
   */
  async stop(): Promise<void> {
    try {
      this.#activePort = null;
      this.#activeToken = null;
      await invoke("engine_stop");
    } catch (err) {
      this.#pushLog({ level: "error", plugin: "engine", message: String(err) });
    }
  }

  /** 
   * Requests an in-process plugin reload without restarting the engine. 
   *
   * @returns A promise that resolves when the reload request is sent.
   */
  async reload(): Promise<void> {
    try {
      this.#pendingWorkspaceRefresh = true;
      await invoke("engine_reload");
    } catch (err) {
      this.#pendingWorkspaceRefresh = false;
      this.#pushLog({ level: "error", plugin: "engine", message: String(err) });
    }
  }

  /** Clears the terminal log buffer. */
  clear(): void {
    this.logs = [];
  }

  /** 
   * Attaches to an external running ChaosNexus Anvil instance via SSE (proxied through Rust backend). 
   *
   * @param port - The SSE port to connect to.
   * @param token - The authentication token for the SSE stream.
   * @returns A promise that resolves when attachment starts.
   */
  async attachTo(port: number, token: string): Promise<void> {
    if (!this.#initialized) {
      await this.init();
    }
    
    // Clear logs for the new connection
    this.logs = [];
    this.status = "starting";
    this.#activePort = port;
    this.#activeToken = token;

    try {
      await invoke("engine_attach", { port, token });
    } catch (err) {
      this.status = "stopped";
      this.#pushLog({
        level: "error",
        plugin: "system",
        message: `Failed to invoke engine_attach: ${err}`
      });
    }
  }

  /**
   * Requests a fresh CVar snapshot from the engine. The result arrives
   * asynchronously via the `engine://cvars` event (updating `cvars`).
   *
   * @returns A promise that resolves when the request is sent.
   */
  async listCvars(): Promise<void> {
    try {
      await invoke("engine_cvars_list");
    } catch (err) {
      this.#pushLog({ level: "error", plugin: "engine", message: String(err) });
    }
  }

  /**
   * Updates a CVar live (firing `on_cvar_changed` in the engine). An updated
   * snapshot follows automatically via the `engine://cvars` event.
   *
   * @param name - The name of the CVar to set.
   * @param value - The new value for the CVar.
   * @returns A promise that resolves when the set command is issued.
   */
  async setCvar(name: string, value: string): Promise<void> {
    try {
      await invoke("engine_cvars_set", { name, value });
    } catch (err) {
      this.#pushLog({ level: "error", plugin: "engine", message: String(err) });
    }
  }

  /** 
   * Persists current CVar values to the workspace launch config (cvars.toml). 
   *
   * @returns A promise that resolves when the save request completes.
   */
  async saveCvars(): Promise<void> {
    try {
      await invoke("engine_cvars_save");
    } catch (err) {
      this.#pushLog({ level: "error", plugin: "engine", message: String(err) });
    }
  }

  /**
   * Requests a fresh MCP trace snapshot. The result arrives asynchronously via
   * the `engine://traces` event (updating `traces`).
   *
   * @returns A promise that resolves when the request is sent.
   */
  async listTraces(): Promise<void> {
    try {
      await invoke("engine_traces_list");
    } catch (err) {
      this.#pushLog({ level: "error", plugin: "engine", message: String(err) });
    }
  }

  /** 
   * Selects a trace span for canvas error attribution. 
   *
   * @param spanId - The ID of the trace span to select.
   */
  selectTraceSpan(spanId: string): void {
    this.selectedTraceSpanId = spanId;
  }

  /** Clears trace span selection and canvas highlight. */
  clearTraceSelection(): void {
    this.selectedTraceSpanId = null;
  }
}

/** Singleton instance of the EngineClient for global access. */
export const engine = new EngineClient();
