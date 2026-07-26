/**
 * @file monaco-edcore.d.ts
 * @module chaosnexus-forge/monaco-edcore
 * @description Ambient types for the trimmed Monaco entry points we import directly. Monaco
 * ships `editor.api.d.ts` for its public API but no declaration for the
 * `edcore.main` ("editor core + all features, bring your own languages") entry,
 * so we re-export the public API surface to keep `loadMonaco()` fully typed
 * while shedding the css/html/json/typescript language services and their
 * multi-megabyte web workers that the default `monaco-editor` barrel pulls in.
 */

declare module "monaco-editor/esm/vs/editor/edcore.main" {
  export * from "monaco-editor/esm/vs/editor/editor.api";
}

// The one whitelisted built-in grammar is a side-effect-only import (it
// registers the language on the global Monaco instance). Monaco's `exports` map
// hides this deep subpath from the TypeScript bundler resolver even though the
// runtime file resolves fine, so we declare it as an empty ambient module.
declare module "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution";
