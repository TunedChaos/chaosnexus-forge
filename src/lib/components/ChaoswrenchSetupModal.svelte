<!-- chaosnexus-forge/src/lib/components/ChaoswrenchSetupModal.svelte -->
<script lang="ts">
  // Recovery prompt shown when the engine fails to launch because the
  // ChaosNexus Anvil binary cannot be found. Lets the user point the Forge at their
  // executable, verify it, persist it to settings.toml, and retry the launch
  // without digging through the Settings modal.
  import ModalShell from "./ModalShell.svelte";
  import { engine } from "$lib/engine.svelte";
  import { appSettings } from "$lib/settings.svelte";

  let busy = $state(false);

  // Make sure the draft reflects persisted settings whenever the prompt opens.
  $effect(() => {
    if (engine.binarySetupNeeded && !appSettings.isLoaded) {
      void appSettings.load();
    }
  });

  function cancel() {
    appSettings.testMessage = null;
    appSettings.testOk = null;
    engine.dismissBinarySetup();
  }

  async function saveAndRetry() {
    if (!appSettings.chaoswrenchBin.trim()) {
      appSettings.testOk = false;
      appSettings.testMessage = "Enter a ChaosNexus Anvil binary path first.";
      return;
    }
    busy = true;
    try {
      const saved = await appSettings.save();
      if (!saved) return;
      appSettings.testMessage = null;
      appSettings.testOk = null;
      await engine.retryStart();
    } finally {
      busy = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!engine.binarySetupNeeded) return;
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if engine.binarySetupNeeded}
  <ModalShell
    zClass="z-[110]"
    backdropClass="bg-black/60 backdrop-blur-sm"
    panelClass="w-[520px] max-h-[85vh] theme-bg-main theme-border border shadow-2xl rounded-xl flex flex-col overflow-hidden relative p-0 space-y-0"
    onBackdropClick={cancel}
  >
    <div class="flex-none flex items-center justify-between px-5 py-3 theme-border-b">
      <h2
        data-testid="chaosnexus-anvil-setup-title"
        class="text-sm font-bold font-mono uppercase tracking-widest theme-text-accent"
      >
        ChaosNexus Anvil Not Found
      </h2>
      <button
        type="button"
        class="theme-text-muted hover:text-white cursor-pointer transition-colors"
        aria-label="Close"
        onclick={cancel}
      >
        ✕
      </button>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto px-5 py-4 font-mono text-xs space-y-4">
      <p class="theme-text-muted leading-relaxed">
        The Forge could not launch the engine because the
        <span class="font-bold theme-text-main">chaosnexus-anvil</span>
        executable was not found. Set its full path below to start the engine.
      </p>

      <label class="block space-y-1">
        <span class="font-bold theme-text-main">ChaosNexus Anvil binary</span>
        <div class="flex gap-2">
          <input
            type="text"
            data-testid="chaosnexus-anvil-setup-input"
            class="flex-1 min-w-0 px-2 py-1.5 rounded border theme-border theme-bg-sidebar theme-text-main"
            placeholder="/path/to/anvil"
            bind:value={appSettings.chaoswrenchBin}
          />
          <button
            type="button"
            data-testid="chaosnexus-anvil-setup-browse"
            class="px-2 py-1 rounded border theme-border theme-bg-main theme-text-main hover:theme-bg-accent hover:text-white shrink-0"
            onclick={() => appSettings.browseBinary()}
          >
            Browse
          </button>
          <button
            type="button"
            data-testid="chaosnexus-anvil-setup-test"
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
    </div>

    <div
      class="flex-none flex items-center justify-end gap-2 px-5 py-3 theme-border-t theme-bg-sidebar"
    >
      <button
        type="button"
        data-testid="chaosnexus-anvil-setup-cancel"
        class="px-4 py-1.5 rounded border theme-border theme-bg-main theme-text-main hover:theme-bg-accent hover:text-white"
        onclick={cancel}
      >
        Cancel
      </button>
      <button
        type="button"
        data-testid="chaosnexus-anvil-setup-save"
        class="px-4 py-1.5 rounded border theme-border-accent theme-bg-accent text-white font-bold disabled:opacity-50"
        disabled={busy}
        onclick={saveAndRetry}
      >
        {busy ? "Starting…" : "Save & Retry"}
      </button>
    </div>
  </ModalShell>
{/if}
