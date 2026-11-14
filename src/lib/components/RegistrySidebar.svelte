<!-- chaosnexus-forge/src/lib/components/RegistrySidebar.svelte -->
<script lang="ts">
  import { tick, onMount, onDestroy } from "svelte";
  import type { PluginMetadata } from "$lib/types";

  /**
   * Properties for the RegistrySidebar component.
   */
  interface Props {
    /** Absolute path to the currently connected workspace project. */
    projectPath: string;
    /** Array of all available plugins discovered in the workspace. */
    plugins: PluginMetadata[];
    /** The currently selected plugin, or null if no plugin is active. */
    activePlugin: PluginMetadata | null;
    /** Callback invoked when a plugin is selected from the registry list. */
    onSelectPlugin: (plugin: PluginMetadata) => void;
    /** Callback invoked to disconnect from the current workspace. */
    onDisconnect: () => void;
    /** Callback invoked to rescan and refresh the plugin list. */
    onRefresh: () => void;
  }

  let { projectPath, plugins, activePlugin, onSelectPlugin, onDisconnect, onRefresh }: Props =
    $props();

  import { workbench } from "$lib/state.svelte";
  import FileTreeNode from "./FileTreeNode.svelte";
  import RegistrySidebarModals from "./registry/RegistrySidebarModals.svelte";
  import RegistryDependenciesPanel from "./registry/RegistryDependenciesPanel.svelte";
  import RegistryPluginList from "./registry/RegistryPluginList.svelte";
  import RegistryContextMenu from "./registry/RegistryContextMenu.svelte";
  import PendingApprovalsPanel from "./PendingApprovalsPanel.svelte";
  import { copyToClipboard } from "$lib/console_io";

  let sidebarAside = $state<HTMLElement | null>(null);
  let searchInput = $state<HTMLInputElement | null>(null);
  let searchQuery = $state("");
  let selectedPluginNode = $state<string | null>(null);
  let filteredPlugins = $derived(
    plugins.filter(
      (p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()))
    )
  );

  // Transient "Copied!" confirmation for the workspace anchor copy button.
  let anchorCopied = $state(false);
  let anchorCopyTimer: ReturnType<typeof setTimeout> | null = null;

  async function copyWorkspaceAnchor() {
    if (!(await copyToClipboard(projectPath))) return;
    anchorCopied = true;
    if (anchorCopyTimer) clearTimeout(anchorCopyTimer);
    anchorCopyTimer = setTimeout(() => (anchorCopied = false), 1500);
  }

  // Read-only path field: sync value only when the anchor changes (not on every
  // render) so the caret is not reset, and block mutations via events instead of
  // the readonly attribute (WebKit/Tauri often hides the caret on readonly inputs).
  let anchorInput = $state<HTMLInputElement | null>(null);

  function scrollAnchorToEnd() {
    const el = anchorInput;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
  }

  $effect(() => {
    const path = projectPath;
    const el = anchorInput;
    if (!el || el.value === path) return;
    el.value = path;
    void tick().then(scrollAnchorToEnd);
  });

  /** Block any edit that would change the displayed path. */
  function blockAnchorMutation(e: InputEvent) {
    e.preventDefault();
  }

  /** Allow navigation/selection shortcuts; reject typing and deletion. */
  function handleAnchorKeydown(e: KeyboardEvent) {
    const key = e.key;
    if (
      key === "ArrowLeft" ||
      key === "ArrowRight" ||
      key === "ArrowUp" ||
      key === "ArrowDown" ||
      key === "Home" ||
      key === "End" ||
      key === "PageUp" ||
      key === "PageDown" ||
      key === "Tab" ||
      key === "Escape"
    ) {
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      const shortcut = key.toLowerCase();
      if (shortcut === "a" || shortcut === "c") return;
      e.preventDefault();
      return;
    }
    if (key === "Shift" || key === "Control" || key === "Alt" || key === "Meta") return;
    e.preventDefault();
  }

  let newName = $state("");
  let newDesc = $state("");
  let createError = $state("");
  let isCreating = $state(false);

  async function handleCreatePlugin() {
    if (!newName.trim()) {
      createError = "Plugin name is required";
      return;
    }

    isCreating = true;
    createError = "";

    try {
      const pluginName = newName.trim();
      await workbench.createPlugin(pluginName, newDesc.trim());
      newName = "";
      newDesc = "";
      workbench.showCreateModal = false;
    } catch (err: any) {
      createError = typeof err === "string" ? err : err.message || "Failed to create plugin";
    } finally {
      isCreating = false;
    }
  }

  // --- Context Menu Logic ---
  let contextMenu = $state({
    show: false,
    x: 0,
    y: 0,
    pluginName: "",
    dirPath: "",
    is_dir: false,
    filePath: "",
    fileName: "",
  });

  function closeContextMenu() {
    contextMenu.show = false;
  }

  function handleContextMenu(e: MouseEvent, node: any, pluginName: string) {
    e.preventDefault();
    e.stopPropagation();
    workbench.selectedFileNode = {
      pluginName,
      path: node.path,
      is_dir: node.is_dir,
      name: node.name,
    };
    contextMenu = {
      show: true,
      x: e.clientX,
      y: e.clientY,
      pluginName,
      dirPath: node.is_dir ? node.path : node.path.substring(0, node.path.lastIndexOf("/")) || "",
      is_dir: node.is_dir,
      filePath: node.is_dir ? "" : node.path,
      fileName: node.name,
    };
  }

  let newFileName = $state("");
  let showNewFileModal = $state(false);
  let createFileError = $state("");

  function onOpenNewFileModal() {
    if (!activePlugin) return;
    contextMenu.pluginName = activePlugin.name;
    contextMenu.dirPath = ""; // Root of plugin
    showNewFileModal = true;
    createFileError = "";
  }

  onMount(() => {
    window.addEventListener("open-new-file-modal", onOpenNewFileModal);
  });

  onDestroy(() => {
    window.removeEventListener("open-new-file-modal", onOpenNewFileModal);
    if (anchorCopyTimer) clearTimeout(anchorCopyTimer);
  });
  async function handleCreateFile() {
    if (!newFileName.trim()) return;

    try {
      let finalPath = newFileName.trim();
      if (contextMenu.dirPath) {
        finalPath = `${contextMenu.dirPath}/${finalPath}`;
      }

      await workbench.createFile(contextMenu.pluginName, finalPath);
      showNewFileModal = false;
      newFileName = "";
      closeContextMenu();
    } catch (err: any) {
      createFileError = typeof err === "string" ? err : err.message || "Failed to create file";
    }
  }

  // Rename File
  let showRenameModal = $state(false);
  let renameFileName = $state("");
  let renameError = $state("");

  async function handleRenameFile() {
    if (!renameFileName.trim()) return;
    try {
      let finalPath = renameFileName.trim();
      if (contextMenu.dirPath) {
        finalPath = `${contextMenu.dirPath}/${finalPath}`;
      }
      await workbench.renameFile(contextMenu.pluginName, contextMenu.filePath, finalPath);
      showRenameModal = false;
      closeContextMenu();
    } catch (err: any) {
      renameError = typeof err === "string" ? err : err.message || "Failed to rename file";
    }
  }

  // Delete File
  let showDeleteModal = $state(false);
  let deleteError = $state("");

  async function handleDeleteFile() {
    try {
      await workbench.deleteFile(contextMenu.pluginName, contextMenu.filePath);
      showDeleteModal = false;
      closeContextMenu();
    } catch (err: any) {
      deleteError = typeof err === "string" ? err : err.message || "Failed to delete file";
    }
  }
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (contextMenu.show) {
        closeContextMenu();
        e.preventDefault();
        return;
      }
      workbench.selectedFileNode = null;
      (document.activeElement as HTMLElement)?.blur();
      return;
    }

    if (e.altKey && e.key === "ArrowLeft" && activePlugin) {
      e.preventDefault();
      onSelectPlugin(null as any);
      tick().then(() => {
        searchInput?.focus();
      });
      return;
    }

    if (!activePlugin) {
      if (filteredPlugins.length === 0) return;
      const currentIndex = selectedPluginNode
        ? filteredPlugins.findIndex((p) => p.name === selectedPluginNode)
        : -1;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex =
          currentIndex < filteredPlugins.length - 1 ? currentIndex + 1 : currentIndex;
        if (nextIndex === -1) {
          selectedPluginNode = filteredPlugins[0].name;
        } else {
          selectedPluginNode = filteredPlugins[nextIndex].name;
        }
        document
          .getElementById(`plugin-node-${selectedPluginNode}`)
          ?.scrollIntoView({ block: "nearest" });
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (currentIndex === -1) {
          selectedPluginNode = filteredPlugins[0].name;
        } else {
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : 0;
          selectedPluginNode = filteredPlugins[prevIndex].name;
        }
        document
          .getElementById(`plugin-node-${selectedPluginNode}`)
          ?.scrollIntoView({ block: "nearest" });
        return;
      }

      if (e.key === "Enter" || e.key === " ") {
        if (!selectedPluginNode) return;
        e.preventDefault();
        const plugin = filteredPlugins.find((p) => p.name === selectedPluginNode);
        if (plugin) {
          onSelectPlugin(plugin);
          tick().then(() => sidebarAside?.focus());
        }
        return;
      }
      return; // Do not execute file tree keybinds
    }

    if (e.key === "F2") {
      if (!workbench.selectedFileNode) return;
      e.preventDefault();
      // Only files for now as per current logic
      if (!workbench.selectedFileNode.is_dir) {
        contextMenu.pluginName = workbench.selectedFileNode.pluginName;
        contextMenu.filePath = workbench.selectedFileNode.path;
        contextMenu.dirPath =
          workbench.selectedFileNode.path.substring(
            0,
            workbench.selectedFileNode.path.lastIndexOf("/")
          ) || "";
        renameFileName = workbench.selectedFileNode.name;
        showRenameModal = true;
        renameError = "";
      }
      return;
    }

    if (e.key === "Delete") {
      if (!workbench.selectedFileNode) return;
      e.preventDefault();
      if (!workbench.selectedFileNode.is_dir) {
        contextMenu.pluginName = workbench.selectedFileNode.pluginName;
        contextMenu.filePath = workbench.selectedFileNode.path;
        showDeleteModal = true;
        deleteError = "";
      }
      return;
    }

    const nodes = Array.from(document.querySelectorAll(".tree-node-btn")) as HTMLElement[];
    if (nodes.length === 0) return;

    const currentIndex = nodes.findIndex(
      (n) =>
        n.dataset.path === workbench.selectedFileNode?.path &&
        n.dataset.plugin === workbench.selectedFileNode?.pluginName
    );
    if (currentIndex === -1) {
      // if we have nodes but no selection, select first on arrow down or up
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        workbench.selectedFileNode = {
          pluginName: nodes[0].dataset.plugin!,
          path: nodes[0].dataset.path!,
          is_dir: nodes[0].dataset.isdir === "true",
          name: nodes[0].dataset.name!,
        };
        nodes[0].scrollIntoView({ block: "nearest" });
      }
      return;
    }

    const currentEl = nodes[currentIndex];

    if (e.key === "ArrowRight") {
      e.preventDefault();
      if (currentEl.dataset.isdir === "true" && currentEl.dataset.open === "false") {
        currentEl.click();
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (currentEl.dataset.isdir === "true" && currentEl.dataset.open === "true") {
        currentEl.click();
      } else {
        const level = parseInt(currentEl.dataset.level || "0");
        if (level > 0) {
          for (let i = currentIndex - 1; i >= 0; i--) {
            if (parseInt(nodes[i].dataset.level || "0") === level - 1) {
              workbench.selectedFileNode = {
                pluginName: nodes[i].dataset.plugin!,
                path: nodes[i].dataset.path!,
                is_dir: nodes[i].dataset.isdir === "true",
                name: nodes[i].dataset.name!,
              };
              nodes[i].scrollIntoView({ block: "nearest" });
              break;
            }
          }
        }
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const nextIndex = currentIndex < nodes.length - 1 ? currentIndex + 1 : currentIndex;
      if (nextIndex !== currentIndex) {
        workbench.selectedFileNode = {
          pluginName: nodes[nextIndex].dataset.plugin!,
          path: nodes[nextIndex].dataset.path!,
          is_dir: nodes[nextIndex].dataset.isdir === "true",
          name: nodes[nextIndex].dataset.name!,
        };
        nodes[nextIndex].scrollIntoView({ block: "nearest" });
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : 0;
      if (prevIndex !== currentIndex) {
        workbench.selectedFileNode = {
          pluginName: nodes[prevIndex].dataset.plugin!,
          path: nodes[prevIndex].dataset.path!,
          is_dir: nodes[prevIndex].dataset.isdir === "true",
          name: nodes[prevIndex].dataset.name!,
        };
        nodes[prevIndex].scrollIntoView({ block: "nearest" });
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (currentEl.dataset.isdir === "true") {
        currentEl.click();
      } else {
        workbench.openTab(currentEl.dataset.plugin!, currentEl.dataset.path!);
      }
    }
  }
</script>

<svelte:window
  onclick={(e) => {
    if (e.button !== 2) closeContextMenu();
  }}
  oncontextmenu={(e) => {
    if (contextMenu.show) closeContextMenu();
  }}
/>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<aside
  bind:this={sidebarAside}
  role="region"
  aria-label="Registry Sidebar"
  class="h-full flex flex-col theme-bg-sidebar theme-border-r theme-text-main font-mono text-sm select-none focus:outline-none focus:ring-1 focus:ring-inset focus:ring-[var(--color-accent)]"
  tabindex="0"
  onkeydown={handleKeyDown}
  onclick={(e) => {
    if (!["INPUT", "BUTTON"].includes((e.target as HTMLElement).tagName)) e.currentTarget.focus();
  }}
>
  <!-- Sidebar Header -->
  <div class="p-4 theme-bg-header theme-border-b flex items-center justify-between">
    <div class="flex items-center space-x-2">
      <div class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
      <span class="font-bold uppercase tracking-wider theme-text-main">Plugin Registry</span>
    </div>
    <button
      onclick={onDisconnect}
      class="p-1 theme-text-muted hover:theme-text-accent rounded transition-colors cursor-pointer"
      title="Disconnect Workspace"
    >
      <!-- Close / Disconnect Icon -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="w-4 h-4"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
      </svg>
    </button>
  </div>

  <!-- Active Workspace Display -->
  <div class="px-4 py-2 theme-bg-main theme-border-b flex flex-col space-y-1">
    <span class="text-xs theme-text-muted uppercase tracking-widest block font-bold">Workspace</span>
    <!-- Read-only path field: navigate with arrow keys and select/copy freely, but
         never mutate the value. Overflow scrolls to the end so the tail is visible. -->
    <div class="flex items-stretch gap-1">
      <input
        bind:this={anchorInput}
        type="text"
        title={projectPath}
        aria-label="Workspace anchor path"
        data-testid="workspace-anchor-input"
        spellcheck="false"
        autocomplete="off"
        class="workspace-anchor-input flex-1 min-w-0 px-2 py-1 text-xs font-mono theme-bg-sidebar theme-border rounded theme-text-main cursor-text focus:outline-none focus:theme-border-accent"
        onbeforeinput={blockAnchorMutation}
        onkeydown={handleAnchorKeydown}
        onpaste={(e) => e.preventDefault()}
        ondrop={(e) => e.preventDefault()}
      />
      <button
        type="button"
        class="flex-none px-2 py-1 theme-bg-sidebar hover:theme-bg-header theme-border rounded text-xs font-bold transition-colors cursor-pointer"
        title="Change workspace path"
        aria-label="Change workspace path"
        data-testid="workspace-anchor-change"
        onclick={() => workbench.pickAndConnectWorkspace()}
      >
        Change
      </button>
      <button
        type="button"
        class="flex-none px-2 py-1 theme-bg-sidebar hover:theme-bg-header theme-border rounded text-xs font-bold transition-colors cursor-pointer"
        title="Copy workspace path"
        aria-label="Copy workspace path"
        data-testid="workspace-anchor-copy"
        onclick={copyWorkspaceAnchor}
      >
        {anchorCopied ? "Copied!" : "Copy"}
      </button>
    </div>
  </div>

  <PendingApprovalsPanel {projectPath} onWorkspaceRefresh={onRefresh} />

  <!-- Registry Action Bar -->
  <div class="p-2 theme-border-b theme-bg-sidebar flex space-x-2">
    <button
      onclick={() => (workbench.showCreateModal = true)}
      class="flex-1 py-1.5 theme-bg-accent-soft hover:bg-opacity-80 theme-text-accent border theme-border-accent rounded font-bold uppercase text-xs tracking-wider transition-colors cursor-pointer text-center"
    >
      + New Plugin
    </button>
    <button
      onclick={onRefresh}
      class="px-2 py-1.5 theme-bg-main hover:theme-bg-header theme-text-muted hover:theme-text-main border theme-border rounded transition-colors cursor-pointer flex items-center justify-center"
      title="Rescan Directory"
    >
      <!-- Refresh Icon -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="w-3.5 h-3.5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
        />
      </svg>
    </button>
  </div>

  <!-- Plugin List or Drill-Down View -->
  <div class="flex-1 overflow-y-auto flex flex-col min-h-0">
    {#if activePlugin}
      <!-- Drill-Down Active View -->
      <div class="flex-1 flex flex-col min-h-0">
        <!-- Drill-down Header -->
        <div class="px-2 py-1.5 theme-bg-header theme-border-b flex items-center shadow-sm">
          <button
            onclick={() => onSelectPlugin(null as any)}
            class="flex items-center text-xs font-bold theme-text-muted hover:theme-text-accent transition-colors cursor-pointer mr-2"
            title="Back to Plugins"
          >
            <svg class="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back
          </button>
          <span class="font-bold tracking-tight theme-text-main truncate flex-1"
            >{activePlugin.name}</span
          >
        </div>

        <RegistryDependenciesPanel
          {projectPath}
          {activePlugin}
          allPlugins={plugins}
          {onRefresh}
        />

        <!-- Files Tree -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="flex-1 overflow-y-auto py-2"
          oncontextmenu={(e) =>
            handleContextMenu(
              e,
              { path: "", is_dir: true, name: activePlugin.name },
              activePlugin.name
            )}
        >
          {#each activePlugin.files as fileNode}
            <FileTreeNode
              node={fileNode}
              pluginName={activePlugin.name}
              onContextMenu={handleContextMenu}
            />
          {/each}
        </div>
      </div>
    {:else}
      <RegistryPluginList
        bind:searchQuery
        {filteredPlugins}
        bind:selectedPluginNode
        {sidebarAside}
        {onSelectPlugin}
      />
    {/if}
  </div>

  <RegistrySidebarModals
    bind:showCreateModal={workbench.showCreateModal}
    bind:newName
    bind:newDesc
    bind:createError
    {isCreating}
    {handleCreatePlugin}
    bind:showNewFileModal
    bind:newFileName
    bind:createFileError
    contextMenuDirPath={contextMenu.dirPath}
    {handleCreateFile}
    bind:showRenameModal
    bind:renameFileName
    bind:renameError
    {handleRenameFile}
    bind:showDeleteModal
    bind:deleteError
    {handleDeleteFile}
    contextMenuFilePath={contextMenu.filePath}
  />

  <RegistryContextMenu
    show={contextMenu.show}
    x={contextMenu.x}
    y={contextMenu.y}
    is_dir={contextMenu.is_dir}
    filePath={contextMenu.filePath}
    fileName={contextMenu.fileName}
    onNewFile={() => {
      showNewFileModal = true;
      createFileError = "";
    }}
    onRename={() => {
      renameFileName = contextMenu.fileName;
      showRenameModal = true;
      renameError = "";
    }}
    onDelete={() => {
      showDeleteModal = true;
      deleteError = "";
    }}
  />
</aside>

<style>
  /* Explicit caret color: readonly inputs hide it in some WebKit/Tauri builds. */
  .workspace-anchor-input {
    caret-color: var(--text-main);
  }
</style>
