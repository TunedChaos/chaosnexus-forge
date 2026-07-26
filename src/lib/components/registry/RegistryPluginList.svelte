<!-- chaosnexus-forge/src/lib/components/registry/RegistryPluginList.svelte -->
<script lang="ts">
  import { tick } from "svelte";
  import type { PluginMetadata } from "$lib/types";

  /**
   * Properties for the RegistryPluginList component.
   */
  interface Props {
    searchQuery: string;
    filteredPlugins: PluginMetadata[];
    selectedPluginNode: string | null;
    sidebarAside: HTMLElement | null;
    onSelectPlugin: (plugin: PluginMetadata) => void;
  }

  let {
    searchQuery = $bindable(""),
    filteredPlugins,
    selectedPluginNode = $bindable(null),
    sidebarAside,
    onSelectPlugin,
  }: Props = $props();

  let searchInput = $state<HTMLInputElement | null>(null);
</script>

<!-- Search Bar -->
<div class="p-2 theme-border-b theme-bg-main">
  <div class="relative flex items-center">
    <svg
      class="absolute left-2.5 w-3.5 h-3.5 theme-text-muted"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
    <input
      bind:this={searchInput}
      type="text"
      placeholder="Search plugins..."
      bind:value={searchQuery}
      onkeydown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          searchInput?.blur();
          if (!selectedPluginNode && filteredPlugins.length > 0) {
            selectedPluginNode = filteredPlugins[0].name;
            tick().then(() => {
              document
                .getElementById(`plugin-node-${selectedPluginNode}`)
                ?.scrollIntoView({ block: "nearest" });
            });
          }
          sidebarAside?.focus();
        }
      }}
      class="w-full pl-8 pr-2.5 py-1.5 theme-bg-sidebar theme-border rounded text-xs focus:outline-none focus:theme-border-accent transition-colors"
    />
  </div>
</div>

<!-- Discovered Plugins List -->
<div class="flex-1 overflow-y-auto p-2 space-y-1.5">
  {#if filteredPlugins.length === 0}
    <div class="text-sm theme-text-muted text-center py-6 italic">
      {#if searchQuery}
        No plugins match your search.
      {:else}
        No valid plugins found in anchor directory. Ensure folders contain 'plugin.toml'.
      {/if}
    </div>
  {:else}
    {#each filteredPlugins as plugin}
      <button
        id="plugin-node-{plugin.name}"
        ondblclick={() => onSelectPlugin(plugin)}
        onclick={() => {
          selectedPluginNode = plugin.name;
        }}
        class="w-full text-left p-2 rounded border transition-all text-sm group cursor-pointer flex flex-col space-y-1 {selectedPluginNode ===
        plugin.name
          ? 'bg-[var(--color-accent)] theme-border-accent'
          : 'theme-bg-main hover:theme-bg-header theme-border hover:theme-border'} focus:outline-none"
      >
        <div class="flex items-center justify-between w-full">
          <span
            class="font-bold tracking-tight transition-colors {selectedPluginNode === plugin.name
              ? 'text-white'
              : 'theme-text-main group-hover:theme-text-accent'}">{plugin.name}</span
          >
          <span
            class="text-xs font-bold px-1 py-0.5 rounded {selectedPluginNode === plugin.name
              ? 'bg-white/20 text-white'
              : 'theme-bg-sidebar theme-text-muted'}">{plugin.version}</span
          >
        </div>
        {#if plugin.description}
          <p
            class="text-xs line-clamp-2 leading-normal {selectedPluginNode === plugin.name
              ? 'text-white/80'
              : 'theme-text-muted'}"
          >
            {plugin.description}
          </p>
        {/if}
        <div
          class="flex items-center text-xs font-mono mt-1 transition-colors {selectedPluginNode ===
          plugin.name
            ? 'text-white'
            : 'theme-text-muted group-hover:theme-text-main'}"
        >
          <svg class="w-3.5 h-3.5 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
          Explore Files
        </div>
      </button>
    {/each}
  {/if}
</div>
