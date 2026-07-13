<!-- chaosnexus-forge/src/lib/components/SettingsModal.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import ModalShell from "./ModalShell.svelte";
  import ThemedSelect from "./ThemedSelect.svelte";
  import {
    workbench,
    THEME_OPTIONS,
    FONT_FAMILY_OPTIONS,
    EDITOR_FONT_SIZE_DEFAULT,
    resolveUiFontSize,
  } from "$lib/state.svelte";
  import { appSettings } from "$lib/settings.svelte";

  // Themed dropdown option lists (label/value pairs). Font rows carry a
  // previewFont so each renders in its own typeface.
  const themeSelectOptions = THEME_OPTIONS.map((t) => ({ value: t, label: t }));
  const fontSelectOptions = FONT_FAMILY_OPTIONS.map((f) => ({
    value: f.value,
    label: f.label,
    previewFont: f.value,
  }));

  let isOpen = $state(false);
  let activeTab = $state<"engine" | "appearance">("engine");

  onMount(() => {
    // Optional `detail.tab` lets callers (e.g. the menu-bar THEME shortcut) deep
    // link straight to a specific tab; absent or unknown values open Engine.
    const onOpen = (e: Event) => {
      const requested = (e as CustomEvent<{ tab?: string }>).detail?.tab;
      isOpen = true;
      activeTab = requested === "appearance" ? "appearance" : "engine";
      void appSettings.load();
    };
    window.addEventListener("open-settings-modal", onOpen);
    return () => window.removeEventListener("open-settings-modal", onOpen);
  });

  function close() {
    isOpen = false;
    appSettings.testMessage = null;
    appSettings.testOk = null;
    appSettings.saveMessage = null;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <ModalShell
    zClass="z-[100]"
    backdropClass="bg-black/60 backdrop-blur-sm"
    panelClass="w-[560px] max-h-[85vh] theme-bg-main theme-border border shadow-2xl rounded-xl flex flex-col overflow-hidden relative p-0 space-y-0"
    onBackdropClick={close}
  >
    <div class="flex-none flex items-center justify-between px-5 py-3 theme-border-b">
      <h2 class="text-sm font-bold font-mono uppercase tracking-widest theme-text-accent">
        Settings
      </h2>
      <button
        type="button"
        class="theme-text-muted hover:text-white cursor-pointer transition-colors"
        aria-label="Close settings"
        onclick={close}
      >
        ✕
      </button>
    </div>

    <div class="flex-none flex gap-1 px-5 pt-3">
      <button
        type="button"
        class="px-3 py-1 rounded border text-xs font-mono transition-colors {activeTab === 'engine'
          ? 'theme-bg-accent text-white theme-border-accent'
          : 'theme-border theme-bg-sidebar theme-text-main hover:theme-bg-accent-soft'}"
        aria-pressed={activeTab === "engine"}
        onclick={() => (activeTab = "engine")}
      >
        Engine
      </button>
      <button
        type="button"
        class="px-3 py-1 rounded border text-xs font-mono transition-colors {activeTab ===
        'appearance'
          ? 'theme-bg-accent text-white theme-border-accent'
          : 'theme-border theme-bg-sidebar theme-text-main hover:theme-bg-accent-soft'}"
        aria-pressed={activeTab === "appearance"}
        onclick={() => (activeTab = "appearance")}
      >
        Appearance
      </button>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto px-5 py-4 font-mono text-xs space-y-4">
      {#if activeTab === "engine"}
        <p class="theme-text-muted leading-relaxed">
          Configure how ChaosNexus Forge locates and launches ChaosNexus Anvil. Start and schema sync both use
          the binary path below.
        </p>

        <label class="block space-y-1">
          <span class="font-bold theme-text-main">ChaosNexus Anvil binary</span>
          <div class="flex gap-2">
            <input
              type="text"
              class="flex-1 min-w-0 px-2 py-1.5 rounded border theme-border theme-bg-sidebar theme-text-main"
              placeholder="/path/to/anvil"
              bind:value={appSettings.chaoswrenchBin}
            />
            <button
              type="button"
              class="px-2 py-1 rounded border theme-border theme-bg-main theme-text-main hover:theme-bg-accent hover:text-white shrink-0"
              onclick={() => appSettings.browseBinary()}
            >
              Browse
            </button>
            <button
              type="button"
              class="px-2 py-1 rounded border theme-border theme-bg-main theme-text-main hover:theme-bg-accent hover:text-white shrink-0"
              onclick={() => appSettings.testBinary()}
            >
              Test
            </button>
          </div>
        </label>

        {#if appSettings.testMessage}
          <p
            class="text-xs {appSettings.testOk === true
              ? 'text-green-400'
              : appSettings.testOk === false
                ? 'text-red-400'
                : 'theme-text-muted'}"
          >
            {appSettings.testMessage}
          </p>
        {/if}

        <label class="block space-y-1">
          <span class="font-bold theme-text-main">Valkey / Redis URL</span>
          <input
            type="text"
            class="w-full px-2 py-1.5 rounded border theme-border theme-bg-sidebar theme-text-main"
            placeholder="redis://127.0.0.1:6379 (optional)"
            bind:value={appSettings.valkeyUrl}
          />
          <span class="theme-text-muted">Passed as CHAOSWRENCH_VALKEY_URL to the engine child.</span>
        </label>

        <label class="block space-y-1">
          <span class="font-bold theme-text-main">Debug log file</span>
          <input
            type="text"
            class="w-full px-2 py-1.5 rounded border theme-border theme-bg-sidebar theme-text-main"
            placeholder="/path/to/chaosnexus-anvil-debug.log (optional)"
            bind:value={appSettings.debugLog}
          />
          <span class="theme-text-muted">Passed as CHAOSWRENCH_DEBUG_LOG to the engine child.</span>
        </label>
      {:else}
        <p class="theme-text-muted leading-relaxed">
          Theme and typography apply immediately and are stored in this browser profile.
        </p>

        <div class="block space-y-1">
          <span class="font-bold theme-text-main">Theme</span>
          <ThemedSelect
            testId="settings-theme-select"
            ariaLabel="Theme"
            value={workbench.theme}
            options={themeSelectOptions}
            onChange={(v) => workbench.setTheme(v)}
          />
        </div>

        <div class="block space-y-1">
          <span class="font-bold theme-text-main">Editor font size</span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="px-2 py-1 rounded border theme-border theme-bg-main theme-text-main hover:theme-bg-accent hover:text-white"
              onclick={() => workbench.setFontSize(workbench.fontSize - 1)}
            >
              −
            </button>
            <span class="min-w-[3rem] text-center">{workbench.fontSize}px</span>
            <button
              type="button"
              class="px-2 py-1 rounded border theme-border theme-bg-main theme-text-main hover:theme-bg-accent hover:text-white"
              onclick={() => workbench.setFontSize(workbench.fontSize + 1)}
            >
              +
            </button>
            <button
              type="button"
              class="px-2 py-1 rounded border theme-border theme-bg-main theme-text-main hover:theme-bg-accent hover:text-white"
              onclick={() => workbench.setFontSize(EDITOR_FONT_SIZE_DEFAULT)}
            >
              Reset
            </button>
          </div>
          <span class="theme-text-muted"
            >UI chrome: {resolveUiFontSize(workbench.fontSize)}px</span
          >
        </div>

        <div class="block space-y-1">
          <span class="font-bold theme-text-main">Font family</span>
          <ThemedSelect
            testId="settings-font-select"
            ariaLabel="Font family"
            value={workbench.fontFamily}
            options={fontSelectOptions}
            onChange={(v) => workbench.setFontFamily(v)}
          />
        </div>
      {/if}
    </div>

    {#if activeTab === "engine"}
      <div
        class="flex-none flex items-center justify-between gap-3 px-5 py-3 theme-border-t theme-bg-sidebar"
      >
        {#if appSettings.saveMessage}
          <span
            class="text-xs truncate {appSettings.saveMessage === 'Settings saved.'
              ? 'text-green-400'
              : 'text-red-400'}"
          >
            {appSettings.saveMessage}
          </span>
        {:else}
          <span></span>
        {/if}
        <button
          type="button"
          class="px-4 py-1.5 rounded border theme-border-accent theme-bg-accent text-white font-bold disabled:opacity-50"
          disabled={appSettings.saving}
          onclick={() => appSettings.save()}
        >
          {appSettings.saving ? "Saving…" : "Save"}
        </button>
      </div>
    {/if}
  </ModalShell>
{/if}
