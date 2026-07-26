// chaosnexus-forge/src/lib/pending.svelte.ts
//
// Client for quarantined plugin approval (HITL gate).

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** Summary of a quarantined plugin pending HITL approval. */
export interface PendingPluginSummary {
  name: string;
  tool_name: string;
  description: string;
  requested_capabilities: string[];
  created_at: string;
}

/** Detailed information about a pending plugin, including sources. */
export interface PendingPluginDetail {
  summary: PendingPluginSummary;
  rhai_source: string;
  plugin_toml: string;
  canvas_sidecar: string;
}

/** All known capability ids (mirrors chaosnexus-anvil Capability::all_ids). */
export const ALL_CAPABILITIES = [
  "shell",
  "process_spawn",
  "net_http",
  "net_tcp",
  "net_ws",
  "host_read",
  "env",
  "db_external",
  "install",
  "fs_cross_plugin",
  "kv_dump",
  "shared_global",
] as const;

/** 
 * Reactive store for managing the pending plugin review lifecycle. 
 */
class PendingStore {
  items = $state<PendingPluginSummary[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);
  /** Currently open review modal plugin name, if any. */
  activeName = $state<string | null>(null);
  detail = $state<PendingPluginDetail | null>(null);
  /** Capability toggles while reviewing. */
  granted = $state<string[]>([]);
  envAllowlist = $state("");
  acting = $state(false);
  isEditingEnabled = $state(false);
  unlisten: UnlistenFn | null = null;

  /**
   * Starts a watcher for changes to pending plugins in the workspace.
   *
   * @param projectPath - The absolute path to the workspace.
   * @returns A promise that resolves when the watcher is started.
   */
  async startWatcher(projectPath: string): Promise<void> {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
    if (!projectPath) return;

    try {
      await invoke("watch_pending_plugins", { projectPath });
      this.unlisten = await listen("pending_plugins_changed", () => {
        // Automatically refresh when filesystem changes are detected
        this.refresh(projectPath);
      });
    } catch (err) {
      console.error("Failed to start pending plugins watcher:", err);
    }
  }

  /**
   * Refreshes the list of pending plugins.
   *
   * @param projectPath - The absolute path to the workspace.
   * @returns A promise that resolves when the refresh is complete.
   */
  async refresh(projectPath: string): Promise<void> {
    if (!projectPath) {
      this.items = [];
      return;
    }
    this.loading = true;
    this.error = null;
    try {
      this.items = await invoke<PendingPluginSummary[]>("list_pending_plugins", { projectPath });
    } catch (err) {
      this.error = String(err);
      this.items = [];
    } finally {
      this.loading = false;
    }
  }

  /**
   * Opens the review modal for a specific plugin.
   *
   * @param projectPath - The absolute path to the workspace.
   * @param name - The name of the plugin to review.
   * @returns A promise that resolves when the details are loaded.
   */
  async openReview(projectPath: string, name: string): Promise<void> {
    this.activeName = name;
    this.detail = null;
    this.granted = [];
    this.envAllowlist = "";
    try {
      const detail = await invoke<PendingPluginDetail>("read_pending_plugin", {
        projectPath,
        pluginName: name,
      });
      this.detail = detail;
      // Default to granting every requested capability so users start
      // from the least restrictive review state (they can uncheck
      // capabilities they don't want).
      this.granted = [...detail.summary.requested_capabilities];
    } catch (err) {
      this.error = String(err);
      this.activeName = null;
    }
  }

  /**
   * Closes the review modal and resets state.
   */
  closeReview(): void {
    this.activeName = null;
    this.detail = null;
    this.granted = [];
    this.envAllowlist = "";
    this.isEditingEnabled = false;
  }

  /**
   * Toggles a capability grant during the review process.
   *
   * @param cap - The capability identifier to toggle.
   */
  toggleCapability(cap: string): void {
    if (this.granted.includes(cap)) {
      this.granted = this.granted.filter((c) => c !== cap);
    } else {
      this.granted = [...this.granted, cap];
    }
  }

  /**
   * Approves the currently active pending plugin.
   *
   * @param projectPath - The absolute path to the workspace.
   * @param onDone - Optional callback to run after successful approval.
   * @returns A promise that resolves when approval completes.
   */
  async approve(projectPath: string, onDone?: () => void): Promise<void> {
    if (!this.activeName) return;
    this.acting = true;
    this.error = null;
    try {
      const envVars = this.envAllowlist
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await invoke("approve_pending_plugin", {
        projectPath,
        pluginName: this.activeName,
        grantedCapabilities: this.granted,
        envAllowlist: envVars,
      });
      this.closeReview();
      await this.refresh(projectPath);
      onDone?.();
    } catch (err) {
      this.error = String(err);
    } finally {
      this.acting = false;
    }
  }

  /**
   * Rejects and permanently removes a pending plugin.
   *
   * @param projectPath - The absolute path to the workspace.
   * @param name - The name of the plugin to reject.
   * @param onDone - Optional callback to run after successful rejection.
   * @returns A promise that resolves when rejection completes.
   */
  async reject(projectPath: string, name: string, onDone?: () => void): Promise<void> {
    this.acting = true;
    this.error = null;
    try {
      await invoke("reject_pending_plugin", { projectPath, pluginName: name });
      if (this.activeName === name) this.closeReview();
      await this.refresh(projectPath);
      onDone?.();
    } catch (err) {
      this.error = String(err);
    } finally {
      this.acting = false;
    }
  }
}

/** Singleton instance of the PendingStore. */
export const pendingPlugins = new PendingStore();
