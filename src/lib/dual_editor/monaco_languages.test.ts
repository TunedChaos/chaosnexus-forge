/**
 * chaosnexus-forge/src/lib/dual_editor/monaco_languages.test.ts
 */
import { describe, expect, test } from "vitest";
import { languageForFilename } from "./monaco_languages";

describe("monaco_languages", () => {
  test("languageForFilename maps supported extensions", () => {
    expect(languageForFilename("plugin.rhai")).toBe("rhai");
    expect(languageForFilename("lib.rs")).toBe("rhai");
    expect(languageForFilename("README.md")).toBe("markdown");
    expect(languageForFilename("plugin.toml")).toBe("toml");
    expect(languageForFilename("chaos_schema.json")).toBe("json");
    expect(languageForFilename("notes.txt")).toBe("plaintext");
  });
});
