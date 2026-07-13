// chaosnexus-forge/src/lib/monaco_providers.test.ts

import { describe, test, expect, vi } from "vitest";
import { rhaiBuiltins, registerRhaiLanguageFeatures } from "./monaco_providers";

describe("Rhai Monaco Language Providers", () => {
  test("rhaiBuiltins has correct keys and details", () => {
    expect(rhaiBuiltins).toBeDefined();
    expect(rhaiBuiltins.fs_read).toBeDefined();
    expect(rhaiBuiltins.fs_read.signature).toBe(
      "fs_read(plugin_name: &str, relative_path: &str) -> String"
    );
    expect(rhaiBuiltins.http_get).toBeDefined();
    expect(rhaiBuiltins.kv_get).toBeDefined();
    expect(rhaiBuiltins.db_query).toBeDefined();
  });

  test("registerRhaiLanguageFeatures registers completion and hover providers and sets guard", async () => {
    // Create a mock monaco instance
    const registeredProviders: Record<string, any[]> = {};

    const mockMonaco = {
      __rhai_registered: false,
      languages: {
        registerCompletionItemProvider: vi.fn((lang, provider) => {
          if (!registeredProviders[lang]) registeredProviders[lang] = [];
          registeredProviders[lang].push({ type: "completion", provider });
          return { dispose: () => {} };
        }),
        registerHoverProvider: vi.fn((lang, provider) => {
          if (!registeredProviders[lang]) registeredProviders[lang] = [];
          registeredProviders[lang].push({ type: "hover", provider });
          return { dispose: () => {} };
        }),
        CompletionItemKind: {
          Function: 1,
          Keyword: 2,
          Snippet: 3,
        },
        CompletionItemInsertTextRule: {
          InsertAsSnippet: 4,
        },
      },
      Range: function (l1: number, c1: number, l2: number, c2: number) {
        return { startLineNumber: l1, startColumn: c1, endLineNumber: l2, endColumn: c2 };
      },
    };

    // Before registering, mock should have 0 calls
    expect(mockMonaco.languages.registerCompletionItemProvider).not.toHaveBeenCalled();
    expect(mockMonaco.languages.registerHoverProvider).not.toHaveBeenCalled();

    // Call it
    await registerRhaiLanguageFeatures(mockMonaco);

    // Verify it is registered
    expect(mockMonaco.languages.registerCompletionItemProvider).toHaveBeenCalledWith(
      "rhai",
      expect.any(Object)
    );
    expect(mockMonaco.languages.registerHoverProvider).toHaveBeenCalledWith(
      "rhai",
      expect.any(Object)
    );

    // Call it again to test the guard
    await registerRhaiLanguageFeatures(mockMonaco);

    // Should still only have 1 call because of `isRegistered` guard
    expect(mockMonaco.languages.registerCompletionItemProvider).toHaveBeenCalledTimes(1);
    expect(mockMonaco.languages.registerHoverProvider).toHaveBeenCalledTimes(1);

    // Test the completion item provider mock execution
    const completionProvider = registeredProviders["rhai"].find(
      (p) => p.type === "completion"
    ).provider;
    const mockModel = {
      getValueInRange: vi.fn(() => "fs_"),
    };
    const mockPosition = { lineNumber: 1, column: 4 };

    const completions = completionProvider.provideCompletionItems(mockModel, mockPosition);
    expect(completions.suggestions).toBeDefined();
    expect(completions.suggestions.length).toBeGreaterThan(10);

    // Check if fs_read suggestion exists
    const fsReadSuggestion = completions.suggestions.find((s: any) => s.label === "fs_read");
    expect(fsReadSuggestion).toBeDefined();
    expect(fsReadSuggestion.detail).toBe("Read file contents from plugin workspace");

    // Check if new snippet suggestions exist
    const tryCatchBlock = completions.suggestions.find((s: any) => s.label === "try_catch_block");
    expect(tryCatchBlock).toBeDefined();
    expect(tryCatchBlock.kind).toBe(3); // CompletionItemKind.Snippet
    expect(tryCatchBlock.detail).toContain("Try / Catch");

    const regToolBlock = completions.suggestions.find(
      (s: any) => s.label === "register_tool_block"
    );
    expect(regToolBlock).toBeDefined();
    expect(regToolBlock.kind).toBe(3);

    // Test hover provider mock execution
    const hoverProvider = registeredProviders["rhai"].find((p) => p.type === "hover").provider;
    const mockModelHover = {
      getWordAtPosition: vi.fn(() => ({ word: "fs_read", startColumn: 1, endColumn: 7 })),
    };
    const mockPositionHover = { lineNumber: 1, column: 4 };

    const hover = hoverProvider.provideHover(mockModelHover, mockPositionHover);
    expect(hover).toBeDefined();
    expect(hover.contents).toBeDefined();
    expect(hover.contents[0].value).toContain(
      "fs_read(plugin_name: &str, relative_path: &str) -> String"
    );
  });
});
