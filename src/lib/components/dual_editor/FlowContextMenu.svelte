<!-- chaosnexus-forge/src/lib/components/dual_editor/FlowContextMenu.svelte -->
<script lang="ts">
  import type { PaletteItem } from "$lib/dual_editor/node_palette";
  import { filterPaletteItems, groupPaletteItems } from "$lib/dual_editor/node_palette";
  import {
    computeFlyoutPosition,
    type FlyoutPlacement,
  } from "$lib/dual_editor/submenu_position";

  /**
   * Option item representing an available group for a node to join.
   */
  export interface GroupMenuOption {
    id: string;
    label: string;
  }

  /**
   * Properties for the FlowContextMenu component.
   */
  interface Props {
    visible: boolean;
    x: number;
    y: number;
    mode: "pane" | "node" | "group";
    paletteItems: PaletteItem[];
    nodeLabel?: string;
    canUngroup?: boolean;
    availableGroups?: GroupMenuOption[];
    onSelectItem: (item: PaletteItem) => void;
    onEditNode?: () => void;
    onUngroupNode?: () => void;
    onAddToGroup?: (groupId: string) => void;
    onHighlightGroup?: (groupId: string | null) => void;
    onDeleteNode?: () => void;
    onDeleteGroup?: () => void;
    onRenameGroup?: () => void;
    onClose: () => void;
  }

  let {
    visible,
    x,
    y,
    mode,
    paletteItems,
    nodeLabel = "",
    canUngroup = false,
    availableGroups = [],
    onSelectItem,
    onEditNode,
    onUngroupNode,
    onAddToGroup,
    onHighlightGroup,
    onDeleteNode,
    onDeleteGroup,
    onRenameGroup,
    onClose,
  }: Props = $props();

  let search = $state("");
  let addToGroupOpen = $state(false);
  let filtered = $derived(filterPaletteItems(paletteItems, search));
  let grouped = $derived(groupPaletteItems(filtered));

  /** The "Add to group" row the flyout anchors to, and the flyout itself. */
  let addToGroupBtn = $state<HTMLButtonElement | null>(null);
  let submenuEl = $state<HTMLDivElement | null>(null);
  /** Upper bound on the flyout height before it scrolls (matches the CSS cap). */
  const SUBMENU_MAX_HEIGHT = 240;
  let placement = $state<FlyoutPlacement>({
    x: 0,
    y: 0,
    side: "right",
    maxHeight: SUBMENU_MAX_HEIGHT,
  });
  /** Gates rendering until the first measurement so it never flashes top-left. */
  let submenuPlaced = $state(false);

  $effect(() => {
    if (!visible) addToGroupOpen = false;
  });

  // Position the flyout to the side with available space. Runs once on open with
  // an estimated size, then again once the element mounts (submenuEl read here)
  // with the real measured size, correcting any first-pass guess.
  $effect(() => {
    if (!addToGroupOpen || !addToGroupBtn) {
      submenuPlaced = false;
      return;
    }
    const a = addToGroupBtn.getBoundingClientRect();
    const measured = submenuEl?.getBoundingClientRect();
    const menuSize = {
      width: measured?.width || 200,
      height: measured?.height || SUBMENU_MAX_HEIGHT,
    };
    placement = computeFlyoutPosition(
      { x: a.left, y: a.top, width: a.width, height: a.height },
      menuSize,
      { width: window.innerWidth, height: window.innerHeight }
    );
    submenuPlaced = true;
  });
</script>

{#if visible}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[200]"
    role="presentation"
    onclick={() => {
      onHighlightGroup?.(null);
      onClose();
    }}
    oncontextmenu={(e) => {
      e.preventDefault();
      onHighlightGroup?.(null);
      onClose();
    }}
  ></div>

  <div
    class="fixed z-[201] min-w-[220px] max-w-[320px] max-h-[360px] theme-bg-main theme-border border rounded shadow-2xl font-mono text-xs flex flex-col {mode ===
    'pane'
      ? 'overflow-hidden'
      : 'overflow-visible'}"
    style="left: {Math.min(x, window.innerWidth - 240)}px; top: {Math.min(y, window.innerHeight - 380)}px;"
    role="menu"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => {
      if (e.key === "Escape") {
        onHighlightGroup?.(null);
        onClose();
      }
    }}
  >
    {#if mode === "node"}
      <div class="px-2 py-1.5 theme-bg-header theme-border-b theme-text-muted truncate">
        {nodeLabel}
      </div>
      <div class="py-1">
        <button
          type="button"
          class="w-full text-left px-3 py-1.5 theme-menu-btn cursor-pointer"
          onclick={() => {
            onEditNode?.();
            onClose();
          }}
        >
          Edit Logic
        </button>
        {#if availableGroups.length > 0}
          <div
            class="relative"
            role="presentation"
            onmouseleave={() => {
              addToGroupOpen = false;
              onHighlightGroup?.(null);
            }}
          >
            <button
              type="button"
              data-testid="ctx-add-to-group"
              bind:this={addToGroupBtn}
              class="w-full text-left px-3 py-1.5 theme-menu-btn cursor-pointer flex items-center justify-between"
              onmouseenter={() => (addToGroupOpen = true)}
              onclick={() => (addToGroupOpen = true)}
            >
              <span>Add to group</span>
              <span class="theme-text-muted">›</span>
            </button>
            {#if addToGroupOpen}
              <div
                bind:this={submenuEl}
                data-testid="ctx-group-submenu"
                data-side={placement.side}
                class="fixed min-w-[180px] overflow-y-auto theme-bg-main theme-border border rounded shadow-xl py-1 z-[202]"
                style="left: {placement.x}px; top: {placement.y}px; max-height: {Math.min(
                  SUBMENU_MAX_HEIGHT,
                  placement.maxHeight
                )}px; visibility: {submenuPlaced ? 'visible' : 'hidden'};"
              >
                {#each availableGroups as group (group.id)}
                  <button
                    type="button"
                    data-testid="ctx-group-option"
                    data-group-id={group.id}
                    class="w-full text-left px-3 py-1.5 theme-menu-btn cursor-pointer truncate"
                    onmouseenter={() => onHighlightGroup?.(group.id)}
                    onmouseleave={() => onHighlightGroup?.(null)}
                    onclick={() => {
                      onAddToGroup?.(group.id);
                      onHighlightGroup?.(null);
                      onClose();
                    }}
                  >
                    {group.label}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
        {#if canUngroup}
          <button
            type="button"
            class="w-full text-left px-3 py-1.5 theme-menu-btn cursor-pointer"
            onclick={() => {
              onUngroupNode?.();
              onClose();
            }}
          >
            Ungroup
          </button>
        {/if}
        <button
          type="button"
          class="w-full text-left px-3 py-1.5 theme-menu-btn text-red-400 cursor-pointer"
          onclick={() => {
            onDeleteNode?.();
            onClose();
          }}
        >
          Delete
        </button>
      </div>
    {:else if mode === "group"}
      <div class="px-2 py-1.5 theme-bg-header theme-border-b theme-text-muted truncate">
        {nodeLabel}
      </div>
      <div class="py-1">
        <!-- The group menu never opens for main_group (it routes to the pane
             menu instead), so Rename is inherently excluded from main_group. -->
        <button
          type="button"
          data-testid="ctx-rename-group"
          class="w-full text-left px-3 py-1.5 theme-menu-btn cursor-pointer"
          onclick={() => {
            onRenameGroup?.();
            onClose();
          }}
        >
          Rename
        </button>
        {#if canUngroup}
          <button
            type="button"
            data-testid="ctx-detach-group"
            class="w-full text-left px-3 py-1.5 theme-menu-btn cursor-pointer"
            onclick={() => {
              onUngroupNode?.();
              onClose();
            }}
          >
            Detach group
          </button>
        {/if}
        {#if availableGroups.length > 0}
          <div
            class="relative"
            role="presentation"
            onmouseleave={() => {
              addToGroupOpen = false;
              onHighlightGroup?.(null);
            }}
          >
            <button
              type="button"
              data-testid="ctx-move-to-group"
              bind:this={addToGroupBtn}
              class="w-full text-left px-3 py-1.5 theme-menu-btn cursor-pointer flex items-center justify-between"
              onmouseenter={() => (addToGroupOpen = true)}
              onclick={() => (addToGroupOpen = true)}
            >
              <span>Move to group</span>
              <span class="theme-text-muted">›</span>
            </button>
            {#if addToGroupOpen}
              <div
                bind:this={submenuEl}
                data-testid="ctx-group-submenu"
                data-side={placement.side}
                class="fixed min-w-[180px] overflow-y-auto theme-bg-main theme-border border rounded shadow-xl py-1 z-[202]"
                style="left: {placement.x}px; top: {placement.y}px; max-height: {Math.min(
                  SUBMENU_MAX_HEIGHT,
                  placement.maxHeight
                )}px; visibility: {submenuPlaced ? 'visible' : 'hidden'};"
              >
                {#each availableGroups as group (group.id)}
                  <button
                    type="button"
                    data-testid="ctx-group-option"
                    data-group-id={group.id}
                    class="w-full text-left px-3 py-1.5 theme-menu-btn cursor-pointer truncate"
                    onmouseenter={() => onHighlightGroup?.(group.id)}
                    onmouseleave={() => onHighlightGroup?.(null)}
                    onclick={() => {
                      onAddToGroup?.(group.id);
                      onHighlightGroup?.(null);
                      onClose();
                    }}
                  >
                    {group.label}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
        <button
          type="button"
          data-testid="ctx-delete-group"
          class="w-full text-left px-3 py-1.5 theme-menu-btn text-red-400 cursor-pointer"
          onclick={() => {
            onDeleteGroup?.();
            onClose();
          }}
        >
          Delete Group
        </button>
      </div>
    {:else}
      <div class="px-2 py-1.5 theme-bg-header theme-border-b">
        <input
          type="search"
          placeholder="Add node..."
          bind:value={search}
          class="w-full theme-bg-sidebar border theme-border rounded px-2 py-1 text-xs theme-text-main outline-none focus:theme-border-accent"
        />
      </div>
      <div class="overflow-y-auto flex-1 py-1 space-y-2">
        {#if grouped.length === 0}
          <p class="px-3 py-2 theme-text-muted italic">No matching nodes</p>
        {:else}
          {#each grouped as group (group.category)}
            {@const Icon = group.icon}
            <section style="--cat-color: {group.colorToken};">
              <h3
                class="flex items-center gap-1.5 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider theme-text-muted sticky top-0 theme-bg-main"
              >
                <Icon class="w-3 h-3 shrink-0" style="color: var(--cat-color);" aria-hidden="true" />
                {group.label}
              </h3>
              {#each group.items as item (item.id)}
                <button
                  type="button"
                  class="w-full text-left px-3 py-1.5 theme-menu-btn cursor-pointer border-l-2 border-transparent hover:border-[var(--cat-color)]"
                  title={item.description}
                  onclick={() => {
                    onSelectItem(item);
                    onClose();
                  }}
                >
                  <span class="theme-text-main font-bold">{item.label}</span>
                  <span class="block text-[10px] theme-text-muted truncate">{item.description}</span>
                </button>
              {/each}
            </section>
          {/each}
        {/if}
      </div>
    {/if}
  </div>
{/if}
