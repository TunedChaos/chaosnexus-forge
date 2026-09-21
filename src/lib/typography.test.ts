/**
 * @file typography.test.ts
 * @description Unit tests for typography and theme resolution utilities.
 */

// chaosnexus-forge/src/lib/typography.test.ts
import { describe, expect, it } from "vitest";
import {
  EDITOR_FONT_SIZE_DEFAULT,
  UI_FONT_SIZE_OFFSET,
  resolveUiFontSize,
  resolveThemeDataAttribute,
  THEME_SLUG_MAP,
} from "./state.svelte";

describe("typography constants", () => {
  it("uses VS Code-aligned editor default", () => {
    expect(EDITOR_FONT_SIZE_DEFAULT).toBe(14);
  });

  it("keeps UI chrome one step smaller than the editor", () => {
    expect(resolveUiFontSize(EDITOR_FONT_SIZE_DEFAULT)).toBe(
      EDITOR_FONT_SIZE_DEFAULT + UI_FONT_SIZE_OFFSET
    );
  });

  it("does not shrink UI chrome below 11px", () => {
    expect(resolveUiFontSize(10)).toBe(11);
  });
});

describe("resolveThemeDataAttribute", () => {
  it("maps named themes to data-theme slugs", () => {
    expect(resolveThemeDataAttribute("Standard Dark")).toBe("dark");
    expect(resolveThemeDataAttribute("High Contrast Light")).toBe("hc-light");
    expect(THEME_SLUG_MAP["Protanopia Dark"]).toBe("protanopia-dark");
  });

  it("respects system preference for System theme", () => {
    expect(resolveThemeDataAttribute("System", true)).toBe("dark");
    expect(resolveThemeDataAttribute("System", false)).toBe("light");
  });
});
