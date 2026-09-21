<!-- chaosnexus-forge/src/lib/components/SettingsModal.svelte -->
<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import ModalShell from "./ModalShell.svelte";
  import ThemedSelect from "./ThemedSelect.svelte";
  import {
    workbench,
    THEME_OPTIONS,
    FONT_FAMILY_OPTIONS,
    EDITOR_FONT_SIZE_DEFAULT,
    resolveUiFontSize,
  } from "$lib/state.svelte";
  import {
    appSettings,
    DEFAULT_CRUCIBLE_MODEL_ID,
    DEFAULT_CRUCIBLE_GGUF_FILE,
    TUNED_V1_MODEL_CARD_URL,
    GRANITE_GUARDIAN_MODEL_ID,
    GRANITE_GUARDIAN_GGUF_FILE,
    GRANITE_APACHE_LICENSE_URL,
    GRANITE_MODEL_CARD_URL,
  } from "$lib/settings.svelte";

  // Themed dropdown option lists (label/value pairs). Font rows carry a
  // previewFont so each renders in its own typeface.
  const themeSelectOptions = THEME_OPTIONS.map((t) => ({ value: t, label: t }));
  const fontSelectOptions = FONT_FAMILY_OPTIONS.map((f) => ({
    value: f.value,
    label: f.label,
    previewFont: f.value,
  }));

  let isOpen = $state(false);
  let activeTab = $state<"engine" | "models" | "appearance">("engine");
  let modelPreset = $state<"tuned-gguf" | "granite-guardian" | "custom">("tuned-gguf");

  onMount(() => {
    // Optional `detail.tab` lets callers (e.g. the menu-bar THEME shortcut) deep
    // link straight to a specific tab; absent or unknown values open Engine.
    const onOpen = (e: Event) => {
      const requested = (e as CustomEvent<{ tab?: string }>).detail?.tab;
      isOpen = true;
      if (requested === "appearance") activeTab = "appearance";
      else if (requested === "models") activeTab = "models";
      else activeTab = "engine";
      void appSettings.load();
      if (activeTab === "models") void appSettings.refreshModelStatus();
    };
    window.addEventListener("open-settings-modal", onOpen);
    return () => window.removeEventListener("open-settings-modal", onOpen);
  });

  function applyPreset(preset: "tuned-gguf" | "granite-guardian" | "custom") {
    modelPreset = preset;
    if (preset === "tuned-gguf") {
      appSettings.crucibleModelId = DEFAULT_CRUCIBLE_MODEL_ID;
      appSettings.crucibleGgufFile = DEFAULT_CRUCIBLE_GGUF_FILE;
    } else if (preset === "granite-guardian") {
      appSettings.crucibleModelId = GRANITE_GUARDIAN_MODEL_ID;
      appSettings.crucibleGgufFile = GRANITE_GUARDIAN_GGUF_FILE;
    }
  }

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
        data-testid="settings-tab-engine"
        onclick={() => (activeTab = "engine")}
      >
        Engine
      </button>
      <button
        type="button"
        class="px-3 py-1 rounded border text-xs font-mono transition-colors {activeTab === 'models'
          ? 'theme-bg-accent text-white theme-border-accent'
          : 'theme-border theme-bg-sidebar theme-text-main hover:theme-bg-accent-soft'}"
        aria-pressed={activeTab === "models"}
        data-testid="settings-tab-models"
        onclick={() => {
          activeTab = "models";
          void appSettings.refreshModelStatus();
        }}
      >
        Models
      </button>
      <button
        type="button"
        class="px-3 py-1 rounded border text-xs font-mono transition-colors {activeTab ===
        'appearance'
          ? 'theme-bg-accent text-white theme-border-accent'
          : 'theme-border theme-bg-sidebar theme-text-main hover:theme-bg-accent-soft'}"
        aria-pressed={activeTab === "appearance"}
        data-testid="settings-tab-appearance"
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
              data-testid="settings-anvil-bin"
              bind:value={appSettings.chaoswrenchBin}
            />
            <button
              type="button"
              class="px-2 py-1 rounded border theme-border theme-bg-main theme-text-main hover:theme-bg-accent hover:text-white shrink-0"
              data-testid="settings-anvil-browse"
              onclick={() => appSettings.browseBinary()}
            >
              Browse
            </button>
            <button
              type="button"
              class="px-2 py-1 rounded border theme-border theme-bg-main theme-text-main hover:theme-bg-accent hover:text-white shrink-0"
              data-testid="settings-anvil-test"
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
            data-testid="settings-valkey-url"
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
            data-testid="settings-debug-log"
            bind:value={appSettings.debugLog}
          />
          <span class="theme-text-muted">Passed as CHAOSWRENCH_DEBUG_LOG to the engine child.</span>
        </label>

        <div class="theme-border-t pt-3 space-y-3">
          <p class="theme-text-muted leading-relaxed">
            ChaosNexus Crucible runs as a separate LLM process so chat UI survives model restarts.
          </p>
          <label class="block space-y-1">
            <span class="font-bold theme-text-main">Crucible binary</span>
            <div class="flex items-center gap-2">
              <input
                type="text"
                class="flex-1 px-2 py-1.5 rounded border theme-border theme-bg-sidebar theme-text-main"
                placeholder="/path/to/chaosnexus-crucible"
                data-testid="settings-crucible-bin"
                bind:value={appSettings.crucibleBin}
              />
              <button
                type="button"
                data-testid="settings-crucible-browse"
                onclick={async () => {
                  try {
                    const selected = await invoke<string | null>("pick_file");
                    if (selected) appSettings.crucibleBin = selected;
                  } catch (e) {
                    console.error("Failed to pick Crucible binary:", e);
                  }
                }}
                class="px-3 py-1.5 theme-bg-sidebar hover:theme-bg-header border theme-border rounded font-bold uppercase transition-colors cursor-pointer shrink-0"
              >
                Browse…
              </button>
            </div>
          </label>
          <label class="block space-y-1">
            <span class="font-bold theme-text-main">Crucible port</span>
            <input
              type="text"
              class="w-full px-2 py-1.5 rounded border theme-border theme-bg-sidebar theme-text-main"
              data-testid="settings-crucible-port"
              bind:value={appSettings.cruciblePort}
            />
          </label>
          <label class="block space-y-1">
            <span class="font-bold theme-text-main">Crucible backend</span>
            <input
              type="text"
              class="w-full px-2 py-1.5 rounded border theme-border theme-bg-sidebar theme-text-main"
              placeholder="candle | stub | colibri"
              data-testid="settings-crucible-backend"
              bind:value={appSettings.crucibleBackend}
            />
            <span class="theme-text-muted">Default candle loads the Tuned GGUF; stub skips weights.</span>
          </label>
        </div>
      {:else if activeTab === "models"}
        <p class="theme-text-muted leading-relaxed" data-testid="settings-models-panel">
          Model weights are <strong>not</strong> inside the installer (Path 2). Crucible caches under
          <code class="theme-text-accent">~/.chaosnexus/crucible/models</code>. Default is ChaosNexus Tuned v1 GGUF. Download on demand, resume supported; the IDE always opens even if the model is missing.
        </p>

        <label class="block space-y-1">
          <span class="font-bold theme-text-main">Hugging Face token</span>
          <input
            type="password"
            class="w-full px-2 py-1.5 rounded border theme-border theme-bg-sidebar theme-text-main"
            placeholder="hf_… (optional for public repos)"
            data-testid="settings-hf-token"
            autocomplete="off"
            bind:value={appSettings.hfToken}
          />
          <span class="theme-text-muted">Stored locally in Forge settings; injected as HF_TOKEN into Crucible only.</span>
        </label>

        <div class="block space-y-1">
          <span class="font-bold theme-text-main">Preset</span>
          <select
            class="w-full px-2 py-1.5 rounded border theme-border theme-bg-sidebar"
            data-testid="settings-model-preset"
            value={modelPreset}
            onchange={(e) => applyPreset((e.currentTarget as HTMLSelectElement).value as "tuned-gguf" | "granite-guardian" | "custom")}
          >
            <option value="tuned-gguf">ChaosNexus Tuned v1 (GGUF)</option>
            <option value="granite-guardian">IBM Granite Guardian 3.2 (~6B) Q4_K_M</option>
            <option value="custom">Custom Hub ID</option>
          </select>
        </div>

        <label class="block space-y-1">
          <span class="font-bold theme-text-main">Model Hub ID</span>
          <input
            type="text"
            class="w-full px-2 py-1.5 rounded border theme-border theme-bg-sidebar theme-text-main"
            data-testid="settings-crucible-model-id"
            bind:value={appSettings.crucibleModelId}
          />
        </label>

        <label class="block space-y-1">
          <span class="font-bold theme-text-main">GGUF filename (optional)</span>
          <input
            type="text"
            class="w-full px-2 py-1.5 rounded border theme-border theme-bg-sidebar theme-text-main"
            placeholder="auto-detect Q4_K_M"
            data-testid="settings-crucible-gguf-file"
            bind:value={appSettings.crucibleGgufFile}
          />
        </label>

        <label class="flex items-start gap-2 text-sm theme-text-main" data-testid="settings-granite-consent">
          <input
            type="checkbox"
            class="mt-1"
            bind:checked={appSettings.graniteApacheAccepted}
            onchange={() => appSettings.save()}
          />
          <span>
            I accept the Hub terms for downloading
            <a class="theme-text-accent underline" href={TUNED_V1_MODEL_CARD_URL} target="_blank" rel="noreferrer"
              >ChaosNexus Tuned v1 GGUF</a
            >
            (AGPL packaging; base IBM Granite under
            <a class="theme-text-accent underline" href={GRANITE_APACHE_LICENSE_URL} target="_blank" rel="noreferrer"
              >Apache-2.0</a
            >). Required once before downloading. Optional guardian preset:
            <a class="theme-text-accent underline" href={GRANITE_MODEL_CARD_URL} target="_blank" rel="noreferrer"
              >IBM Granite Guardian card</a
            >.
          </span>
        </label>

        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="px-3 py-1.5 rounded border theme-border-accent theme-bg-accent text-white font-bold disabled:opacity-50"
            disabled={appSettings.modelPullBusy}
            onclick={() => appSettings.downloadTunedModel()}
            data-testid="settings-tuned-download"
          >
            {appSettings.modelPullBusy ? "Downloading…" : "Download ChaosNexus Tuned (~5.0 GB)"}
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded border theme-border-accent theme-bg-accent text-white font-bold disabled:opacity-50"
            data-testid="settings-model-pull"
            disabled={appSettings.modelPullBusy}
            onclick={() => appSettings.pullModel()}
          >
            {appSettings.modelPullBusy ? "Pulling…" : "Pull / Ensure"}
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded border theme-border"
            data-testid="settings-model-pick-local"
            onclick={() => appSettings.pickLocalGguf()}
          >
            Choose local .gguf…
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded border theme-border"
            data-testid="settings-model-refresh"
            onclick={() => appSettings.refreshModelStatus()}
          >
            Refresh status
          </button>
        </div>
        <p class="theme-text-muted text-[11px]">
          Optional mirror: set env <code>CHAOSNEXUS_MODEL_BASE_URL</code> on the Crucible process
          (filename appended). Partial downloads resume via <code>.gguf.partial</code>.
        </p>
        {#if appSettings.modelStatus}
          <p class="theme-text-muted text-[11px]" data-testid="settings-model-status">{appSettings.modelStatus}</p>
        {/if}
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

    {#if activeTab === "engine" || activeTab === "models"}
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
          data-testid="settings-save"
          onclick={() => appSettings.save()}
        >
          {appSettings.saving ? "Saving…" : "Save"}
        </button>
      </div>
    {/if}
  </ModalShell>
{/if}
