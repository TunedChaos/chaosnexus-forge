<!-- chaosnexus-forge/src/lib/components/AnvilMcpPanel.svelte -->
<script lang="ts">
  /**
   * Forge UI for Anvil `[mcp_servers]` (external proxied MCP). Distinct from Mesh.
   */
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { workbench } from "$lib/state.svelte";

  interface AnvilMcpServer {
    name: string;
    command: string;
    args: string[];
    prefix?: string | null;
  }

  let servers = $state<AnvilMcpServer[]>([]);
  let configPath = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);

  let draftName = $state("");
  let draftCommand = $state("");
  let draftArgs = $state("");
  let draftPrefix = $state("");

  async function refresh() {
    error = null;
    try {
      const project = workbench.projectPath || null;
      configPath = await invoke<string>("anvil_mcp_config_path", { projectPath: project });
      servers = await invoke<AnvilMcpServer[]>("anvil_mcp_list", { projectPath: project });
    } catch (e) {
      error = String(e);
    }
  }

  async function saveServer() {
    if (!draftName.trim() || !draftCommand.trim()) {
      error = "Name and command are required.";
      return;
    }
    busy = true;
    error = null;
    try {
      const args = draftArgs
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await invoke("anvil_mcp_upsert", {
        projectPath: workbench.projectPath || null,
        server: {
          name: draftName.trim(),
          command: draftCommand.trim(),
          args,
          prefix: draftPrefix.trim() || null,
        },
      });
      draftName = "";
      draftCommand = "";
      draftArgs = "";
      draftPrefix = "";
      await refresh();
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }

  async function removeServer(name: string) {
    busy = true;
    error = null;
    try {
      await invoke("anvil_mcp_remove", {
        projectPath: workbench.projectPath || null,
        name,
      });
      await refresh();
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }

  async function applyRestart() {
    busy = true;
    error = null;
    try {
      await invoke("anvil_mcp_apply_restart", {
        projectPath: workbench.projectPath || null,
      });
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    void refresh();
  });
</script>

<div class="flex flex-col h-full min-h-0 theme-bg-sidebar theme-text-main font-mono text-xs" data-testid="anvil-mcp-panel">
  <div class="flex-none px-3 py-2 theme-border-b theme-bg-header flex items-center justify-between gap-2">
    <div>
      <div class="font-bold uppercase tracking-wider">Anvil MCP Servers</div>
      <div class="theme-text-muted text-[10px] truncate max-w-[220px]" title={configPath}>{configPath || "…"}</div>
    </div>
    <button
      type="button"
      class="px-2 py-0.5 rounded border theme-border hover:theme-bg-accent hover:text-white disabled:opacity-50"
      disabled={busy}
      data-testid="anvil-mcp-apply-restart"
      onclick={() => applyRestart()}
    >
      Apply + Restart
    </button>
  </div>

  <p class="flex-none px-3 py-2 theme-text-muted text-[10px] leading-relaxed">
    Tools are proxied by Anvil as <code class="theme-text-accent">cn_a__&#123;prefix&#125;_*</code>. Mesh (left sidebar) is for script authors only.
  </p>

  {#if error}
    <p class="flex-none px-3 text-red-400 text-[10px]">{error}</p>
  {/if}

  <div class="flex-1 min-h-0 overflow-y-auto px-3 space-y-2 pb-2">
    {#each servers as server (server.name)}
      <div class="theme-border border rounded p-2 space-y-1" data-testid="anvil-mcp-server-row">
        <div class="flex justify-between items-center gap-2">
          <span class="font-bold theme-text-accent">{server.name}</span>
          <button
            type="button"
            class="theme-text-muted hover:text-red-400"
            aria-label="Remove Anvil MCP server"
            data-testid="anvil-mcp-remove"
            onclick={() => removeServer(server.name)}
          >
            Remove
          </button>
        </div>
        <div class="theme-text-muted truncate">{server.command} {server.args.join(" ")}</div>
        {#if server.prefix}
          <div class="text-[10px]">prefix: {server.prefix}</div>
        {/if}
      </div>
    {:else}
      <p class="theme-text-muted italic">No Anvil MCP servers configured.</p>
    {/each}
  </div>

  <div class="flex-none theme-border-t p-3 space-y-2">
    <div class="font-bold uppercase text-[10px] tracking-wider">Add server</div>
    <input class="w-full px-2 py-1 rounded border theme-border theme-bg-main" placeholder="name" data-testid="anvil-mcp-name" bind:value={draftName} />
    <input class="w-full px-2 py-1 rounded border theme-border theme-bg-main" placeholder="command" data-testid="anvil-mcp-command" bind:value={draftCommand} />
    <input class="w-full px-2 py-1 rounded border theme-border theme-bg-main" placeholder="args (space-separated)" data-testid="anvil-mcp-args" bind:value={draftArgs} />
    <input class="w-full px-2 py-1 rounded border theme-border theme-bg-main" placeholder="prefix (optional)" data-testid="anvil-mcp-prefix" bind:value={draftPrefix} />
    <button
      type="button"
      class="w-full px-2 py-1 rounded border theme-border theme-bg-accent text-white disabled:opacity-50"
      disabled={busy}
      data-testid="anvil-mcp-save"
      onclick={() => saveServer()}
    >
      Save
    </button>
  </div>
</div>
