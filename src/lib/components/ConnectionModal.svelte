<script lang="ts">
  import ModalShell from "./ModalShell.svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { engine } from "$lib/engine.svelte";

  /**
   * Component props for ConnectionModal.
   * @property {boolean} open - Whether the modal is open.
   */
  let { open = $bindable(false) } = $props();

  interface AnvilInstance {
    pid: number;
    name: string;
    parent: string;
    port: number;
    token: string;
    timestamp: number;
  }

  let instances = $state<AnvilInstance[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  let manualPort = $state("");
  let manualToken = $state("");

  $effect(() => {
    if (open) {
      loadInstances();
    }
  });

  async function loadInstances() {
    loading = true;
    error = null;
    try {
      instances = await invoke<AnvilInstance[]>("get_chaoswrench_instances");
    } catch (e) {
      error = String(e);
    } finally {
      loading = false;
    }
  }

  function handleConnect(port: number, token: string) {
    void engine.attachTo(port, token);
    open = false;
  }

  function handleManualConnect(e: Event) {
    e.preventDefault();
    if (!manualPort || !manualToken) return;
    const portNum = parseInt(manualPort, 10);
    if (!isNaN(portNum)) {
      handleConnect(portNum, manualToken);
    }
  }
</script>

<ModalShell {open} onBackdropClick={() => (open = false)}>
  <div class="flex flex-col gap-4 text-sm theme-text-main">
    <h2 class="text-lg font-bold uppercase tracking-widest theme-text-accent border-b theme-border-accent pb-2">
      Connect to ChaosNexus Anvil
    </h2>

    <div>
      <h3 class="font-bold mb-2 uppercase tracking-wider text-xs">Discovered Instances</h3>
      {#if loading}
        <div class="italic opacity-50">Scanning for running engines...</div>
      {:else if error}
        <div class="text-red-400">{error}</div>
      {:else if instances.length === 0}
        <div class="italic opacity-50">No instances found on this machine.</div>
      {:else}
        <div class="flex flex-col gap-2 max-h-48 overflow-y-auto">
          {#each instances as instance}
            <div class="flex items-center justify-between p-2 rounded border theme-border theme-bg-main hover:theme-bg-accent transition-colors group">
              <div>
                <div class="font-bold">{instance.name}</div>
                <div class="text-xs opacity-70">PID: {instance.pid} | Port: {instance.port}</div>
              </div>
              <button
                class="px-3 py-1 bg-green-600/20 text-green-500 border border-green-500/50 rounded hover:bg-green-500 hover:text-black transition-colors"
                onclick={() => handleConnect(instance.port, instance.token)}
              >
                Connect
              </button>
            </div>
          {/each}
        </div>
      {/if}
      <button class="mt-2 text-xs opacity-70 hover:opacity-100 transition-opacity underline" onclick={loadInstances}>
        Refresh List
      </button>
    </div>

    <div class="mt-4 pt-4 border-t theme-border">
      <h3 class="font-bold mb-2 uppercase tracking-wider text-xs">Manual Remote Connection</h3>
      <form class="flex flex-col gap-2" onsubmit={handleManualConnect}>
        <div class="flex gap-2">
          <input
            type="text"
            placeholder="Port"
            bind:value={manualPort}
            class="w-24 px-2 py-1 bg-black/20 border theme-border rounded focus:outline-none focus:theme-border-accent"
          />
          <input
            type="text"
            placeholder="Security Token"
            bind:value={manualToken}
            class="flex-1 px-2 py-1 bg-black/20 border theme-border rounded focus:outline-none focus:theme-border-accent font-mono text-xs"
          />
        </div>
        <button
          type="submit"
          disabled={!manualPort || !manualToken}
          class="mt-1 px-3 py-1.5 rounded border theme-border theme-bg-main hover:theme-bg-accent hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Connect Manually
        </button>
      </form>
    </div>
  </div>
</ModalShell>
