/**
 * chaosnexus-forge/src/lib/dual_editor/node_visuals.test.ts
 */
import { describe, expect, test } from "vitest";
import { CATALOG_CATEGORY_LABELS, type CatalogCategory } from "./node_catalog";
import { CATEGORY_COLOR_TOKEN, CATEGORY_ICON, categoryVisual } from "./node_visuals";

const ALL_CATEGORIES = Object.keys(CATALOG_CATEGORY_LABELS) as CatalogCategory[];

describe("node_visuals", () => {
  test("every catalog category has a color token and icon", () => {
    for (const category of ALL_CATEGORIES) {
      expect(CATEGORY_COLOR_TOKEN[category]).toMatch(/^var\(--cat-/);
      expect(CATEGORY_ICON[category]).toBeTruthy();
    }
  });

  test("color tokens map each category to its own --cat-* variable", () => {
    for (const category of ALL_CATEGORIES) {
      expect(CATEGORY_COLOR_TOKEN[category]).toBe(`var(--cat-${category})`);
    }
  });

  test("categoryVisual falls back to anchor for unknown categories", () => {
    const visual = categoryVisual("does-not-exist");
    expect(visual.colorToken).toBe(CATEGORY_COLOR_TOKEN.anchor);
    expect(visual.icon).toBe(CATEGORY_ICON.anchor);
    expect(visual.label).toBe(CATALOG_CATEGORY_LABELS.anchor);
  });

  test("categoryVisual resolves a known category", () => {
    const visual = categoryVisual("event");
    expect(visual.colorToken).toBe(CATEGORY_COLOR_TOKEN.event);
    expect(visual.icon).toBe(CATEGORY_ICON.event);
    expect(visual.label).toBe(CATALOG_CATEGORY_LABELS.event);
  });
});
