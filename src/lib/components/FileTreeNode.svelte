<!-- chaosnexus-forge/src/lib/components/FileTreeNode.svelte -->
<script lang="ts">
  import type { FileNode } from "$lib/types";
  import { workbench } from "$lib/state.svelte";
  import FileTreeNode from "./FileTreeNode.svelte";

  let {
    node,
    pluginName,
    level = 0,
    onContextMenu,
  } = $props<{
    /** The file or directory node metadata. */
    node: FileNode;
    /** The name of the plugin this file belongs to. */
    pluginName: string;
    /** Indentation level for the file tree visual hierarchy. */
    level?: number;
    /** Callback invoked when the user right-clicks on this node. */
    onContextMenu?: (e: MouseEvent, node: FileNode, pluginName: string) => void;
  }>();

  let isOpen = $state(false);

  function handleClick() {
    workbench.selectedFileNode = {
      pluginName,
      path: node.path,
      is_dir: node.is_dir,
      name: node.name,
    };
    if (node.is_dir) {
      isOpen = !isOpen;
    }
  }

  function handleDblClick() {
    if (!node.is_dir) {
      workbench.openTab(pluginName, node.path);
    }
  }

  function handleContextMenu(e: MouseEvent) {
    if (onContextMenu) {
      onContextMenu(e, node, pluginName);
    }
  }
</script>

<div class="flex flex-col w-full text-xs font-mono">
  <button
    onclick={handleClick}
    ondblclick={handleDblClick}
    oncontextmenu={handleContextMenu}
    data-path={node.path}
    data-plugin={pluginName}
    data-isdir={node.is_dir}
    data-open={isOpen}
    data-level={level}
    data-name={node.name}
    class="tree-node-btn flex items-center text-left py-1.5 cursor-pointer group w-full focus:outline-none {workbench
      .selectedFileNode?.path === node.path && workbench.selectedFileNode?.pluginName === pluginName
      ? 'bg-[var(--color-accent)] text-white'
      : 'hover:theme-bg-header'}"
    style="padding-left: {level * 12 + 8}px; padding-right: 8px;"
  >
    {#if node.is_dir}
      <svg
        class="w-3.5 h-3.5 mr-1.5 theme-text-muted group-hover:theme-text-main transition-transform {isOpen
          ? 'rotate-90'
          : ''}"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
      <span class="font-bold theme-text-main truncate">{node.name}</span>
    {:else}
      <!-- spacer for alignment -->
      <div class="w-5 h-3.5 mr-1.5"></div>

      <svg
        class="w-3.5 h-3.5 mr-1.5 theme-text-muted group-hover:theme-text-main"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
      >
        {#if node.name.endsWith(".rhai")}
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
          />
        {:else}
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        {/if}
      </svg>
      <span
        class="truncate {workbench.activeTab?.pluginName === pluginName &&
        workbench.activeTab?.filename === node.path
          ? 'font-bold'
          : ''} {workbench.selectedFileNode?.path === node.path &&
        workbench.selectedFileNode?.pluginName === pluginName
          ? 'text-white'
          : 'theme-text-muted group-hover:theme-text-main'}">{node.name}</span
      >
    {/if}
  </button>

  {#if node.is_dir && isOpen && node.children}
    <div class="flex flex-col w-full">
      {#each node.children as child}
        <FileTreeNode node={child} {pluginName} level={level + 1} {onContextMenu} />
      {/each}
    </div>
  {/if}
</div>
