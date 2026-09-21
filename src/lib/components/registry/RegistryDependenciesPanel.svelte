<!-- chaosnexus-forge/src/lib/components/registry/RegistryDependenciesPanel.svelte -->
<script lang="ts">
  import type { PluginMetadata } from "$lib/types";
  import ThemedSelect from "$lib/components/ThemedSelect.svelte";
  import { workbench } from "$lib/state.svelte";

  /**
   * Properties for the RegistryDependenciesPanel component.
   */
  interface Props {
    projectPath: string;
    activePlugin: PluginMetadata;
    allPlugins: PluginMetadata[];
    onRefresh: () => void;
  }

  let { projectPath, activePlugin, allPlugins, onRefresh }: Props = $props();

  let deps = $derived(activePlugin.dependencies ?? []);
  let depError = $state<string | null>(null);
  let depSelection = $state("");
  let isSaving = $state(false);

  /** Plugins that can be added as dependencies (exclude self and already listed). */
  let availableDeps = $derived(
    allPlugins
      .map((p) => p.name)
      .filter((name) => name !== activePlugin.name && !deps.includes(name))
      .sort((a, b) => a.localeCompare(b))
  );

  /** ThemedSelect rows for the add-dependency picker. */
  let depOptions = $derived(availableDeps.map((name) => ({ value: name, label: name })));

  async function persistDependencies(next: string[]) {
    depError = null;
    isSaving = true;
    try {
      await workbench.updatePluginDependencies(activePlugin.name, next);
    } catch (err: unknown) {
      depError =
        typeof err === "string" ? err : err instanceof Error ? err.message : "Failed to save dependencies";
    } finally {
      isSaving = false;
    }
  }

  async function handleAddDependency() {
    if (!depSelection || deps.includes(depSelection)) return;
    await persistDependencies([...deps, depSelection]);
    depSelection = "";
  }

  async function handleRemoveDependency(name: string) {
    await persistDependencies(deps.filter((d) => d !== name));
  }
</script>

<div class="px-2 py-2 theme-border-b theme-bg-main shrink-0">
  <div class="flex items-center justify-between mb-1.5">
    <span class="text-[10px] font-bold uppercase tracking-wider theme-text-muted">Dependencies</span>
    {#if isSaving}
      <span class="text-[10px] theme-text-accent animate-pulse">Saving...</span>
    {/if}
  </div>

  <p class="text-[10px] theme-text-muted leading-snug mb-2">
    Plugins listed here load before <span class="font-mono theme-text-main">{activePlugin.name}</span>.
  </p>

  {#if deps.length === 0}
    <p class="text-[10px] theme-text-muted italic mb-2">No dependencies configured.</p>
  {:else}
    <ul class="space-y-1 mb-2">
      {#each deps as dep (dep)}
        <li class="flex items-center justify-between gap-2 theme-bg-sidebar border theme-border rounded px-2 py-1">
          <span class="text-xs font-mono theme-text-main truncate" title={dep}>{dep}</span>
          <button
            type="button"
            onclick={() => handleRemoveDependency(dep)}
            disabled={isSaving}
            class="text-[10px] theme-text-muted hover:text-red-400 transition-colors cursor-pointer disabled:opacity-40 shrink-0"
            title="Remove dependency"
          >
            Remove
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if availableDeps.length > 0}
    <div class="flex items-center gap-1.5">
      <div class="flex-1 min-w-0 text-xs font-mono">
        <ThemedSelect
          testId="dependency-select"
          ariaLabel="Select a plugin to depend on"
          placeholder="Add dependency..."
          value={depSelection}
          options={depOptions}
          disabled={isSaving}
          onChange={(v) => (depSelection = v)}
        />
      </div>
      <button
        type="button"
        onclick={handleAddDependency}
        disabled={!depSelection || isSaving}
        class="px-2 py-1 text-[10px] font-bold uppercase theme-bg-accent-soft theme-text-accent border theme-border-accent-soft hover:theme-border-accent rounded transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        title="Add selected plugin as a dependency"
      >
        + Add
      </button>
    </div>
  {:else}
    <p class="text-[10px] theme-text-muted italic">All other plugins are already listed.</p>
  {/if}

  {#if depError}
    <p class="text-[10px] text-red-400 mt-1.5">{depError}</p>
  {/if}
</div>
