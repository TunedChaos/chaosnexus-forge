<!-- chaosnexus-forge/src/lib/components/MacroDrawer.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { workbench } from "$lib/state.svelte";
  import { loadMonaco } from "$lib/dual_editor/monaco_loader";
  import { registerMonacoLanguages, RHAI_LANGUAGE_ID } from "$lib/dual_editor/monaco_languages";
  import { applyEditorChromeTheme, CHROME_THEME_ID } from "$lib/dual_editor/monaco_host";
  import { registerRhaiLanguageFeatures } from "$lib/monaco_providers";

  /**
   * Properties for the MacroDrawer component.
   */
  interface Props {
    /** Determines if the drawer is currently open and visible. */
    isOpen: boolean;
    /** The label or title of the node being edited. */
    nodeLabel: string;
    /** The initial code loaded into the Monaco editor. */
    initialCode: string;
    /** Callback invoked when the user saves their code. */
    onSave: (newCode: string) => void;
    /** Callback invoked when the user requests to close the drawer. */
    onClose: () => void;
  }

  let { isOpen, nodeLabel, initialCode, onSave, onClose }: Props = $props();

  let containerElement = $state<HTMLDivElement>();
  let monacoInstance: any = null;

  // Initialize Monaco Editor inside the drawer when visible
  $effect(() => {
    if (isOpen && containerElement && !monacoInstance) {
      void loadMonaco().then((monaco) => {
        if (!containerElement) return;
        registerMonacoLanguages(monaco);
        applyEditorChromeTheme(monaco);
        monacoInstance = monaco.editor.create(containerElement, {
          value: initialCode,
          language: RHAI_LANGUAGE_ID,
          theme: CHROME_THEME_ID,
          minimap: { enabled: false },
          automaticLayout: true,
          scrollBeyondLastLine: false,
          fontSize: workbench.fontSize,
          fontFamily: workbench.fontFamily,
          lineHeight: 0,
          padding: { top: 8, bottom: 8 },
        });

        monacoInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          handleSave();
        });

        void registerRhaiLanguageFeatures(monaco);
      });
    }
  });

  // Re-load code if a different node is selected while drawer is open
  $effect(() => {
    if (isOpen && monacoInstance && nodeLabel) {
      monacoInstance.setValue(initialCode);
    }
  });

  // Dispose of Monaco editor when drawer closes
  $effect(() => {
    if (!isOpen && monacoInstance) {
      monacoInstance.dispose();
      monacoInstance = null;
    }
  });

  onDestroy(() => {
    if (monacoInstance) {
      monacoInstance.dispose();
    }
  });

  function handleSave() {
    if (monacoInstance) {
      const code = monacoInstance.getValue();
      onSave(code);
    }
  }
</script>

<!-- Backdrop Overlay -->
{#if isOpen}
  <div
    class="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity duration-300"
    onclick={onClose}
    onkeydown={(e) => {
      if (e.key === "Escape") onClose();
    }}
    role="button"
    tabindex="0"
    aria-label="Close settings drawer backdrop"
  ></div>
{/if}

<!-- Side Drawer Container -->
<div
  class="fixed top-0 right-0 h-full w-[460px] bg-zinc-950 border-l border-zinc-800 z-50 shadow-2xl flex flex-col transition-transform duration-300 font-mono
    {isOpen ? 'translate-x-0' : 'translate-x-full'}"
>
  <!-- Header Bar -->
  <div class="px-4 py-3 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between">
    <div class="space-y-0.5">
      <div class="flex items-center space-x-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
        <span class="text-xs text-zinc-500 font-bold uppercase tracking-wider"
          >Node Macro Editor</span
        >
      </div>
      <h3 class="text-xs font-bold text-zinc-200 truncate max-w-[320px]">{nodeLabel}</h3>
    </div>

    <!-- Close Drawer -->
    <button
      onclick={onClose}
      class="p-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-all cursor-pointer"
      title="Close drawer"
    >
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    </button>
  </div>

  <!-- Main Code Pane -->
  <div class="flex-1 min-h-0 bg-zinc-950 flex flex-col relative">
    <div
      class="px-4 py-1 bg-zinc-900/30 border-b border-zinc-800 flex items-center justify-between text-xs text-zinc-500"
    >
      <span>Rhai Logic Script Block</span>
      <span class="text-xs bg-zinc-900 px-1 py-0.5 rounded text-zinc-400">Ctrl+S To Apply</span>
    </div>
    <div bind:this={containerElement} class="flex-1 w-full bg-zinc-950 min-h-0"></div>
  </div>

  <!-- Bottom Action Drawer Bar -->
  <div
    class="px-4 py-3 bg-zinc-900/60 border-t border-zinc-800 flex items-center justify-end space-x-2"
  >
    <button
      onclick={onClose}
      class="px-3 py-1.5 text-xs font-bold uppercase bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 rounded transition-all cursor-pointer"
    >
      Cancel
    </button>
    <button
      onclick={handleSave}
      class="px-4 py-1.5 text-xs font-bold uppercase bg-red-950/80 hover:bg-red-950 text-red-400 border border-red-900 rounded shadow-md hover:shadow-red-950/20 transition-all cursor-pointer"
    >
      Apply Changes
    </button>
  </div>
</div>
