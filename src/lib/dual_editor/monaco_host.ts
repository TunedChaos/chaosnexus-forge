// chaosnexus-forge/src/lib/dual_editor/monaco_host.ts
//
// Monaco editor mount/teardown for DualEditor. Keeps the Svelte component
// focused on layout and workbench wiring.

import { workbench } from "$lib/state.svelte";
import { formatBold, formatItalic, formatLink } from "$lib/dual_editor/markdown_format";
import { loadMonaco } from "$lib/dual_editor/monaco_loader";
import { languageForFilename, registerMonacoLanguages } from "$lib/dual_editor/monaco_languages";
import { createTauriLanguageClient } from "$lib/dual_editor/lsp_bridge";
import { initServices } from "monaco-languageclient/vscode/services";

let lspServicesInitialized = false;

/** Monaco theme id for popup chrome only; editor body inherits vs-dark syntax colors. */
export const CHROME_THEME_ID = "chaosnexus-forge-chrome";

/**
 * Configuration options for initializing the Monaco editor host.
 */
export interface MonacoHostOptions {
  initialContent: string;
  /** Active tab filename used to pick the Monaco model language. */
  getFilename: () => string;
  onContentChange: (value: string) => void;
  onInstance?: (instance: any | null) => void;
}

/** Read a CSS custom property from the document root (active ChaosNexus Forge theme). */
function readVar(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Append an alpha channel to a `#rrggbb` or `#rgb` hex color for Monaco list highlights. */
function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  if (!clean) return hex;
  let r: number;
  let g: number;
  let b: number;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else if (clean.length >= 6) {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  } else {
    return hex;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Resolves the closest Monaco base theme for the active ChaosNexus Forge theme so
 * the editor body's default syntax palette matches light/dark/high-contrast.
 */
function resolveBaseTheme(): "vs" | "vs-dark" | "hc-black" | "hc-light" {
  const theme = (typeof document !== "undefined"
    ? document.documentElement.getAttribute("data-theme") || ""
    : ""
  ).toLowerCase();
  if (theme.includes("hc-light")) return "hc-light";
  if (theme.includes("hc-dark") || theme.includes("monochromacy-dark")) return "hc-black";
  if (theme.includes("light")) return "vs";
  return "vs-dark";
}

/**
 * Applies Monaco theming from the app's CSS theme variables. The editor body
 * (background/foreground) and popup chrome (context menu, command palette,
 * find widget, hover, suggest) all follow the active ChaosNexus Forge theme, while
 * code syntax token colors keep the base theme's defaults.
 */
export function applyEditorChromeTheme(monaco: typeof import("monaco-editor")) {
  const bgMain = readVar("--bg-main");
  const bgHeader = readVar("--bg-header");
  const textMain = readVar("--text-main");
  const textMuted = readVar("--text-muted");
  const borderColor = readVar("--border-color");
  const accent = readVar("--color-accent");
  const accentSoft = accent ? withAlpha(accent, 0.25) : accent;

  const colors: Record<string, string> = {
    // Right-click context menu
    "menu.background": bgHeader,
    "menu.foreground": textMain,
    "menu.border": borderColor,
    "menu.separatorBackground": borderColor,
    "menu.selectionBackground": accent,
    "menu.selectionForeground": "#ffffff",
    // Command palette (F1)
    "quickInput.background": bgHeader,
    "quickInput.foreground": textMain,
    "pickerGroup.foreground": textMuted,
    "pickerGroup.border": borderColor,
    "quickInputList.focusBackground": accentSoft,
    "quickInputList.focusForeground": textMain,
    "focusBorder": accent,
    // Shared editor widgets (find, hover, suggest)
    "editorWidget.background": bgHeader,
    "editorWidget.foreground": textMain,
    "editorWidget.border": borderColor,
    "input.background": bgHeader,
    "input.foreground": textMain,
    "input.border": borderColor,
    "inputOption.activeBorder": accent,
    "widget.shadow": "#00000066",
    "list.focusBackground": accentSoft,
    "list.hoverBackground": accentSoft,
    "list.highlightForeground": accent,
  };

  // Editor body follows the active theme background/foreground.
  if (bgMain) colors["editor.background"] = bgMain;
  if (textMain) colors["editor.foreground"] = textMain;

  monaco.editor.defineTheme(CHROME_THEME_ID, {
    base: resolveBaseTheme(),
    inherit: true,
    rules: [],
    colors,
  });
  monaco.editor.setTheme(CHROME_THEME_ID);
}

/** True when the active workbench tab is a markdown file. */
function isActiveMarkdownTab(): boolean {
  return workbench.activeTab?.filename.endsWith(".md") ?? false;
}

/** Svelte `use:` action factory for the code editor pane. */
export function createMonacoHost(getOptions: () => MonacoHostOptions) {
  return (node: HTMLElement) => {
    let localMonacoInstance: any = null;
    let disposed = false;

    void loadMonaco().then((monaco) => {
      if (disposed || !node.isConnected) return;

      registerMonacoLanguages(monaco);
      applyEditorChromeTheme(monaco);

      const opts = getOptions();
      const language = languageForFilename(opts.getFilename());

      localMonacoInstance = monaco.editor.create(node, {
        value: opts.initialContent,
        language,
        theme: CHROME_THEME_ID,
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        fontSize: workbench.fontSize,
        fontFamily: workbench.fontFamily,
        lineHeight: 0,
        padding: { top: 10, bottom: 10 },
      });

      opts.onInstance?.(localMonacoInstance);

      localMonacoInstance.onDidChangeModelContent(() => {
        if (disposed) return;
        opts.onContentChange(localMonacoInstance.getValue());
      });

      localMonacoInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
        if (workbench.activeTab) {
          await workbench.saveFile(workbench.activeTab.pluginName, workbench.activeTab.filename);
        }
      });

      localMonacoInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => {
        if (!isActiveMarkdownTab()) return;
        formatBold(localMonacoInstance);
      });

      localMonacoInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => {
        if (!isActiveMarkdownTab()) return;
        formatItalic(localMonacoInstance);
      });

      localMonacoInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
        if (!isActiveMarkdownTab()) return;
        formatLink(localMonacoInstance);
      });

      setTimeout(() => {
        localMonacoInstance?.trigger("fold", "editor.foldAllMarkerRegions");
      }, 150);

      // Rhai completion/hover/diagnostics via LSP bridge
      if (language === "rhai") {
        if (!lspServicesInitialized) {
          initServices({
            userServices: {},
            debugLogging: false,
            workspaceConfig: {
              workspaceProvider: {
                trust: () => "trusted",
                workspace: {
                  workspaceUri: monaco.Uri.parse("file:///"),
                },
                environments: monaco.Uri.parse("file:///"),
              },
            },
          })
            .then(() => {
              lspServicesInitialized = true;
              const languageClient = createTauriLanguageClient();
              languageClient.start();
            })
            .catch(console.error);
        } else {
          // If already initialized, we might just need a new client or the existing one handles multiple files
          // The Tauri LSP bridge is global, so one client is enough.
        }
      }
    });

    return {
      destroy() {
        disposed = true;
        if (localMonacoInstance) {
          localMonacoInstance.dispose();
        }
        getOptions().onInstance?.(null);
      },
    };
  };
}

/** Wire MenuBar editor-action events to a Monaco instance. */
export function bindEditorActionShortcuts(monacoInstance: () => any | null): () => void {
  const handleEditorAction = (e: Event) => {
    const inst = monacoInstance();
    if (!inst) return;
    const detail = (e as CustomEvent).detail;
    switch (detail) {
      case "undo":
        inst.trigger("keyboard", "undo", null);
        break;
      case "redo":
        inst.trigger("keyboard", "redo", null);
        break;
      case "cut":
        inst.trigger("keyboard", "editor.action.clipboardCutAction", null);
        break;
      case "copy":
        inst.trigger("keyboard", "editor.action.clipboardCopyAction", null);
        break;
      case "paste":
        inst.trigger("keyboard", "editor.action.clipboardPasteAction", null);
        break;
      case "find":
        inst.trigger("keyboard", "actions.find", null);
        break;
      case "replace":
        inst.trigger("keyboard", "editor.action.startFindReplaceAction", null);
        break;
    }
  };

  window.addEventListener("editor-action", handleEditorAction);
  return () => window.removeEventListener("editor-action", handleEditorAction);
}
