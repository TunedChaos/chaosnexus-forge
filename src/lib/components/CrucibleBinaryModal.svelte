<!-- chaosnexus-forge/src/lib/components/CrucibleBinaryModal.svelte -->
<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { appSettings } from "$lib/settings.svelte";
  import ModalShell from "./ModalShell.svelte";
  import IconFolder from "~icons/lucide/folder";
  import IconBot from "~icons/lucide/bot";
  import IconAlertTriangle from "~icons/lucide/triangle-alert";

  interface Props {
    open?: boolean;
    onClose: () => void;
    onSaveAndStart: () => Promise<void>;
  }

  let { open = false, onClose, onSaveAndStart }: Props = $props();

  let binPath = $state(appSettings.crucibleBin);
  let isSubmitting = $state(false);
  let errorMessage = $state<string | null>(null);

  // Sync binPath whenever modal opens
  $effect(() => {
    if (open) {
      binPath = appSettings.crucibleBin;
      errorMessage = null;
    }
  });

  let isPathEmpty = $derived(!binPath || binPath.trim() === "");

  async function handleBrowse() {
    try {
      const selected = await invoke<string | null>("pick_file");
      if (selected) {
        binPath = selected;
        errorMessage = null;
      }
    } catch (e) {
      console.error("Failed to pick Crucible binary file:", e);
    }
  }

  async function handleSubmit() {
    if (isPathEmpty) {
      errorMessage = "Please enter or select a valid path to the chaosnexus-crucible binary.";
      return;
    }

    isSubmitting = true;
    errorMessage = null;
    try {
      appSettings.crucibleBin = binPath.trim();
      await appSettings.save();
      await onSaveAndStart();
      onClose();
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      isSubmitting = false;
    }
  }
</script>

<ModalShell
  {open}
  panelClass="w-full max-w-lg theme-bg-main border theme-border rounded-lg shadow-2xl p-6 space-y-4 font-mono text-xs text-main"
  onBackdropClick={onClose}
>
  <div class="flex items-center justify-between border-b theme-border pb-3">
    <div class="flex items-center gap-2">
      <IconBot class="w-5 h-5 text-accent shrink-0" />
      <span class="font-bold text-sm uppercase tracking-wide">Crucible LLM Binary Path</span>
    </div>
    <button
      type="button"
      class="theme-text-muted hover:theme-text-main text-sm"
      onclick={onClose}
      aria-label="Close"
    >
      ✕
    </button>
  </div>

  <p class="theme-text-muted text-xs leading-relaxed">
    Crucible executable was not found in default locations. Please specify the path to your <code class="theme-text-accent bg-surface px-1 py-0.5 rounded">chaosnexus-crucible</code> binary executable.
  </p>

  <div class="space-y-1.5">
    <label for="crucible-bin-input" class="block font-bold text-[11px] uppercase tracking-wider theme-text-muted">
      Binary Executable Path
    </label>

    <div class="flex items-center gap-2">
      <input
        id="crucible-bin-input"
        data-testid="crucible-bin-input"
        type="text"
        bind:value={binPath}
        placeholder="/usr/local/bin/chaosnexus-crucible"
        class="flex-1 theme-bg-sidebar theme-border border rounded px-3 py-1.5 text-xs outline-none focus:border-accent transition-colors"
      />
      <button
        type="button"
        data-testid="crucible-browse-btn"
        onclick={handleBrowse}
        class="px-3 py-1.5 theme-bg-sidebar hover:theme-bg-header border theme-border rounded flex items-center gap-1.5 font-bold uppercase transition-colors cursor-pointer shrink-0"
      >
        <IconFolder class="w-3.5 h-3.5" />
        Browse…
      </button>
    </div>
  </div>

  {#if errorMessage}
    <div
      data-testid="crucible-modal-error"
      class="bg-amber-950/60 border border-amber-800/60 text-amber-300 rounded px-3 py-2 text-xs flex items-center gap-2"
    >
      <IconAlertTriangle class="w-4 h-4 shrink-0" />
      <span>{errorMessage}</span>
    </div>
  {/if}

  <div class="flex items-center justify-end gap-2 pt-2 border-t theme-border">
    <button
      type="button"
      data-testid="crucible-modal-cancel"
      class="px-3 py-1.5 rounded border theme-border theme-bg-sidebar hover:theme-bg-header font-bold uppercase transition-colors"
      onclick={onClose}
      disabled={isSubmitting}
    >
      Cancel
    </button>
    <button
      type="button"
      data-testid="crucible-modal-submit"
      class="px-3 py-1.5 rounded theme-bg-accent text-white font-bold uppercase hover:brightness-110 transition-all disabled:opacity-50"
      onclick={handleSubmit}
      disabled={isSubmitting || isPathEmpty}
    >
      {isSubmitting ? "Starting…" : "Save & Start LLM"}
    </button>
  </div>
</ModalShell>
