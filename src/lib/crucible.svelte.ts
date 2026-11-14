// chaosnexus-forge/src/lib/crucible.svelte.ts
/**
 * @file crucible.svelte.ts
 * @description Client for supervised ChaosNexus Crucible (status + start/stop).
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type CrucibleStatus = "starting" | "running" | "stopping" | "stopped" | "crashed";

interface StatusPayload {
  status: string;
  detail?: string | null;
  base_url?: string | null;
}

class CrucibleClient {
  status = $state<CrucibleStatus>("stopped");
  baseUrl = $state("http://127.0.0.1:8080");
  detail = $state<string | null>(null);
  #unlisten: UnlistenFn | null = null;

  async init(): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      const payload = await invoke<StatusPayload>("crucible_status");
      this.apply(payload);
    } catch (err) {
      console.warn("[crucible] status failed:", err);
    }
    if (!this.#unlisten) {
      this.#unlisten = await listen<StatusPayload>("crucible://status", (event) => {
        this.apply(event.payload);
      });
    }
  }

  apply(payload: StatusPayload): void {
    this.status = (payload.status as CrucibleStatus) || "stopped";
    this.detail = payload.detail ?? null;
    if (payload.base_url) this.baseUrl = payload.base_url;
  }

  async start(): Promise<void> {
    await invoke("crucible_start");
  }

  async stop(): Promise<void> {
    await invoke("crucible_stop");
  }

  async restart(): Promise<void> {
    await invoke("crucible_restart");
  }

  get isRunning(): boolean {
    return this.status === "running";
  }
}

/** Singleton Crucible supervisor client. */
export const crucible = new CrucibleClient();
