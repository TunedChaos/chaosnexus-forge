<!-- chaosnexus-forge/src/lib/components/dual_editor/DualEditorMarkdownPane.svelte -->
<script lang="ts">
  import MarkdownPreview from "./MarkdownPreview.svelte";
  import IconPanelLeftClose from "~icons/lucide/panel-left-close";
  import IconPanelLeftOpen from "~icons/lucide/panel-left-open";

  /**
   * Properties for the DualEditorMarkdownPane component.
   */
  let {
    activeContent,
    viewMode,
    onSetViewMode,
  }: {
    activeContent: string;
    viewMode: string;
    onSetViewMode: (mode: "split" | "preview") => void;
  } = $props();
</script>

<!-- self-stretch + min-h-0 (not `h-full`) so the pane fills the split row even when content is short; a percentage height collapses to content height on a flex-1 child here. -->
<div class="flex-1 self-stretch min-h-0 flex flex-col overflow-hidden theme-bg-main min-w-0">
  <div class="px-4 py-1.5 h-10 theme-bg-header theme-border-b flex items-center justify-between shrink-0">
    <div class="flex items-center space-x-2 min-w-0">
      <!-- Mirrors the visual-toolbar toggle: expands the preview pane. -->
      <button
        data-testid="markdown-preview-toggle"
        onclick={() => onSetViewMode(viewMode === "split" ? "preview" : "split")}
        class="p-1 rounded hover:theme-bg-surface text-zinc-400 hover:text-white transition-colors cursor-pointer border border-transparent hover:theme-border shrink-0"
        title={viewMode === "split" ? "Expand Preview View" : "Restore Split View"}
      >
        {#if viewMode === "split"}
          <IconPanelLeftClose class="w-4 h-4" />
        {:else}
          <IconPanelLeftOpen class="w-4 h-4" />
        {/if}
      </button>
      <span class="text-xs theme-text-muted font-bold uppercase tracking-wider truncate">
        Markdown Preview
      </span>
    </div>
    <span class="text-xs theme-text-muted font-bold uppercase theme-bg-main px-1 rounded border theme-border shrink-0">
      Live
    </span>
  </div>
  <MarkdownPreview content={activeContent} />
</div>
