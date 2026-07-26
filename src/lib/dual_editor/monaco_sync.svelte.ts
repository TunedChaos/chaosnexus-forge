/**
 * @file monaco_sync.svelte.ts
 * @description Synchronization logic between Svelte state and Monaco Editor instances.
 */

// chaosnexus-forge/src/lib/dual_editor/monaco_sync.svelte.ts
import { workbench } from "$lib/state.svelte";
import { languageForFilename } from "./monaco_languages";
import { applyEditorChromeTheme } from "./monaco_host";
import { pendingPlugins } from "$lib/pending.svelte";

/**
 * Binds reactive Svelte effects to a Monaco Editor instance to keep it synchronized
 * with the application state. Handles content syncing, auto-focus, language switching,
 * theme application, read-only toggling, and font adjustments.
 *
 * @param props - An object containing getters and setters for interacting with Svelte state and the Monaco instance.
 * @param props.getMonacoInstance - Returns the current Monaco Editor instance.
 * @param props.getActiveKey - Returns the key of the active tab.
 * @param props.getActiveContent - Returns the content of the active tab.
 * @param props.getIsUpdatingFromState - Returns whether the editor is currently being updated from Svelte state.
 * @param props.setIsUpdatingFromState - Sets whether the editor is currently being updated from Svelte state.
 */
export function bindMonacoEffects(props: {
  getMonacoInstance: () => any;
  getActiveKey: () => string | null;
  getActiveContent: () => string;
  getIsUpdatingFromState: () => boolean;
  setIsUpdatingFromState: (val: boolean) => void;
}) {
  let lastFocusedKey = $state("");

  // Monitor active tab content changes from Svelte state and push to Monaco
  $effect(() => {
    const monacoInstance = props.getMonacoInstance();
    const activeKey = props.getActiveKey();
    if (!monacoInstance || !activeKey || props.getIsUpdatingFromState()) return;

    const currentVal = monacoInstance.getValue();
    const activeContent = props.getActiveContent();
    if (currentVal !== activeContent) {
      props.setIsUpdatingFromState(true);
      monacoInstance.setValue(activeContent);
      props.setIsUpdatingFromState(false);
    }

    // Auto-focus and snap to top if this is a newly opened tab, BUT only after content has actually loaded from backend
    const isLoaded =
      workbench.activeTab &&
      workbench.fileContents[`${workbench.activeTab.pluginName}:${workbench.activeTab.filename}`] !==
        undefined;

    if (isLoaded && activeKey !== lastFocusedKey) {
      lastFocusedKey = activeKey;
      setTimeout(() => {
        monacoInstance.focus();
        monacoInstance.setPosition({ lineNumber: 1, column: 1 });
      }, 50);
    }
  });

  // Track active tab language dynamically (skip when already correct).
  $effect(() => {
    const monacoInstance = props.getMonacoInstance();
    if (!monacoInstance || !workbench.activeTab) return;
    const model = monacoInstance.getModel();
    if (!model) return;

    const lang = languageForFilename(workbench.activeTab.filename);
    if (model.getLanguageId() === lang) return;

    const monaco = (
      window as { monaco?: { editor: { setModelLanguage: (m: unknown, l: string) => void } } }
    ).monaco;
    if (!monaco) return;
    monaco.editor.setModelLanguage(model, lang);
  });

  // Sync Monaco popup chrome with ChaosNexus Forge theme CSS variables (menu, palette).
  // Editor syntax colors stay on the vs-dark base; see applyEditorChromeTheme.
  $effect(() => {
    const _theme = workbench.theme;
    const timer = setTimeout(() => {
      const monaco = (window as any).monaco;
      if (monaco) {
        applyEditorChromeTheme(monaco);
      }
    }, 50);
    return () => clearTimeout(timer);
  });

  // Force Monaco to read-only when viewing a pending plugin
  $effect(() => {
    const monacoInstance = props.getMonacoInstance();
    if (monacoInstance) {
      const isPending = workbench.activeTab?.pluginName === "__PENDING__";
      monacoInstance.updateOptions({ readOnly: isPending && !pendingPlugins.isEditingEnabled });
    }
  });

  // Dynamic Monaco Editor Font Size & Family Adjuster
  $effect(() => {
    const monacoInstance = props.getMonacoInstance();
    if (monacoInstance) {
      monacoInstance.updateOptions({
        fontSize: workbench.fontSize,
        fontFamily: workbench.fontFamily,
      });
    }
  });
}
