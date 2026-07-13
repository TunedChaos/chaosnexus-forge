<!-- chaosnexus-forge/src/lib/components/MenuBar.svelte -->
<script lang="ts">
  /**
   * The MenuBar component provides the main top-level navigation and actions for the ChaosNexus Forge IDE.
   * It handles file operations, view settings, theming shortcuts, and keyboard navigation.
   */
  import { workbench, EDITOR_FONT_SIZE_DEFAULT } from "$lib/state.svelte";
  import { engine } from "$lib/engine.svelte";
  import { onMount } from "svelte";

  import { listen } from "@tauri-apps/api/event";
  import MenuBarMenus from "$lib/components/menu/MenuBarMenus.svelte";

  // Menu bar state
  let activeMenu = $state<string | null>(null);
  let altMode = $state(false);
  let focusedMenu = $state<string | null>(null);
  let keyboardNavigation = $state(false);
  let showPluginWarningModal = $state(false);

  const isMac =
    typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase().includes("mac") : false;

  // File menu actions
  async function handleOpenPluginsFolder() {
    await workbench.pickAndConnectWorkspace();
  }

  async function handleClosePluginsFolder() {
    if (!workbench.projectPath) return;
    if (engine.status === "running" || engine.status === "starting") {
      await engine.stop();
    }
    workbench.disconnectWorkspace();
  }

  async function handleRefresh() {
    await workbench.refreshWorkspace();
  }

  function handleNewPlugin() {
    if (workbench.projectPath) {
      workbench.showCreateModal = true;
    } else {
      alert("Please connect to a workspace first before scaffolding new plugins.");
    }
  }

  function handleBrowsePlugins() {
    window.dispatchEvent(new CustomEvent("open-plugin-browser-modal"));
  }

  async function handleNewFile() {
    if (!workbench.projectPath) {
      alert("Please connect to a workspace first.");
      return;
    }
    if (!workbench.activePlugin) {
      showPluginWarningModal = true;
      return;
    }
    window.dispatchEvent(new CustomEvent("open-new-file-modal"));
  }

  async function handleExit() {
    const canClose = await workbench.attemptGracefulExit();
    if (canClose) {
      await workbench.performActualClose();
    }
  }

  // Theme actions
  function handleSelectTheme(theme: string) {
    workbench.setTheme(theme);
  }

  // View font-scaling actions
  function handleZoomIn() {
    workbench.setFontSize(workbench.fontSize + 1);
  }

  function handleZoomOut() {
    workbench.setFontSize(workbench.fontSize - 1);
  }

  function handleZoomReset() {
    workbench.setFontSize(EDITOR_FONT_SIZE_DEFAULT);
  }

  function handleFontFamilyPrompt() {
    const newFont = prompt(
      "Enter Font Family (e.g. 'Fira Code', 'Consolas', 'JetBrains Mono', 'System Default'):",
      workbench.fontFamily
    );
    if (newFont) {
      workbench.setFontFamily(newFont);
    }
  }

  // Help actions
  function handleAbout() {
    // We will trigger a modal instead of alert
    window.dispatchEvent(new CustomEvent("open-about-modal"));
  }

  function handleSettings() {
    window.dispatchEvent(new CustomEvent("open-settings-modal"));
  }

  // Deep links the status-bar THEME shortcut straight to the Appearance tab.
  function handleOpenAppearanceSettings() {
    window.dispatchEvent(
      new CustomEvent("open-settings-modal", { detail: { tab: "appearance" } })
    );
  }

  // Focus Mode
  let isFullscreen = $state(false);
  async function handleFocusMode() {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      isFullscreen = !isFullscreen;
      await win.setFullscreen(isFullscreen);
    } catch (e) {
      console.error("Failed to toggle fullscreen", e);
    }
  }

  let unlistenClose: (() => void) | undefined;

  // Global keybindings (Ctrl + / Ctrl - for accessibility scaling)
  onMount(() => {
    let unlisten: (() => void) | undefined;

    listen<string>("menu-event", (event) => {
      const id = event.payload;
      switch (id) {
        case "file_open_folder":
          handleOpenPluginsFolder();
          break;
        case "file_close_folder":
          handleClosePluginsFolder();
          break;
        case "file_refresh":
          handleRefresh();
          break;
        case "file_new_plugin":
          handleNewPlugin();
          break;
        case "file_browse_plugins":
          handleBrowsePlugins();
          break;
        // exit is handled by PredefinedMenuItem::quit natively

        case "view_zoom_in":
          handleZoomIn();
          break;
        case "view_zoom_out":
          handleZoomOut();
          break;
        case "view_zoom_reset":
          handleZoomReset();
          break;
        case "view_font_family":
          handleFontFamilyPrompt();
          break;

        case "help_about":
          handleAbout();
          break;
      }

      if (id.startsWith("theme_")) {
        const theme = id.replace("theme_", "");
        handleSelectTheme(theme);
      }
    }).then((u) => {
      unlisten = u;
    });

    let altKeyFired = false;
    const topLevelMenus = ["file", "edit", "view", "help"];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Alt") {
        altKeyFired = false;
        return;
      }
      if (e.altKey) {
        altKeyFired = true;
      }

      if (e.key === "F11") {
        e.preventDefault();
        handleFocusMode();
        return;
      }

      // Alt Menu Shortcuts (e.g., Alt+F) or typing letter in altMode
      if (
        (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) ||
        (altMode && !activeMenu && !e.ctrlKey && !e.metaKey && !e.shiftKey)
      ) {
        const key = e.key.toLowerCase();
        let matchedMenu = null;
        if (key === "f") matchedMenu = "file";
        else if (key === "e") matchedMenu = "edit";
        else if (key === "v") matchedMenu = "view";
        else if (key === "h") matchedMenu = "help";

        if (matchedMenu) {
          e.preventDefault();
          e.stopPropagation();
          altMode = false;
          activeMenu = activeMenu === matchedMenu ? null : matchedMenu;
          focusedMenu = activeMenu;
          keyboardNavigation = !!activeMenu;
          if (activeMenu) {
            (document.activeElement as HTMLElement)?.blur();
          }
          return;
        }
      }

      // Alt Mode Navigation (Top level without opening)
      if (altMode && !activeMenu) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          e.stopPropagation();
          const idx = topLevelMenus.indexOf(focusedMenu || "file");
          focusedMenu = topLevelMenus[idx < topLevelMenus.length - 1 ? idx + 1 : 0];
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          e.stopPropagation();
          const idx = topLevelMenus.indexOf(focusedMenu || "file");
          focusedMenu = topLevelMenus[idx > 0 ? idx - 1 : topLevelMenus.length - 1];
        } else if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
          e.preventDefault();
          e.stopPropagation();
          activeMenu = focusedMenu || "file";
          altMode = false;
          keyboardNavigation = true;
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          altMode = false;
          focusedMenu = null;
        }
        return; // Capture all keydowns in altMode to prevent them from hitting the editor
      }

      // Menu Dropdown Arrow Navigation
      if (activeMenu) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          activeMenu = null;
          altMode = true; // Back out to altMode
          keyboardNavigation = true;
          return;
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          const items = Array.from(document.querySelectorAll(".theme-menu-btn")) as HTMLElement[];
          if (items.length > 0) {
            const idx = items.findIndex((el) => el === document.activeElement);
            if (e.key === "ArrowDown") {
              const next = idx < items.length - 1 ? idx + 1 : 0;
              items[next]?.focus();
            } else {
              const prev = idx > 0 ? idx - 1 : items.length - 1;
              items[prev]?.focus();
            }
          }
          return;
        }
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          e.stopPropagation();
          const idx = topLevelMenus.indexOf(activeMenu);
          if (e.key === "ArrowRight") {
            activeMenu = topLevelMenus[idx < topLevelMenus.length - 1 ? idx + 1 : 0];
            focusedMenu = activeMenu;
          } else if (e.key === "ArrowLeft") {
            activeMenu = topLevelMenus[idx > 0 ? idx - 1 : topLevelMenus.length - 1];
            focusedMenu = activeMenu;
          }
          return;
        }

        // Keyboard shortcuts for active menu
        const key = e.key.toLowerCase();
        if (activeMenu === "file") {
          if (key === "o") {
            e.preventDefault();
            handleOpenPluginsFolder();
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
          if (key === "c") {
            e.preventDefault();
            handleClosePluginsFolder();
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
          if (key === "r") {
            e.preventDefault();
            handleRefresh();
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
          if (key === "n") {
            e.preventDefault();
            handleNewFile();
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
          if (key === "p") {
            e.preventDefault();
            handleNewPlugin();
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
          if (key === "b") {
            e.preventDefault();
            handleBrowsePlugins();
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
          if (key === "x") {
            e.preventDefault();
            handleExit();
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
        } else if (activeMenu === "edit") {
          if (key === "u") {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("editor-action", { detail: "undo" }));
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
          if (key === "r") {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("editor-action", { detail: "redo" }));
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
          if (key === "t") {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("editor-action", { detail: "cut" }));
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
          if (key === "c") {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("editor-action", { detail: "copy" }));
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
          if (key === "p") {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("editor-action", { detail: "paste" }));
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
          if (key === "f") {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("editor-action", { detail: "find" }));
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
          if (key === "h") {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("editor-action", { detail: "replace" }));
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
        } else if (activeMenu === "view") {
          if (key === "i") {
            e.preventDefault();
            handleZoomIn();
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
          if (key === "o") {
            e.preventDefault();
            handleZoomOut();
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
          if (key === "r") {
            e.preventDefault();
            handleZoomReset();
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
          if (key === "f") {
            e.preventDefault();
            handleFocusMode();
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
          if (key === "a") {
            e.preventDefault();
            handleFontFamilyPrompt();
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
        } else if (activeMenu === "help") {
          if (key === "a") {
            e.preventDefault();
            handleAbout();
            activeMenu = null;
            altMode = false;
            keyboardNavigation = false;
            return;
          }
        }
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          handleZoomIn();
        } else if (e.key === "-") {
          e.preventDefault();
          handleZoomOut();
        } else if (e.key === "0") {
          e.preventDefault();
          handleZoomReset();
        } else if (e.key.toLowerCase() === "w") {
          e.preventDefault();
          if (workbench.activeTab) {
            workbench.attemptCloseTab(workbench.activeTab.pluginName, workbench.activeTab.filename);
          }
        } else if (e.key.toLowerCase() === "n") {
          e.preventDefault();
          handleNewFile();
        } else if (e.key.toLowerCase() === "q") {
          e.preventDefault();
          handleExit();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Alt" && !altKeyFired) {
        e.preventDefault();
        if (!activeMenu) {
          altMode = !altMode;
          if (altMode) {
            focusedMenu = "file";
            keyboardNavigation = true;
            (document.activeElement as HTMLElement)?.blur();
          } else {
            focusedMenu = null;
            keyboardNavigation = false;
          }
        }
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (activeMenu || altMode) {
        const nav = document.querySelector("nav");
        if (nav && !nav.contains(e.target as Node)) {
          activeMenu = null;
          altMode = false;
          focusedMenu = null;
          keyboardNavigation = false;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("mousedown", handleMouseDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("mousedown", handleMouseDown, true);
      if (unlisten) unlisten();
      unlistenClose?.();
    };
  });
</script>

<nav
  class="h-9 w-full theme-bg-header theme-border-b flex items-center px-4 font-mono text-sm select-none z-50 relative"
>
  <!-- Logo/Brand Icon -->
  <div class="flex items-center space-x-2 mr-6">
    <img src="/favicon.svg" alt="ChaosNexus Forge Logo" class="w-4 h-4 object-contain" />
    <span class="font-extrabold tracking-widest theme-text-main text-xs">ChaosNexus Forge</span>
  </div>

  <MenuBarMenus
    bind:activeMenu
    bind:altMode
    bind:focusedMenu
    bind:keyboardNavigation
    bind:showPluginWarningModal
    {isMac}
    {handleOpenPluginsFolder}
    {handleClosePluginsFolder}
    {handleRefresh}
    {handleNewFile}
    {handleNewPlugin}
    {handleBrowsePlugins}
    {handleExit}
    {handleZoomIn}
    {handleZoomOut}
    {handleZoomReset}
    {handleFocusMode}
    {handleFontFamilyPrompt}
    {handleAbout}
    {handleSettings}
  />

  <!-- Spacer to align dynamic stats on the right -->
  <div class="flex-1"></div>

  <!-- Menu status bar metadata -->
  <div class="flex items-center space-x-4 h-full text-xs theme-text-muted">
    <!-- THEME is a shortcut into Settings > Appearance (the only place themes are
         changed now that the menu-bar Themes dropdown has been removed). -->
    <button
      type="button"
      class="hidden sm:flex items-center space-x-1.5 cursor-pointer hover:theme-text-main transition-colors"
      title="Change theme in settings."
      data-testid="menubar-theme-shortcut"
      onclick={handleOpenAppearanceSettings}
    >
      <span class="font-bold">THEME:</span>
      <span class="theme-text-accent uppercase font-bold underline decoration-dotted underline-offset-2"
        >{workbench.theme}</span
      >
    </button>
  </div>
</nav>
