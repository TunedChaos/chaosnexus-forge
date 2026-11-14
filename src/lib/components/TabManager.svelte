<!-- chaosnexus-forge/src/lib/components/TabManager.svelte -->
<script lang="ts">
  import type { TabState } from "$lib/types";

  /**
   * Properties for the TabManager component.
   */
  interface Props {
    /** List of all currently open tabs. */
    openTabs: TabState[];
    /** The currently active and focused tab, or null if no tab is selected. */
    activeTab: TabState | null;
    /** A record tracking modified state for files, keyed by "pluginName:filename". */
    modifiedFiles: Record<string, boolean>;
    /** Callback invoked when a tab is selected to become the active tab. */
    onSelectTab: (tab: TabState) => void;
    /** Callback invoked when a tab's close button is clicked or middle-clicked. */
    onCloseTab: (tab: TabState, e: Event) => void;
  }

  let { openTabs, activeTab, modifiedFiles, onSelectTab, onCloseTab }: Props = $props();

  function isModified(pluginName: string, filename: string): boolean {
    return modifiedFiles[`${pluginName}:${filename}`] === true;
  }

  function isActive(tab: TabState, active: TabState | null): boolean {
    return (
      active !== null && active.pluginName === tab.pluginName && active.filename === tab.filename
    );
  }

  // Prepend parent folder to plugin.toml to avoid naming collision/confusion
  function getTabTitle(tab: TabState): string {
    if (tab.filename === "plugin.toml") {
      return `${tab.pluginName}/plugin.toml`;
    }
    return tab.filename;
  }
</script>

<!--
  Embeddable tab strip. The host (EditorActionBar) supplies the bar chrome
  (height, background, bottom border); this component is the `flex-1` scroller
  that holds the tabs themselves.
-->
<div
  data-testid="editor-tab-strip"
  class="flex-1 min-w-0 h-full flex items-center overflow-x-auto select-none font-mono text-xs scrollbar-none"
>
  <div class="flex h-full theme-divide-x">
    {#each openTabs as tab}
      <div
        data-testid="editor-tab"
        data-active={isActive(tab, activeTab)}
        role="button"
        tabindex="0"
        onclick={() => onSelectTab(tab)}
        onauxclick={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            onCloseTab(tab, e);
          }
        }}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            onSelectTab(tab);
          }
        }}
        class="h-full px-4 flex items-center space-x-2.5 transition-all border-b border-t text-left min-w-[120px] max-w-[200px] relative group cursor-pointer {isActive(
          tab,
          activeTab
        )
          ? 'theme-bg-main theme-text-main theme-border-accent border-t-transparent'
          : 'theme-bg-sidebar theme-text-muted hover:theme-text-main border-b-transparent border-t-transparent'} focus:outline-none"
        style="border-bottom-width: var(--border-width);"
      >
        <!-- File Name (and mini badge) -->
        <span class="truncate text-xs tracking-tight">{getTabTitle(tab)}</span>

        <!-- Modified state indicator OR Close button -->
        <div class="flex items-center justify-center w-4 h-4 ml-auto relative">
          {#if isModified(tab.pluginName, tab.filename)}
            <!-- Dot for modified, changes to close icon on hover -->
            <div
              class="w-1.5 h-1.5 theme-bg-accent rounded-full group-hover:hidden animate-pulse"
            ></div>
          {/if}

          <!-- Close Icon (only visible on group hover or always for active) -->
          <button
            onclick={(e) => {
              e.stopPropagation();
              onCloseTab(tab, e);
            }}
            class="hidden group-hover:flex rounded-full items-center justify-center w-5 h-5 theme-text-muted hover:theme-text-main hover:bg-zinc-500/20 active:bg-zinc-500/40 active:scale-90 transition-all cursor-pointer border-none"
            title="Close Tab"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2.5"
              stroke="currentColor"
              class="w-3 h-3"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    {/each}
  </div>
</div>
