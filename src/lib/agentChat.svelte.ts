// chaosnexus-forge/src/lib/agentChat.svelte.ts
/**
 * @file agentChat.svelte.ts
 * @description Persisted Agent Chat chrome state (dock/float, open/enabled, size).
 */

const STORAGE_KEY = "chaosforge.agentChat.v1";

export type AgentChatMode = "docked" | "float";

interface PersistedAgentChat {
  open: boolean;
  enabled: boolean;
  mode: AgentChatMode;
  dockWidth: number;
  floatX: number;
  floatY: number;
  floatWidth: number;
  floatHeight: number;
}

function load(): PersistedAgentChat {
  const defaults: PersistedAgentChat = {
    open: true,
    enabled: true,
    mode: "docked",
    dockWidth: 360,
    floatX: 100,
    floatY: 100,
    floatWidth: 350,
    floatHeight: 500,
  };
  if (typeof localStorage === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

/**
 * Reactive Agent Chat layout preferences shared by the root layout and MenuBar.
 */
class AgentChatChrome {
  open = $state(true);
  enabled = $state(true);
  mode = $state<AgentChatMode>("docked");
  dockWidth = $state(360);
  floatX = $state(100);
  floatY = $state(100);
  floatWidth = $state(350);
  floatHeight = $state(500);

  constructor() {
    const p = load();
    this.open = p.open;
    this.enabled = p.enabled;
    this.mode = p.mode;
    this.dockWidth = p.dockWidth;
    this.floatX = p.floatX;
    this.floatY = p.floatY;
    this.floatWidth = p.floatWidth;
    this.floatHeight = p.floatHeight;
  }

  /** Persist current chrome state to localStorage. */
  save(): void {
    if (typeof localStorage === "undefined") return;
    const payload: PersistedAgentChat = {
      open: this.open,
      enabled: this.enabled,
      mode: this.mode,
      dockWidth: this.dockWidth,
      floatX: this.floatX,
      floatY: this.floatY,
      floatWidth: this.floatWidth,
      floatHeight: this.floatHeight,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }

  toggleOpen(): void {
    if (!this.enabled) return;
    this.open = !this.open;
    this.save();
  }

  setEnabled(next: boolean): void {
    this.enabled = next;
    if (!next) this.open = false;
    this.save();
  }

  undock(): void {
    this.mode = "float";
    this.open = true;
    this.save();
  }

  redock(): void {
    this.mode = "docked";
    this.open = true;
    this.save();
  }
}

/** Singleton Agent Chat chrome state. */
export const agentChat = new AgentChatChrome();
