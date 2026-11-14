<!-- chaosnexus-forge/src/lib/components/CvarPanel.svelte -->
<script lang="ts">
  // CVar Controller: a live, searchable view of the running engine's CVars with
  // inline editing (applied immediately via `set_cvar`, firing `on_cvar_changed`)
  // and a "Save to launch config" action that persists the current values to the
  // workspace `cvars.toml` so they survive a restart. Mirrors the classic
  // game-server-mod console-variable workflow.
  import { engine } from "$lib/engine.svelte";

  /**
   * Props for the CvarPanel component.
   */
  interface Props {
    /** Optional callback invoked when the user clicks the close button. */
    onClose?: () => void;
  }

  let { onClose }: Props = $props();

  let search = $state("");

  // Per-row edit drafts keyed by CVar name. A draft shadows the snapshot value
  // while the user types, so an incoming snapshot never clobbers in-progress
  // edits. A draft is cleared once a snapshot confirms the committed value.
  let drafts = $state<Record<string, string>>({});

  const isRunning = $derived(engine.status === "running");

  const filtered = $derived(
    engine.cvars.filter((c) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.plugin_name.toLowerCase().includes(q)
      );
    })
  );

  // Reconcile drafts against fresh snapshots: drop any draft the engine has now
  // confirmed (value matches), leaving only genuinely-pending local edits.
  $effect(() => {
    for (const cvar of engine.cvars) {
      if (cvar.name in drafts && drafts[cvar.name] === cvar.value) {
        const { [cvar.name]: _confirmed, ...rest } = drafts;
        drafts = rest;
      }
    }
  });

  function displayValue(name: string, value: string): string {
    return name in drafts ? drafts[name] : value;
  }

  function onInput(name: string, next: string) {
    drafts = { ...drafts, [name]: next };
  }

  function commit(name: string, original: string) {
    if (!(name in drafts)) return;
    const next = drafts[name];
    // Return-early on no-op edits to avoid needless engine round-trips.
    if (next === original) {
      const { [name]: _same, ...rest } = drafts;
      drafts = rest;
      return;
    }
    void engine.setCvar(name, next);
  }

  function onKeydown(event: KeyboardEvent, name: string, original: string) {
    if (event.key === "Enter") {
      event.preventDefault();
      (event.currentTarget as HTMLInputElement).blur();
      commit(name, original);
    } else if (event.key === "Escape") {
      event.preventDefault();
      const { [name]: _cancelled, ...rest } = drafts;
      drafts = rest;
      (event.currentTarget as HTMLInputElement).blur();
    }
  }
</script>

<aside class="h-full flex flex-col theme-bg-sidebar font-mono text-xs border-l theme-border">
  <!-- Header -->
  <div
    class="flex-none flex items-center justify-between px-3 py-1 border-b theme-border theme-text-accent uppercase tracking-widest font-bold"
  >
    <span>CVar Controller</span>
    <div class="flex items-center gap-1.5">
      <button
        class="px-2 py-0.5 rounded border theme-border theme-bg-main hover:theme-bg-accent hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors normal-case tracking-normal"
        title="Refresh the CVar snapshot from the engine"
        disabled={!isRunning}
        onclick={() => engine.listCvars()}
      >
        Refresh
      </button>
      <button
        class="px-2 py-0.5 rounded border theme-border theme-bg-main hover:theme-bg-accent hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors normal-case tracking-normal"
        title="Persist current values to the workspace launch config (cvars.toml)"
        disabled={!isRunning || engine.cvars.length === 0}
        onclick={() => engine.saveCvars()}
      >
        Save to launch config
      </button>
      <button
        class="px-1.5 py-0.5 rounded border theme-border theme-bg-main hover:theme-bg-accent hover:text-white transition-colors normal-case tracking-normal"
        title="Close the CVar Controller"
        aria-label="Close the CVar Controller"
        onclick={() => onClose?.()}
      >
        ✕
      </button>
    </div>
  </div>

  <!-- Search -->
  <div class="flex-none px-3 py-2 border-b theme-border">
    <input
      type="text"
      bind:value={search}
      placeholder="Filter CVars..."
      class="w-full px-2 py-1 rounded border theme-border theme-bg-main theme-text-main outline-none focus:theme-border-accent"
    />
  </div>

  <!-- List -->
  <div class="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-2">
    {#if !isRunning}
      <div class="theme-text-muted italic px-1">
        Start the engine to inspect and edit CVars.
      </div>
    {:else if engine.cvars.length === 0}
      <div class="theme-text-muted italic px-1">No CVars registered by the loaded plugins.</div>
    {:else if filtered.length === 0}
      <div class="theme-text-muted italic px-1">No CVars match "{search}".</div>
    {:else}
      {#each filtered as cvar (cvar.name)}
        <div class="rounded border theme-border theme-bg-main p-2">
          <div class="flex items-baseline justify-between gap-2">
            <span class="theme-text-accent font-bold break-all">{cvar.name}</span>
            {#if cvar.plugin_name}
              <span class="theme-text-muted shrink-0">{cvar.plugin_name}</span>
            {:else}
              <span class="theme-text-muted shrink-0 italic">launch config</span>
            {/if}
          </div>
          {#if cvar.description}
            <p class="theme-text-muted mt-0.5 leading-snug">{cvar.description}</p>
          {/if}
          <input
            type="text"
            value={displayValue(cvar.name, cvar.value)}
            oninput={(e) => onInput(cvar.name, (e.currentTarget as HTMLInputElement).value)}
            onblur={() => commit(cvar.name, cvar.value)}
            onkeydown={(e) => onKeydown(e, cvar.name, cvar.value)}
            class="w-full mt-1.5 px-2 py-1 rounded border theme-border theme-bg-footer theme-text-main outline-none focus:theme-border-accent {cvar.name in
            drafts
              ? 'theme-border-accent'
              : ''}"
          />
        </div>
      {/each}
    {/if}
  </div>
</aside>
