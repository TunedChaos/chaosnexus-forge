<!-- chaosnexus-forge/src/lib/components/dual_editor/EditorPaneHeader.svelte -->
<script lang="ts">
  import IconPanelRightClose from "~icons/lucide/panel-right-close";
  import IconPanelRightOpen from "~icons/lucide/panel-right-open";

  /**
   * Per-pane header row for the code/editor side of a split layout. Carries the
   * divider-edge expand/collapse toggle so the global action bar (tabs + Save)
   * can stay full-width and horizontally stable across all view modes.
   */
  interface Props {
    label?: string;
    viewMode: string;
    onSetViewMode: (mode: "split" | "code" | "visual" | "preview") => void;
  }

  let { label, viewMode, onSetViewMode }: Props = $props();
</script>

<div
  data-testid="editor-pane-header"
  class="px-4 h-10 theme-bg-header theme-border-b flex items-center justify-between shrink-0"
>
  {#if label}
    <span class="text-xs theme-text-muted font-bold uppercase tracking-wider truncate">{label}</span>
  {:else}
    <span></span>
  {/if}

  <button
    data-testid="editor-view-toggle"
    onclick={() => onSetViewMode(viewMode === "split" ? "code" : "split")}
    class="p-1 rounded hover:theme-bg-surface text-zinc-400 hover:text-white transition-colors cursor-pointer border border-transparent hover:theme-border shrink-0"
    title={viewMode === "split" ? "Expand Code View" : "Restore Split View"}
  >
    {#if viewMode === "split"}
      <IconPanelRightClose class="w-4 h-4" />
    {:else}
      <IconPanelRightOpen class="w-4 h-4" />
    {/if}
  </button>
</div>
