<!-- chaosnexus-forge/src/lib/components/dual_editor/NodePalettePanel.svelte -->
<script lang="ts">
  import type { PaletteItem } from "$lib/dual_editor/node_palette";
  import { filterPaletteItems, groupPaletteItems } from "$lib/dual_editor/node_palette";

  /**
   * Properties for the NodePalettePanel component.
   */
  interface Props {
    open: boolean;
    items: PaletteItem[];
    onSelectItem: (item: PaletteItem) => void;
    onClose: () => void;
  }

  let { open, items, onSelectItem, onClose }: Props = $props();

  let search = $state("");
  let filtered = $derived(filterPaletteItems(items, search));
  let grouped = $derived(groupPaletteItems(filtered));
</script>

{#if open}
  <div
    class="absolute top-0 right-0 bottom-0 w-[280px] z-30 theme-bg-main theme-border-l border flex flex-col shadow-2xl font-mono text-xs"
    role="complementary"
    aria-label="Node palette"
  >
    <div class="px-3 py-2 theme-bg-header theme-border-b flex items-center justify-between shrink-0">
      <span class="font-bold uppercase tracking-wider theme-text-muted text-[10px]">Node Palette</span>
      <button
        type="button"
        onclick={onClose}
        class="theme-text-muted hover:theme-text-main cursor-pointer text-sm leading-none"
        title="Close palette"
      >
        ×
      </button>
    </div>

    <div class="p-2 shrink-0">
      <input
        type="search"
        placeholder="Search nodes..."
        bind:value={search}
        class="w-full theme-bg-sidebar border theme-border rounded px-2 py-1.5 text-xs theme-text-main outline-none focus:theme-border-accent"
      />
    </div>

    <div class="flex-1 overflow-y-auto px-2 pb-2 space-y-3 min-h-0">
      {#if grouped.length === 0}
        <p class="theme-text-muted italic px-1">No nodes available</p>
      {:else}
        {#each grouped as group (group.category)}
          {@const Icon = group.icon}
          <section style="--cat-color: {group.colorToken};">
            <h3
              class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider theme-text-muted mb-1 px-1 border-l-2 pl-1.5"
              style="border-color: var(--cat-color);"
            >
              <Icon class="w-3 h-3 shrink-0" style="color: var(--cat-color);" aria-hidden="true" />
              {group.label}
            </h3>
            <ul class="space-y-0.5">
              {#each group.items as item (item.id)}
                <li>
                  <button
                    type="button"
                    class="w-full text-left px-2 py-1.5 rounded theme-menu-btn cursor-pointer border-l-2 border-transparent hover:border-[var(--cat-color)]"
                    title={item.description}
                    onclick={() => onSelectItem(item)}
                  >
                    <span class="theme-text-main font-bold text-[11px]">{item.label}</span>
                    <span class="block text-[10px] theme-text-muted truncate">{item.description}</span>
                  </button>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      {/if}
    </div>
  </div>
{/if}
