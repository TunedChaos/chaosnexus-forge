/**
 * chaosnexus-forge/src/lib/dual_editor/monaco_loader.ts
 *
 * Memoized Monaco bootstrap: one dynamic import shared by DualEditor, MacroDrawer,
 * and the idle launch warm-up so we never pay duplicate chunk fetch/parse costs.
 *
 * We deliberately import the trimmed `edcore.main` entry instead of the default
 * `monaco-editor` barrel. `edcore.main` keeps the full editor core plus every
 * standalone feature (command palette, find/replace, folding, hover, suggest,
 * context menu, multicursor, comment toggle, ...) but ships ZERO bundled
 * languages. The default barrel additionally pulls in ~80 grammars and the
 * css/html/json/typescript language services, whose web workers (ts.worker
 * alone is ~6.6 MB) we never use. We then re-add only the grammars we support.
 *
 * Rhai (`.rhai`), TOML, and JSON are all custom Monarch grammars registered in
 * `monaco_languages.ts`, so the only built-in grammar we still pull is
 * `markdown` for docs. The previous `rust` built-in stand-in for Rhai is gone.
 */

import { registerRhaiLanguageFeatures } from "$lib/monaco_providers";
import { registerMonacoLanguages } from "$lib/dual_editor/monaco_languages";

/** The Monaco editor module type. */
export type MonacoModule = typeof import("monaco-editor");

let monacoPromise: Promise<MonacoModule> | null = null;
let warmPromise: Promise<void> | null = null;

/**
 * Loads Monaco's trimmed editor core plus the one whitelisted built-in grammar.
 *
 * `markdown` (built-in) powers docs. Rhai, TOML, and JSON are registered as
 * lightweight custom Monarch grammars in {@link registerMonacoLanguages}, so no
 * further built-in grammars are needed.
 */
async function importTrimmedMonaco(): Promise<MonacoModule> {
  const monaco = (await import(
    "monaco-editor/esm/vs/editor/edcore.main"
  )) as unknown as MonacoModule;

  await import("monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution");

  return monaco;
}

/** Returns a cached promise for the Monaco ESM module (single flight). */
export function loadMonaco(): Promise<MonacoModule> {
  if (!monacoPromise) {
    monacoPromise = importTrimmedMonaco().then((monaco) => {
      if (typeof window !== "undefined") {
        (window as { monaco?: MonacoModule }).monaco = monaco;
      }
      return monaco;
    });
  }
  return monacoPromise;
}

/**
 * Preloads Monaco, registers custom grammars, and warms Rhai completion/hover
 * providers (including the engine-schema IPC). Safe to call multiple times.
 */
export function warmMonaco(): Promise<void> {
  if (!warmPromise) {
    warmPromise = loadMonaco().then(async (monaco) => {
      registerMonacoLanguages(monaco);
      await registerRhaiLanguageFeatures(monaco);
    });
  }
  return warmPromise;
}

/**
 * Schedules {@link warmMonaco} on the browser idle queue so the shell paints
 * first. Falls back to a short timeout when `requestIdleCallback` is absent.
 */
export function scheduleMonacoWarmup(): void {
  if (typeof window === "undefined") return;

  const run = () => {
    void warmMonaco().catch((err) => {
      console.warn("[monaco_loader] Idle warm-up failed", err);
    });
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 250);
  }
}
