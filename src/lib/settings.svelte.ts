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
  crucible_bin?: string | null;
  crucible_port?: number | null;
  crucible_backend?: string | null;
  hf_token?: string | null;
  crucible_model_id?: string | null;
  crucible_gguf_file?: string | null;
}

export const DEFAULT_CRUCIBLE_MODEL_ID = "TunedChaos/ChaosNexus_Tuned_v1-GGUF";

/**
 * Client for managing and persisting global application settings.
 */
class AppSettingsClient {
  chaoswrenchBin = $state("");
  valkeyUrl = $state("");
  debugLog = $state("");
  crucibleBin = $state("");
  cruciblePort = $state("8080");
  crucibleBackend = $state("candle");
  hfToken = $state("");
  crucibleModelId = $state(DEFAULT_CRUCIBLE_MODEL_ID);
  crucibleGgufFile = $state("");

  testMessage = $state<string | null>(null);
  testOk = $state<boolean | null>(null);
  saveMessage = $state<string | null>(null);
  saving = $state(false);

  modelStatus = $state<string | null>(null);
  modelPullBusy = $state(false);

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
   */
  applyPayload(payload: AppSettingsPayload): void {
    this.chaoswrenchBin = payload.chaoswrench_bin ?? "";
    this.valkeyUrl = payload.valkey_url ?? "";
    this.debugLog = payload.debug_log ?? "";
    this.crucibleBin = payload.crucible_bin ?? "";
    this.cruciblePort = String(payload.crucible_port ?? 8080);
    this.crucibleBackend = payload.crucible_backend ?? "candle";
    this.hfToken = payload.hf_token ?? "";
    this.crucibleModelId = payload.crucible_model_id ?? DEFAULT_CRUCIBLE_MODEL_ID;
    this.crucibleGgufFile = payload.crucible_gguf_file ?? "";
  }

  /** Converts the current reactive state into a backend payload. */
  toPayload(): AppSettingsPayload {
    const trim = (s: string) => {
      const t = s.trim();
      return t.length > 0 ? t : null;
    };
    const port = Number.parseInt(this.cruciblePort, 10);
    return {
      chaoswrench_bin: trim(this.chaoswrenchBin),
      valkey_url: trim(this.valkeyUrl),
      debug_log: trim(this.debugLog),
      crucible_bin: trim(this.crucibleBin),
      crucible_port: Number.isFinite(port) ? port : 8080,
      crucible_backend: trim(this.crucibleBackend),
      hf_token: trim(this.hfToken),
      crucible_model_id: trim(this.crucibleModelId) ?? DEFAULT_CRUCIBLE_MODEL_ID,
      crucible_gguf_file: trim(this.crucibleGgufFile),
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

  /** Refresh Crucible `/models/status` (Crucible must be running). */
  async refreshModelStatus(): Promise<void> {
    try {
      const status = await invoke<{
        present?: boolean;
        downloading?: boolean;
        ggufPath?: string;
        modelId?: string;
        error?: string | null;
      }>("crucible_models_status");
      if (status.downloading) {
        this.modelStatus = `Downloading ${status.modelId ?? ""}…`;
      } else if (status.present) {
        this.modelStatus = `Ready: ${status.ggufPath ?? status.modelId ?? "cached"}`;
      } else {
        this.modelStatus = `Not cached: ${status.modelId ?? "unknown"} (Pull to download)`;
      }
      if (status.error) this.modelStatus = status.error;
    } catch (err) {
      this.modelStatus = `Status unavailable (start Crucible): ${err}`;
    }
  }

  /** Ensure model is pulled via Crucible HTTP API. */
  async pullModel(): Promise<void> {
    this.modelPullBusy = true;
    this.modelStatus = "Pulling…";
    try {
      // Ensure settings are saved so supervisor has HF token / model id.
      await this.save();
      try {
        await invoke("crucible_start");
      } catch {
        /* may already be running */
      }
      const result = await invoke<{
        present?: boolean;
        ggufPath?: string;
        modelId?: string;
      }>("crucible_models_pull", {
        modelId: this.crucibleModelId.trim() || DEFAULT_CRUCIBLE_MODEL_ID,
        ggufFile: this.crucibleGgufFile.trim() || null,
      });
      this.modelStatus = result.present
        ? `Ready: ${result.ggufPath ?? result.modelId}`
        : "Pull finished but model not marked present.";
    } catch (err) {
      this.modelStatus = String(err);
    } finally {
      this.modelPullBusy = false;
    }
  }
}

/** Singleton client for accessing and mutating app settings. */
export const appSettings = new AppSettingsClient();
