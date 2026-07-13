<!-- chaosnexus-forge/src/lib/components/VisualToolbar.svelte -->
<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import IconPanelLeftClose from "~icons/lucide/panel-left-close";
  import IconPanelLeftOpen from "~icons/lucide/panel-left-open";
  import IconPanelRightClose from "~icons/lucide/panel-right-close";
  import IconPanelRightOpen from "~icons/lucide/panel-right-open";
  import IconPlus from "~icons/lucide/plus";
  import IconGroup from "~icons/lucide/group";
  import IconUndo from "~icons/lucide/undo-2";
  import IconRedo from "~icons/lucide/redo-2";
  import IconScan from "~icons/lucide/scan-search";
  import IconChevronDown from "~icons/lucide/chevron-down";
  import { workbench } from "$lib/state.svelte";

  let viewMode = $derived(workbench.activeTab?.viewMode || "split");

  function toggleViewMode() {
    if (!workbench.activeTab) return;
    workbench.setTabViewMode(
      workbench.activeTab.pluginName,
      workbench.activeTab.filename,
      viewMode === "split" ? "visual" : "split"
    );
  }

  let {
    paletteOpen = $bindable(false),
    onNewGroup,
    onUndo,
    onRedo,
    canUndo = false,
    canRedo = false,
    onAddNode,
  } = $props<{
    /** Whether the right-side properties palette is open. */
    paletteOpen?: boolean;
    /** Callback triggered to wrap selected nodes into a new group. */
    onNewGroup: () => void;
    /** Callback triggered to undo the last graph action. */
    onUndo: () => void;
    /** Callback triggered to redo the last undone graph action. */
    onRedo: () => void;
    /** Whether the undo action is currently available. */
    canUndo?: boolean;
    /** Whether the redo action is currently available. */
    canRedo?: boolean;
    /** Callback triggered to add a new node to the canvas at an optional anchor. */
    onAddNode: (anchor?: DOMRect) => void;
  }>();

  const { fitView } = useSvelteFlow();

  let viewMenuOpen = $state(false);

  function handleFocusMain() {
    fitView({ nodes: [{ id: "main_group" }], duration: 800 });
    viewMenuOpen = false;
  }

  function handleReCenter() {
    fitView({ duration: 800 });
    viewMenuOpen = false;
  }

  function handleFitView() {
    fitView({ duration: 0 });
    viewMenuOpen = false;
  }
</script>

<div
  class="px-3 py-1.5 h-10 theme-bg-header theme-border-b flex items-center justify-between z-10 w-full shrink-0"
>
  <div class="flex items-center gap-2 min-w-0">
    <button
      data-testid="visual-view-toggle"
      onclick={toggleViewMode}
      class="p-1 rounded hover:theme-bg-surface text-zinc-400 hover:text-white transition-colors cursor-pointer border border-transparent hover:theme-border shrink-0"
      title={viewMode === "split" ? "Expand Visual View" : "Restore Split View"}
    >
      {#if viewMode === "split"}
        <IconPanelLeftClose class="w-4 h-4" />
      {:else}
        <IconPanelLeftOpen class="w-4 h-4" />
      {/if}
    </button>
    <span class="text-xs theme-text-muted font-bold uppercase tracking-wider truncate"
      >Visual Canvas</span
    >

    <div class="h-4 w-px theme-bg-border mx-1 shrink-0"></div>

    <button
      id="vs-add-node-btn"
      onclick={(e) => onAddNode((e.currentTarget as HTMLButtonElement).getBoundingClientRect())}
      class="px-2 py-0.5 text-xs font-bold uppercase theme-bg-accent-soft theme-text-accent theme-border-accent border rounded transition-all cursor-pointer shrink-0 flex items-center gap-1 hover:brightness-110"
      title="Right click on the grid to place at mouse (Ctrl+A)"
    >
      <IconPlus class="w-3.5 h-3.5" />
      Add Node
    </button>

    <button
      data-testid="visual-new-group-btn"
      onclick={onNewGroup}
      class="px-2 py-0.5 text-xs font-bold uppercase theme-bg-sidebar hover:theme-bg-header theme-text-main border theme-border rounded transition-all cursor-pointer shrink-0 flex items-center gap-1"
      title="Create a group (wraps the selection, or adds an empty group)"
    >
      <IconGroup class="w-3.5 h-3.5" />
      New Group
    </button>

    <div class="h-4 w-px theme-bg-border mx-1 shrink-0"></div>

    <button
      data-testid="visual-undo-btn"
      onclick={onUndo}
      disabled={!canUndo}
      class="p-1 rounded text-zinc-400 transition-colors cursor-pointer border border-transparent shrink-0 enabled:hover:theme-bg-surface enabled:hover:text-white enabled:hover:theme-border disabled:opacity-40 disabled:cursor-not-allowed"
      title="Undo (Ctrl+Z)"
    >
      <IconUndo class="w-4 h-4" />
    </button>

    <button
      data-testid="visual-redo-btn"
      onclick={onRedo}
      disabled={!canRedo}
      class="p-1 rounded text-zinc-400 transition-colors cursor-pointer border border-transparent shrink-0 enabled:hover:theme-bg-surface enabled:hover:text-white enabled:hover:theme-border disabled:opacity-40 disabled:cursor-not-allowed"
      title="Redo (Ctrl+Shift+Z)"
    >
      <IconRedo class="w-4 h-4" />
    </button>

    <div class="h-4 w-px theme-bg-border mx-1 shrink-0"></div>

    <div class="relative shrink-0">
      <button
        onclick={() => (viewMenuOpen = !viewMenuOpen)}
        class="px-2 py-0.5 text-xs font-bold uppercase border rounded transition-all cursor-pointer shrink-0 flex items-center gap-1
          {viewMenuOpen
          ? 'theme-bg-accent-soft theme-text-accent theme-border-accent'
          : 'theme-bg-sidebar hover:theme-bg-header theme-text-main theme-border'}"
        title="Camera and framing options"
      >
        <IconScan class="w-3.5 h-3.5" />
        View
        <IconChevronDown class="w-3 h-3" />
      </button>

      {#if viewMenuOpen}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="fixed inset-0 z-[200]"
          role="presentation"
          onclick={() => (viewMenuOpen = false)}
        ></div>
        <div
          class="absolute left-0 top-full mt-1 z-[201] min-w-[180px] theme-bg-main theme-border border rounded shadow-2xl font-mono text-xs py-1"
          role="menu"
          tabindex="-1"
        >
          <button
            type="button"
            class="w-full text-left px-3 py-1.5 theme-menu-btn cursor-pointer"
            onclick={handleFocusMain}
          >
            <span class="theme-text-main font-bold">Focus Main</span>
            <span class="block text-[10px] theme-text-muted">Animate to the main execution group</span>
          </button>
          <button
            type="button"
            class="w-full text-left px-3 py-1.5 theme-menu-btn cursor-pointer"
            onclick={handleReCenter}
          >
            <span class="theme-text-main font-bold">Re-Center</span>
            <span class="block text-[10px] theme-text-muted">Animate to fit the entire graph</span>
          </button>
          <button
            type="button"
            class="w-full text-left px-3 py-1.5 theme-menu-btn cursor-pointer"
            onclick={handleFitView}
          >
            <span class="theme-text-main font-bold">Fit View</span>
            <span class="block text-[10px] theme-text-muted">Instantly fit the entire graph</span>
          </button>
        </div>
      {/if}
    </div>
  </div>

  <button
    onclick={() => (paletteOpen = !paletteOpen)}
    class="px-2 py-0.5 text-xs font-bold uppercase border rounded transition-all cursor-pointer shrink-0 flex items-center gap-1 ml-2
      {paletteOpen
      ? 'theme-bg-accent-soft theme-text-accent theme-border-accent'
      : 'theme-bg-sidebar hover:theme-bg-header theme-text-main theme-border'}"
    title="Toggle node palette panel"
  >
    {#if paletteOpen}
      <IconPanelRightClose class="w-3.5 h-3.5" />
    {:else}
      <IconPanelRightOpen class="w-3.5 h-3.5" />
    {/if}
    Palette
  </button>
</div>
