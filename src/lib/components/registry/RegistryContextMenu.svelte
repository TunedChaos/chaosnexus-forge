<!-- chaosnexus-forge/src/lib/components/registry/RegistryContextMenu.svelte -->
<script lang="ts">
  /**
   * Properties for the RegistryContextMenu component.
   */
  interface Props {
    show: boolean;
    x: number;
    y: number;
    is_dir: boolean;
    filePath: string;
    fileName: string;
    onNewFile: () => void;
    onRename: () => void;
    onDelete: () => void;
  }

  let {
    show,
    x,
    y,
    is_dir,
    filePath,
    fileName,
    onNewFile,
    onRename,
    onDelete,
  }: Props = $props();
</script>

{#if show}
  <div
    class="fixed z-50 theme-bg-main theme-border shadow-lg rounded py-1 min-w-[150px] font-mono text-sm theme-text-main"
    style="left: {x}px; top: {y}px;"
  >
    <button
      class="w-full text-left px-4 py-1.5 theme-menu-btn cursor-pointer flex justify-between"
      onclick={onNewFile}
    >
      <span>New File...</span>
    </button>

    {#if !is_dir && filePath}
      <div class="my-1 border-t border-zinc-800"></div>
      <button
        class="w-full text-left px-4 py-1.5 theme-menu-btn cursor-pointer flex justify-between"
        onclick={onRename}
      >
        <span>Rename...</span><span class="theme-text-muted text-[10px] ml-4">F2</span>
      </button>
      <button
        class="w-full text-left px-4 py-1.5 theme-menu-btn text-red-500 cursor-pointer flex justify-between"
        onclick={onDelete}
      >
        <span>Delete</span><span class="theme-text-muted text-[10px] ml-4">Delete</span>
      </button>
    {/if}
  </div>
{/if}
