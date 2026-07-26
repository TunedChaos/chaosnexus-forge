<!-- chaosnexus-forge/src/lib/components/McpRegistryPanel.svelte -->
<script lang="ts">
  // MCP Mesh registry sidebar (Phase 4): manage downstream MCP servers for the
  // active workspace. Add/remove/test connections (persisted to
  // .chaosnexus-forge/mcp_registry.toml) and inspect the tools each server exposes.
  // Testing a connection populates the proxy-node palette in the visual toolbar.
  import { onMount } from "svelte";
  import { mcp, type McpConnection, type McpScope } from "$lib/mcp.svelte";
  import { workbench } from "$lib/state.svelte";
  import ThemedSelect from "$lib/components/ThemedSelect.svelte";

  const SCOPES: { value: McpScope; label: string }[] = [
    { value: "read-only", label: "Read-Only" },
    { value: "read-write", label: "Read-Write" },
    { value: "no-network", label: "No-Network" },
  ];

  let showAdd = $state(false);
  let formId = $state("");
  let formLabel = $state("");
  let formCommand = $state("");
  let formArgs = $state("");
  let formScope = $state<McpScope>("read-only");
  let formError = $state("");

  onMount(() => {
    void mcp.load();
  });

  function resetForm() {
    formId = "";
    formLabel = "";
    formCommand = "";
    formArgs = "";
    formScope = "read-only";
    formError = "";
  }

  async function handleAdd() {
    formError = "";
    const id = formId.trim();
    if (!id) {
      formError = "Connection id is required.";
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      formError = "Id may only contain letters, numbers, '_' and '-'.";
      return;
    }
    if (!formCommand.trim()) {
      formError = "Launch command is required.";
      return;
    }
    const connection: McpConnection = {
      id,
      label: formLabel.trim() || id,
      command: formCommand.trim(),
      // Whitespace-delimited launch arguments (most MCP server args are token-like).
      args: formArgs.trim() ? formArgs.trim().split(/\s+/) : [],
      scope: formScope,
    };
    try {
      await mcp.upsert(connection);
      showAdd = false;
      resetForm();
    } catch (err) {
      formError = String(err);
    }
  }

  function healthDot(id: string): string {
    switch (mcp.health[id]?.state) {
      case "online":
        return "bg-green-500";
      case "offline":
        return "bg-red-500";
      case "testing":
        return "bg-yellow-500 animate-pulse";
      default:
        return "bg-zinc-500";
    }
  }

  function scopeLabel(scope: McpScope): string {
    return SCOPES.find((s) => s.value === scope)?.label ?? scope;
  }
</script>

<div class="h-full flex flex-col theme-bg-sidebar theme-text-main font-mono text-sm select-none">
  <!-- Header -->
  <div class="p-4 theme-bg-header theme-border-b flex items-center justify-between">
    <div class="flex items-center space-x-2">
      <div class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
      <span class="font-bold uppercase tracking-wider theme-text-main">MCP Mesh</span>
    </div>
    <button
      onclick={() => mcp.load(true)}
      class="p-1 theme-text-muted hover:theme-text-accent rounded transition-colors cursor-pointer"
      title="Reload registry"
      aria-label="Reload registry"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="w-4 h-4">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
        />
      </svg>
    </button>
  </div>

  {#if !workbench.projectPath}
    <div class="flex-1 flex items-center justify-center text-center theme-text-muted italic p-4">
      Connect a workspace to manage MCP connections.
    </div>
  {:else}
    <!-- Action bar -->
    <div class="p-2 theme-border-b flex">
      <button
        onclick={() => {
          showAdd = !showAdd;
          formError = "";
        }}
        class="flex-1 py-1.5 theme-bg-accent-soft hover:bg-opacity-80 theme-text-accent border theme-border-accent rounded font-bold uppercase text-xs tracking-wider transition-colors cursor-pointer text-center"
      >
        {showAdd ? "Cancel" : "+ Add Connection"}
      </button>
    </div>

    <!-- Add form -->
    {#if showAdd}
      <div class="p-3 theme-bg-main theme-border-b space-y-2">
        <input
          bind:value={formId}
          placeholder="id (e.g. github)"
          class="w-full px-2 py-1 rounded border theme-border theme-bg-sidebar theme-text-main text-xs outline-none focus:theme-border-accent"
        />
        <input
          bind:value={formLabel}
          placeholder="label (optional)"
          class="w-full px-2 py-1 rounded border theme-border theme-bg-sidebar theme-text-main text-xs outline-none focus:theme-border-accent"
        />
        <input
          bind:value={formCommand}
          placeholder="command (e.g. npx)"
          class="w-full px-2 py-1 rounded border theme-border theme-bg-sidebar theme-text-main text-xs outline-none focus:theme-border-accent"
        />
        <input
          bind:value={formArgs}
          placeholder="args (space-separated)"
          class="w-full px-2 py-1 rounded border theme-border theme-bg-sidebar theme-text-main text-xs outline-none focus:theme-border-accent"
        />
        <div class="text-xs">
          <ThemedSelect
            testId="mcp-scope-select"
            ariaLabel="Connection scope"
            value={formScope}
            options={SCOPES}
            onChange={(v) => (formScope = v as McpScope)}
          />
        </div>
        {#if formError}
          <p class="text-red-400 text-xs">{formError}</p>
        {/if}
        <button
          onclick={handleAdd}
          class="w-full py-1.5 theme-bg-accent text-white rounded font-bold uppercase text-xs tracking-wider hover:bg-opacity-80 transition-colors cursor-pointer"
        >
          Save Connection
        </button>
      </div>
    {/if}

    <!-- Connection list -->
    <div class="flex-1 overflow-y-auto p-2 space-y-2">
      {#if mcp.connections.length === 0}
        <div class="text-xs theme-text-muted text-center py-6 italic">
          No MCP connections yet. Add one to discover and proxy external tools.
        </div>
      {:else}
        {#each mcp.connections as conn (conn.id)}
          <div class="rounded border theme-border theme-bg-main p-2 space-y-1.5">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="w-2 h-2 rounded-full shrink-0 {healthDot(conn.id)}"></span>
                <span class="font-bold truncate theme-text-main">{conn.label}</span>
              </div>
              <span
                class="text-[10px] font-bold px-1 py-0.5 rounded theme-bg-sidebar theme-text-muted shrink-0"
                title="Permission scope">{scopeLabel(conn.scope)}</span
              >
            </div>
            <div class="text-[11px] theme-text-muted truncate" title="{conn.command} {conn.args.join(' ')}">
              {conn.command}
              {conn.args.join(" ")}
            </div>
            {#if mcp.health[conn.id]?.message}
              <div
                class="text-[11px] {mcp.health[conn.id].state === 'offline'
                  ? 'text-red-400'
                  : 'theme-text-muted'}"
              >
                {mcp.health[conn.id].message}
              </div>
            {/if}

            <!-- Discovered tools -->
            {#if mcp.paletteTools(conn).length > 0}
              <div class="flex flex-wrap gap-1 pt-0.5">
                {#each mcp.paletteTools(conn) as tool}
                  <span
                    class="text-[10px] px-1 py-0.5 rounded theme-bg-sidebar theme-text-accent border theme-border"
                    title={tool.description}>{tool.name}</span
                  >
                {/each}
              </div>
            {/if}

            <div class="flex items-center gap-1.5 pt-1">
              <button
                onclick={() => mcp.test(conn)}
                disabled={mcp.health[conn.id]?.state === "testing"}
                class="flex-1 px-2 py-0.5 text-xs rounded border theme-border theme-bg-sidebar hover:theme-bg-accent hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Test the connection and discover its tools"
              >
                Test
              </button>
              <button
                onclick={() => mcp.remove(conn.id)}
                class="px-2 py-0.5 text-xs rounded border theme-border theme-bg-sidebar hover:bg-red-500 hover:text-white transition-colors"
                title="Remove connection"
              >
                Remove
              </button>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
