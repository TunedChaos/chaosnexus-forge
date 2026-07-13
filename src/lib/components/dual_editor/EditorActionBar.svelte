<!-- chaosnexus-forge/src/lib/components/dual_editor/EditorActionBar.svelte -->
<script lang="ts">
  import type { TabState } from "$lib/types";
  import TabManager from "../TabManager.svelte";

  /**
   * Stable global editor header: open-tabs strip plus Save. Rendered once at
   * full width so tabs stay left-anchored and Save stays right-anchored in
   * every view mode. Per-pane expand/collapse toggles live in pane headers
   * (`EditorPaneHeader`, `MarkdownToolbar`, `VisualToolbar`, preview header).
   */
  interface Props {
    openTabs: TabState[];
    activeTab: TabState | null;
    modifiedFiles: Record<string, boolean>;
    onSelectTab: (tab: TabState) => void;
    onCloseTab: (tab: TabState, e: Event) => void;
    onSave: () => void;
  }

  let { openTabs, activeTab, modifiedFiles, onSelectTab, onCloseTab, onSave }: Props = $props();

  let isActiveModified = $derived(
    activeTab ? modifiedFiles[`${activeTab.pluginName}:${activeTab.filename}`] === true : false
  );
</script>

<div
  data-testid="editor-action-bar"
  class="px-4 h-10 theme-bg-header theme-border-b flex items-center justify-between shrink-0 gap-3"
>
  <TabManager {openTabs} {activeTab} {modifiedFiles} {onSelectTab} {onCloseTab} />

  <div class="flex items-center space-x-2 shrink-0">
    <button
      data-testid="editor-save-btn"
      onclick={onSave}
      disabled={!isActiveModified}
      class="px-2.5 py-0.5 text-xs font-bold uppercase theme-bg-sidebar hover:theme-bg-header theme-text-main border theme-border disabled:opacity-30 rounded transition-all cursor-pointer"
    >
      Save (Ctrl+S)
    </button>
  </div>
</div>
