<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { listen } from "@tauri-apps/api/event";
  import { invoke } from "@tauri-apps/api/core";
  import { engine } from "$lib/engine.svelte";
  import type { UnlistenFn } from "@tauri-apps/api/event";

  interface AnvilInstance {
    pid: number;
    name: string;
    parent: string;
    port: number;
    token: string;
    timestamp: number;
  }

  let instances = $state<AnvilInstance[]>([]);
  let dismissed = $state(false);
  let unlisten: UnlistenFn | null = null;
  let selectedInstancePid = $state<number | null>(null);

  // If the engine is already running/attached, we might not need to show the bar.
  let shouldShow = $derived(
    instances.length > 0 &&
    !dismissed &&
    engine.status !== "running" &&
    engine.status !== "attached"
  );

  onMount(async () => {
    // Seed initial state because the backend can emit the initial instance
    // snapshot before the event listener is registered.
    try {
      const initial = await invoke<AnvilInstance[]>("get_chaoswrench_instances");
      if (Array.isArray(initial) && initial.length > 0) {
        instances = [...initial];
        dismissed = false;
        selectedInstancePid = initial[0].pid;
      }
    } catch (err) {
      console.error("Failed to load ChaosNexus Anvil instances:", err);
    }

    unlisten = await listen<AnvilInstance[]>(
      "chaosnexus-anvil-instances-changed",
      (event) => {
        instances = [...event.payload];
        // Reset dismissal if a new instance pops up that wasn't there before
        // (Simplified: just un-dismiss on any event that brings instances)
        if (instances.length > 0) {
          dismissed = false;
          // Default select the newest one (index 0) if none selected
          if (
            !selectedInstancePid ||
            !instances.some((i) => i.pid === selectedInstancePid)
          ) {
            selectedInstancePid = instances[0].pid;
          }
        }
      }
    );
  });

  onDestroy(() => {
    if (unlisten) unlisten();
  });

  function handleConnect() {
    const inst = instances.find(i => i.pid === selectedInstancePid);
    if (inst) {
      void engine.attachTo(inst.port, inst.token);
      dismissed = true; // hide after connecting
    }
  }

  function handleDismiss() {
    dismissed = true;
  }
</script>

{#if shouldShow}
  <div
    data-testid="chaosnexus-anvil-instance-banner"
    class="w-full bg-blue-900/40 border-b border-blue-500/50 flex items-center justify-between px-4 py-2 text-sm shadow-sm z-50 animate-in slide-in-from-top-2 duration-300"
  >
    <div class="flex items-center gap-3">
      <div class="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/20 text-blue-400">
        <!-- Plug icon -->
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22v-5"/>
          <path d="M9 8V2"/>
          <path d="M15 8V2"/>
          <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>
        </svg>
      </div>
      
      {#if instances.length === 1}
        <span>
          Detected running <strong>ChaosNexus Anvil</strong> instance:
          <span class="font-mono text-blue-300" data-testid="chaosnexus-anvil-instance-name"
            >{instances[0].name}</span
          >
        </span>
      {:else}
        <span>Multiple <strong>ChaosNexus Anvil</strong> instances detected:</span>
        <select 
          bind:value={selectedInstancePid}
          class="bg-black/40 border border-blue-500/30 rounded px-2 py-1 outline-none focus:border-blue-400"
        >
          {#each instances as inst}
            <option value={inst.pid}>{inst.name} (PID: {inst.pid})</option>
          {/each}
        </select>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      <button 
        class="px-3 py-1 bg-blue-600/30 text-blue-100 hover:bg-blue-500 hover:text-white rounded border border-blue-500/50 transition-colors font-medium"
        onclick={handleConnect}
      >
        Connect
      </button>
      <button 
        class="p-1 opacity-60 hover:opacity-100 transition-opacity"
        onclick={handleDismiss}
        aria-label="Dismiss"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  </div>
{/if}
