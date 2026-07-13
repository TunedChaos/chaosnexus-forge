<!-- chaosnexus-forge/src/routes/+layout.svelte -->
<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { workbench, resolveUiFontSize, resolveThemeDataAttribute } from "$lib/state.svelte";
  import { engine } from "$lib/engine.svelte";
  import { pendingPlugins } from "$lib/pending.svelte";
  import { appSettings } from "$lib/settings.svelte";
  import MenuBar from "$lib/components/MenuBar.svelte";
  import RegistrySidebar from "$lib/components/RegistrySidebar.svelte";
  import AboutModal from "$lib/components/AboutModal.svelte";
  import SettingsModal from "$lib/components/SettingsModal.svelte";
  import ChaoswrenchSetupModal from "$lib/components/ChaoswrenchSetupModal.svelte";
  import PluginBrowserModal from "$lib/components/PluginBrowserModal.svelte";
  import InstanceNotificationBar from "$lib/components/InstanceNotificationBar.svelte";
  import Splitter from "$lib/components/Splitter.svelte";
  import EngineConsole from "$lib/components/EngineConsole.svelte";
  import CvarPanel from "$lib/components/CvarPanel.svelte";
  import McpRegistryPanel from "$lib/components/McpRegistryPanel.svelte";
  import { mcp } from "$lib/mcp.svelte";
  import { scheduleMonacoWarmup } from "$lib/dual_editor/monaco_loader";

  /**
   * Component props for the root layout.
   * @property {import("svelte").Snippet} children - The nested routes/components to render.
   */
  let { children } = $props();

  let sidebarWidth = $state(250);
  let terminalHeight = $state(160);
  let cvarPanelWidth = $state(320);
  let cvarPanelOpen = $state(false);
  // Left sidebar view: the plugin/file registry or the MCP Mesh connection list.
  let leftTab = $state<"plugins" | "mesh">("plugins");

  // Reactive effect for themes
  $effect(() => {
    if (typeof document !== "undefined") {
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const slug = resolveThemeDataAttribute(workbench.theme, systemDark);
      document.documentElement.setAttribute("data-theme", slug);
      // Align native form controls (scrollbars, file pickers) with the theme so
      // they no longer render in the OS light palette on dark themes.
      document.documentElement.style.colorScheme = slug.includes("light") ? "light" : "dark";
    }
  });

  // Reactive effect for UI typography synchronization
  $effect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty(
        "--ui-font-size",
        `${resolveUiFontSize(workbench.fontSize)}px`
      );
      // Visual-scripting nodes size their text from the raw editor font so they
      // read at the same scale as the Monaco buffer.
      document.documentElement.style.setProperty("--editor-font-size", `${workbench.fontSize}px`);
      document.documentElement.style.setProperty("--ui-font-family", workbench.fontFamily);
    }
  });

  // Reactive effect for pending plugins watcher
  $effect(() => {
    if (workbench.projectPath) {
      void pendingPlugins.startWatcher(workbench.projectPath);
    }
  });

  onMount(() => {
    void engine.init();
    void appSettings.load();
    scheduleMonacoWarmup();

    engine.setOnReloadComplete(() => {
      void workbench.refreshWorkspace();
      if (workbench.projectPath) {
        void pendingPlugins.refresh(workbench.projectPath);
      }
    });

    // Expose engine + settings on the shared E2E hook for Playwright drivers.
    if (typeof window !== "undefined") {
      const hook = ((window as unknown as { _chaosforge_state?: Record<string, unknown> })
        ._chaosforge_state ??= {});
      hook.engine = engine;
      hook.appSettings = appSettings;
      hook.pendingPlugins = pendingPlugins;
      hook.mcp = mcp;
      hook.seedMockPending = async (name: string) => {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("seed_mock_pending_plugin", { name });
        await pendingPlugins.refresh(workbench.projectPath || "/mock/workspace");
      };
    }

    // Listen to system preference changes for theme
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      if (workbench.theme === "System") {
        const slug = mediaQuery.matches ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", slug);
        document.documentElement.style.colorScheme = slug;
      }
    };
    mediaQuery.addEventListener("change", handleSystemThemeChange);

    // Close Tauri Splash Screen if we are running under Tauri
    if (window.__TAURI_INTERNALS__) {
      import("@tauri-apps/api/core")
        .then((mod) => {
          mod.invoke("close_splashscreen").catch(console.error);
        })
        .catch(console.error);
    }

    return () => {
      engine.setOnReloadComplete(null);
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  });
</script>

<div
  class="h-screen w-full theme-bg-main theme-text-main overflow-hidden font-mono select-none flex flex-col"
>
  <!-- Top Menu Bar -->
  <div class="flex-none">
    <MenuBar />
    <InstanceNotificationBar />
  </div>

  <div class="flex-1 flex overflow-hidden min-h-0 relative">
    <!-- Left Sidebar (Plugin Registry / MCP Mesh) -->
    <div style="width: {sidebarWidth}px;" class="flex-none h-full overflow-hidden flex flex-col">
      <!-- Sidebar view tabs -->
      <div class="flex-none flex theme-bg-header theme-border-b text-xs font-bold uppercase tracking-wider">
        <button
          class="flex-1 py-1.5 transition-colors cursor-pointer {leftTab === 'plugins'
            ? 'theme-text-accent theme-bg-sidebar border-b-2 theme-border-accent'
            : 'theme-text-muted hover:theme-text-main border-b-2 border-transparent'}"
          aria-pressed={leftTab === "plugins"}
          onclick={() => (leftTab = "plugins")}
        >
          Plugins
        </button>
        <button
          class="flex-1 py-1.5 transition-colors cursor-pointer {leftTab === 'mesh'
            ? 'theme-text-accent theme-bg-sidebar border-b-2 theme-border-accent'
            : 'theme-text-muted hover:theme-text-main border-b-2 border-transparent'}"
          aria-pressed={leftTab === "mesh"}
          onclick={() => (leftTab = "mesh")}
        >
          Mesh
        </button>
      </div>

      <div class="flex-1 min-h-0 overflow-hidden flex flex-col">
        {#if leftTab === "mesh"}
          <McpRegistryPanel />
        {:else if workbench.projectPath}
          <RegistrySidebar
            projectPath={workbench.projectPath}
            plugins={workbench.plugins}
            activePlugin={workbench.activePlugin}
            onSelectPlugin={(plugin) => workbench.selectPlugin(plugin)}
            onDisconnect={() => workbench.disconnectWorkspace()}
            onRefresh={() => workbench.refreshWorkspace()}
          />
        {:else}
          <aside
            class="h-full theme-bg-sidebar p-4 flex flex-col justify-center items-center text-center theme-text-muted text-sm border-r border-transparent space-y-3"
          >
            <p class="italic">No plugins folder open.</p>
            <p class="text-xs leading-relaxed">
              Use <span class="theme-text-main font-bold">File → Open Plugins Folder</span>
              <span class="font-mono">(O)</span> to choose your ChaosNexus Anvil scripts/plugins directory.
            </p>
          </aside>
        {/if}
      </div>
    </div>

    <!-- Sidebar Splitter -->
    <Splitter min={200} max={600} bind:value={sidebarWidth} />

    <div class="flex-1 flex flex-col min-w-0 min-h-0">
      <!-- Main Stage (Dual-View Editor Workbench) -->
      <main class="flex-1 relative theme-bg-main overflow-hidden min-h-0">
        {@render children()}
      </main>

      <!-- Terminal Splitter -->
      <Splitter vertical={true} min={100} max={600} bind:value={terminalHeight} reverse={true} />

      <!-- Bottom Drawer (Live ChaosNexus Anvil Engine Console) -->
      <footer style="height: {terminalHeight}px;" class="flex-none min-h-0">
        <EngineConsole
          cvarsOpen={cvarPanelOpen}
          onToggleCvars={() => (cvarPanelOpen = !cvarPanelOpen)}
        />
      </footer>
    </div>

    <!-- Right Panel (CVar Controller) -->
    {#if cvarPanelOpen}
      <Splitter min={240} max={640} bind:value={cvarPanelWidth} reverse={true} />
      <div
        style="width: {cvarPanelWidth}px;"
        class="flex-none h-full overflow-hidden flex flex-col min-h-0"
      >
        <CvarPanel onClose={() => (cvarPanelOpen = false)} />
      </div>
    {/if}
  </div>
</div>
<AboutModal />
<SettingsModal />
<ChaoswrenchSetupModal />
<PluginBrowserModal />
