<!-- chaosnexus-forge/src/lib/components/CustomGroupNode.svelte -->
<script lang="ts">
  import { NodeResizer } from "@xyflow/svelte";
  import { GROUP_HEADER_MIN_SIZE } from "$lib/dual_editor/group_geometry";
  import { focus } from "$lib/actions/focus";

  /**
   * Properties for the CustomGroupNode component.
   */
  interface Props {
    /** Unique identifier for this flow node. */
    id: string;
    /** The main data payload for the group node. */
    data: {
      /** The display label/name of the group. */
      label: string;
      /** Indicates whether the group should display a visual highlight effect. */
      highlight?: boolean;
      /** Content floor (px) the manual resize handle may not cross. */
      minWidth?: number;
      /** Minimum height the group can be manually resized to. */
      minHeight?: number;
      /** Commits a manual resize back into the editor's grow-only model. */
      onGroupResize?: (groupId: string) => void;
      /** Transient, monotonically increasing token. The context-menu "Rename"
       *  action increments it to drive this node into rename mode; it is never
       *  serialized into the canvas sidecar (see buildCanvasMetadata). */
      renameToken?: number;
    };
    /** Provided by Svelte Flow; gates the resize handles to the selected group. */
    selected?: boolean;
  }

  let { id, data, selected = false }: Props = $props();

  // Floor so a manual resize can never shrink a group past its members; falls
  // back to the header-fit minimum (keeps the title visible) until the first
  // grow-only recompute publishes the real content floor.
  let minWidth = $derived(data.minWidth ?? GROUP_HEADER_MIN_SIZE.width);
  let minHeight = $derived(data.minHeight ?? GROUP_HEADER_MIN_SIZE.height);

  /** True while the title is an editable input (double-click to enter). */
  let renaming = $state(false);

  // Mirror the last-handled rename token so an advance (from the context-menu
  // "Rename" action) flips into rename mode exactly once, supports renaming the
  // same group repeatedly, and never retriggers on unrelated data updates.
  let lastRenameToken = $state(0);
  $effect(() => {
    const token = data.renameToken ?? 0;
    if (token > lastRenameToken) {
      lastRenameToken = token;
      if (id !== "main_group") renaming = true;
    }
  });

  function startRename(event: MouseEvent): void {
    event.stopPropagation();
    renaming = true;
  }

  function finishRename(): void {
    renaming = false;
  }

  function onRenameKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      finishRename();
    }
  }
</script>

<NodeResizer
  nodeId={id}
  isVisible={selected}
  {minWidth}
  {minHeight}
  handleClass="cf-group-resize-handle"
  lineClass="cf-group-resize-line"
  onResizeEnd={() => data.onGroupResize?.(id)}
/>

<div
  data-testid="flow-group"
  data-group-id={id}
  data-group-highlight={String(!!data.highlight)}
  class="relative w-full h-full theme-bg-accent-soft border-2 border-dashed theme-border-accent rounded-md group/groupnode transition-colors {data.highlight
    ? 'ring-2 ring-primary shadow-lg shadow-primary/30'
    : ''}"
>
  <!-- Header is the primary drag grip. The label is non-interactive during
       normal use so pointer-down initiates a Svelte Flow node drag; double-click
       swaps to an input for rename (nodrag so typing does not move the group). -->
  <div
    data-testid="flow-group-header"
    class="absolute top-0 left-0 w-full bg-black/40 border-b theme-border-accent px-3 py-1 flex items-center justify-between z-[1]"
  >
    {#if id === "main_group"}
      <span class="text-sm font-bold theme-text-main w-full truncate">Main Logic</span>
    {:else if renaming}
      <input
        type="text"
        use:focus
        bind:value={data.label}
        class="nodrag nopan bg-transparent text-sm font-bold theme-text-main focus:outline-none w-full placeholder-zinc-500"
        placeholder="Group Name"
        onblur={finishRename}
        onkeydown={onRenameKeydown}
      />
    {:else}
      <span
        data-testid="flow-group-title"
        role="button"
        tabindex="0"
        title="Double click to rename"
        class="text-sm font-bold theme-text-main w-full truncate cursor-default select-none"
        ondblclick={startRename}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") startRename(e as unknown as MouseEvent);
        }}
      >
        {data.label || "Group Name"}
      </span>
    {/if}
  </div>
</div>
