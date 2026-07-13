<!-- chaosnexus-forge/src/lib/components/menu/MenuBarMenus.svelte -->
<script lang="ts">
  import { workbench } from "$lib/state.svelte";
  import MenuDropdownButton from "./MenuDropdownButton.svelte";

  /**
   * Properties for the MenuBarMenus component.
   */
  let {
    activeMenu = $bindable<string | null>(null),
    altMode = $bindable(false),
    focusedMenu = $bindable<string | null>(null),
    keyboardNavigation = $bindable(false),
    showPluginWarningModal = $bindable(false),
    isMac,
    handleOpenPluginsFolder,
    handleClosePluginsFolder,
    handleRefresh,
    handleNewFile,
    handleNewPlugin,
    handleBrowsePlugins,
    handleExit,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    handleFocusMode,
    handleFontFamilyPrompt,
    handleAbout,
    handleSettings,
  }: {
    activeMenu: string | null;
    altMode: boolean;
    focusedMenu: string | null;
    keyboardNavigation: boolean;
    showPluginWarningModal: boolean;
    isMac: boolean;
    handleOpenPluginsFolder: () => void | Promise<void>;
    handleClosePluginsFolder: () => void | Promise<void>;
    handleRefresh: () => void | Promise<void>;
    handleNewFile: () => void | Promise<void>;
    handleNewPlugin: () => void;
    handleBrowsePlugins: () => void;
    handleExit: () => void | Promise<void>;
    handleZoomIn: () => void;
    handleZoomOut: () => void;
    handleZoomReset: () => void;
    handleFocusMode: () => void | Promise<void>;
    handleFontFamilyPrompt: () => void;
    handleAbout: () => void;
    handleSettings: () => void;
  } = $props();
</script>

{#snippet menuTrigger(id: string, letter: string, rest: string)}
  <button
    class="px-3 h-full theme-text-main hover:theme-bg-accent hover:text-white flex items-center {activeMenu ===
      id ||
    (altMode && focusedMenu === id)
      ? 'theme-bg-accent text-white'
      : ''}"
    onmouseenter={() => {
      if (activeMenu || altMode) {
        activeMenu = id;
        focusedMenu = id;
        altMode = false;
      }
    }}
    onclick={() => (activeMenu = activeMenu === id ? null : id)}
  >
    <span class:underline={altMode || activeMenu !== null}>{letter}</span>{rest}
  </button>
{/snippet}

<!-- Menu Dropdown Container -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flex items-center space-x-1 h-full relative" onmouseleave={() => (activeMenu = null)}>
  <!-- FILE MENU -->
  <div class="relative h-full">
    {@render menuTrigger("file", "F", "ile")}
    {#if activeMenu === "file"}
      <div
        class="absolute top-full left-0 mt-0 py-1 w-48 theme-bg-main theme-border shadow-lg flex flex-col z-50"
      >
        <MenuDropdownButton
          onclick={() => {
            handleOpenPluginsFolder();
            activeMenu = null;
          }}
        >
          <span class:underline={keyboardNavigation}>O</span>pen Plugins Folder...
        </MenuDropdownButton>
        <MenuDropdownButton
          disabled={!workbench.projectPath}
          onclick={() => {
            handleClosePluginsFolder();
            activeMenu = null;
          }}
        >
          <span class:underline={keyboardNavigation}>C</span>lose Plugins Folder
        </MenuDropdownButton>
        <MenuDropdownButton
          onclick={() => {
            handleRefresh();
            activeMenu = null;
          }}
        >
          <span class:underline={keyboardNavigation}>R</span>efresh Workspace
        </MenuDropdownButton>
        <div class="my-1 border-t border-zinc-800"></div>
        <MenuDropdownButton
          onclick={() => {
            handleNewFile();
            activeMenu = null;
          }}
        >
          <span><span class:underline={keyboardNavigation}>N</span>ew File...</span><span
            class="theme-text-muted text-[10px]">{isMac ? "Cmd+N" : "Ctrl+N"}</span
          >
        </MenuDropdownButton>
        <MenuDropdownButton
          onclick={() => {
            handleNewPlugin();
            activeMenu = null;
          }}
        >
          New <span class:underline={keyboardNavigation}>P</span>lugin...
        </MenuDropdownButton>
        <MenuDropdownButton
          onclick={() => {
            handleBrowsePlugins();
            activeMenu = null;
          }}
        >
          <span class:underline={keyboardNavigation}>B</span>rowse Plugins...
        </MenuDropdownButton>
        <div class="my-1 border-t border-zinc-800"></div>
        <MenuDropdownButton
          onclick={() => {
            handleSettings();
            activeMenu = null;
          }}
        >
          <span class:underline={keyboardNavigation}>S</span>ettings...
        </MenuDropdownButton>
        <div class="my-1 border-t border-zinc-800"></div>
        <MenuDropdownButton
          onclick={() => {
            handleExit();
            activeMenu = null;
          }}
        >
          {#if isMac}
            <span>Quit</span>
          {:else}
            <span>E<span class:underline={keyboardNavigation}>x</span>it</span>
          {/if}
          <span class="theme-text-muted text-[10px]">{isMac ? "Cmd+Q" : "Ctrl+Q"}</span>
        </MenuDropdownButton>
      </div>
    {/if}
  </div>

  <!-- EDIT MENU -->
  <div class="relative h-full">
    {@render menuTrigger("edit", "E", "dit")}
    {#if activeMenu === "edit"}
      <div
        class="absolute top-full left-0 mt-0 py-1 w-48 theme-bg-main theme-border shadow-lg flex flex-col z-50"
      >
        <MenuDropdownButton
          onclick={() => {
            window.dispatchEvent(new CustomEvent("editor-action", { detail: "undo" }));
            activeMenu = null;
          }}
        >
          <span><span class:underline={keyboardNavigation}>U</span>ndo</span><span
            class="theme-text-muted text-[10px]">{isMac ? "Cmd+Z" : "Ctrl+Z"}</span
          >
        </MenuDropdownButton>
        <MenuDropdownButton
          onclick={() => {
            window.dispatchEvent(new CustomEvent("editor-action", { detail: "redo" }));
            activeMenu = null;
          }}
        >
          <span><span class:underline={keyboardNavigation}>R</span>edo</span><span
            class="theme-text-muted text-[10px]">{isMac ? "Cmd+Y" : "Ctrl+Y"}</span
          >
        </MenuDropdownButton>
        <div class="my-1 border-t border-zinc-800"></div>
        <MenuDropdownButton
          onclick={() => {
            window.dispatchEvent(new CustomEvent("editor-action", { detail: "cut" }));
            activeMenu = null;
          }}
        >
          <span>Cu<span class:underline={keyboardNavigation}>t</span></span><span
            class="theme-text-muted text-[10px]">{isMac ? "Cmd+X" : "Ctrl+X"}</span
          >
        </MenuDropdownButton>
        <MenuDropdownButton
          onclick={() => {
            window.dispatchEvent(new CustomEvent("editor-action", { detail: "copy" }));
            activeMenu = null;
          }}
        >
          <span><span class:underline={keyboardNavigation}>C</span>opy</span><span
            class="theme-text-muted text-[10px]">{isMac ? "Cmd+C" : "Ctrl+C"}</span
          >
        </MenuDropdownButton>
        <MenuDropdownButton
          onclick={() => {
            window.dispatchEvent(new CustomEvent("editor-action", { detail: "paste" }));
            activeMenu = null;
          }}
        >
          <span><span class:underline={keyboardNavigation}>P</span>aste</span><span
            class="theme-text-muted text-[10px]">{isMac ? "Cmd+V" : "Ctrl+V"}</span
          >
        </MenuDropdownButton>
        <div class="my-1 border-t border-zinc-800"></div>
        <MenuDropdownButton
          onclick={() => {
            window.dispatchEvent(new CustomEvent("editor-action", { detail: "find" }));
            activeMenu = null;
          }}
        >
          <span><span class:underline={keyboardNavigation}>F</span>ind</span><span
            class="theme-text-muted text-[10px]">{isMac ? "Cmd+F" : "Ctrl+F"}</span
          >
        </MenuDropdownButton>
        <MenuDropdownButton
          onclick={() => {
            window.dispatchEvent(new CustomEvent("editor-action", { detail: "replace" }));
            activeMenu = null;
          }}
        >
          <span>Replace (<span class:underline={keyboardNavigation}>H</span>)</span><span
            class="theme-text-muted text-[10px]">{isMac ? "Cmd+H" : "Ctrl+H"}</span
          >
        </MenuDropdownButton>
      </div>
    {/if}
  </div>

  <!-- VIEW MENU -->
  <div class="relative h-full">
    {@render menuTrigger("view", "V", "iew")}
    {#if activeMenu === "view"}
      <div
        class="absolute top-full left-0 mt-0 py-1 w-48 theme-bg-main theme-border shadow-lg flex flex-col z-50"
      >
        <MenuDropdownButton
          onclick={() => {
            handleZoomIn();
            activeMenu = null;
          }}
          shortcut={isMac ? "Cmd+=" : "Ctrl+="}
        >
          Zoom <span class:underline={keyboardNavigation}>I</span>n
        </MenuDropdownButton>
        <MenuDropdownButton
          onclick={() => {
            handleZoomOut();
            activeMenu = null;
          }}
          shortcut={isMac ? "Cmd+-" : "Ctrl+-"}
        >
          Zoom <span class:underline={keyboardNavigation}>O</span>ut
        </MenuDropdownButton>
        <MenuDropdownButton
          onclick={() => {
            handleZoomReset();
            activeMenu = null;
          }}
          shortcut={isMac ? "Cmd+0" : "Ctrl+0"}
        >
          Zoom <span class:underline={keyboardNavigation}>R</span>eset
        </MenuDropdownButton>
        <div class="my-1 border-t border-zinc-800"></div>
        <MenuDropdownButton
          onclick={() => {
            handleFocusMode();
            activeMenu = null;
          }}
          shortcut="F11"
        >
          <span class:underline={keyboardNavigation}>F</span>ocus Mode
        </MenuDropdownButton>
        <div class="my-1 border-t border-zinc-800"></div>
        <MenuDropdownButton
          onclick={() => {
            handleFontFamilyPrompt();
            activeMenu = null;
          }}
        >
          Font f<span class:underline={keyboardNavigation}>a</span>mily...
        </MenuDropdownButton>
      </div>
    {/if}
  </div>

  <!-- HELP MENU -->
  <div class="relative h-full">
    {@render menuTrigger("help", "H", "elp")}
    {#if activeMenu === "help"}
      <div
        class="absolute top-full left-0 mt-0 py-1 w-32 theme-bg-main theme-border shadow-lg flex flex-col z-50"
      >
        <MenuDropdownButton
          onclick={() => {
            handleAbout();
            activeMenu = null;
          }}
        >
          <span class:underline={keyboardNavigation}>A</span>bout
        </MenuDropdownButton>
      </div>
    {/if}
  </div>
</div>

{#if showPluginWarningModal}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-75 backdrop-blur-xs p-4"
  >
    <div
      class="w-full max-w-sm theme-bg-main theme-border rounded overflow-hidden shadow-2xl p-5 space-y-4"
    >
      <h3
        class="text-sm font-bold uppercase tracking-wider theme-text-accent theme-border-b pb-2 flex items-center space-x-1.5"
      >
        <span class="w-1.5 h-1.5 bg-yellow-500 rounded-full"></span>
        <span>No Plugin Selected</span>
      </h3>
      <p class="text-sm theme-text-main">
        You must create or select a plugin to perform this action.
      </p>
      <div class="flex justify-end pt-2">
        <button
          class="px-4 py-1.5 theme-bg-sidebar hover:theme-bg-header theme-border rounded text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
          onclick={() => (showPluginWarningModal = false)}
        >
          OK
        </button>
      </div>
    </div>
  </div>
{/if}
