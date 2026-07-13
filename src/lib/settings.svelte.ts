/**
 * @file settings.svelte.ts
 * @description Reactive client for backend-persisted Forge settings (`settings.toml`).
 * Engine tab fields are saved via Tauri, while appearance settings typically remain
 * in workbench localStorage.
 */

// chaosnexus-forge/src/lib/settings.svelte.ts

import { invoke } from "@tauri-apps/api/core";

/** Shape mirrored from chaosnexus-forge/src-tauri/src/settings.rs `AppSettings`. */
export interface AppSettingsPayload {
  chaoswrench_bin?: string | null;
  valkey_url?: string | null;
  debug_log?: string | null;
}

/**
 * Client for managing and persisting global application settings.
 */
class AppSettingsClient {
  chaoswrenchBin = $state("");
  valkeyUrl = $state("");
  debugLog = $state("");

  testMessage = $state<string | null>(null);
  testOk = $state<boolean | null>(null);
  saveMessage = $state<string | null>(null);
  saving = $state(false);

  #loaded = false;

  get isLoaded(): boolean {
    return this.#loaded;
  }

  /** Loads persisted settings from the Tauri backend. Idempotent. */
  async load(): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      const remote = await invoke<AppSettingsPayload>("get_app_settings");
      this.applyPayload(remote);
      this.#loaded = true;
    } catch (err) {
      console.error("[settings] Failed to load app settings:", err);
    }
  }

  /**
   * Applies a payload of settings from the backend to the local reactive state.
   *
   * @param payload - The settings payload to apply.
   */
  applyPayload(payload: AppSettingsPayload): void {
    this.chaoswrenchBin = payload.chaoswrench_bin ?? "";
    this.valkeyUrl = payload.valkey_url ?? "";
    this.debugLog = payload.debug_log ?? "";
  }

  /**
   * Converts the current reactive state into a payload suitable for the backend.
   *
   * @returns The serialized application settings payload.
   */
  toPayload(): AppSettingsPayload {
    const trim = (s: string) => {
      const t = s.trim();
      return t.length > 0 ? t : null;
    };
    return {
      chaoswrench_bin: trim(this.chaoswrenchBin),
      valkey_url: trim(this.valkeyUrl),
      debug_log: trim(this.debugLog),
    };
  }

  /** Persists the current engine settings draft to `settings.toml`. */
  async save(): Promise<boolean> {
    this.saving = true;
    this.saveMessage = null;
    try {
      await invoke("set_app_settings", { settings: this.toPayload() });
      this.saveMessage = "Settings saved.";
      return true;
    } catch (err) {
      this.saveMessage = String(err);
      return false;
    } finally {
      this.saving = false;
    }
  }

  /** Probes the configured binary with `--schema-stdout`. */
  async testBinary(): Promise<void> {
    this.testMessage = null;
    this.testOk = null;
    const path = this.chaoswrenchBin.trim();
    if (!path) {
      this.testOk = false;
      this.testMessage = "Enter a ChaosNexus Anvil binary path first.";
      return;
    }
    try {
      const msg = await invoke<string>("test_chaoswrench_bin", { path });
      this.testOk = true;
      this.testMessage = msg;
    } catch (err) {
      this.testOk = false;
      this.testMessage = String(err);
    }
  }

  /** Opens a native file picker and fills the binary path when chosen. */
  async browseBinary(): Promise<void> {
    try {
      const picked = await invoke<string | null>("pick_file");
      if (picked) this.chaoswrenchBin = picked;
    } catch (err) {
      console.error("[settings] pick_file failed:", err);
    }
  }
}

/** Singleton client for accessing and mutating app settings. */
export const appSettings = new AppSettingsClient();
