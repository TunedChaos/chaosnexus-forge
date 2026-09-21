/**
 * @file node_palette.test.ts
 *
 * Tests for the categorized node palette builder.
 */
import { describe, expect, test } from "vitest";
import { buildPaletteItems, filterPaletteItems, groupPaletteItems } from "./node_palette";

describe("node_palette", () => {
  test("buildPaletteItems includes all categories", () => {
    const items = buildPaletteItems({
      unboundFunctions: ["step_a"],
      nativeFunctions: [
        {
          name: "log_info",
          module: "global",
          signature: "log_info()",
          description: "Log line",
          params: [],
        },
      ],
      proxyTools: [
        {
          conn: { id: "t1", label: "Term", command: "x", args: [], scope: "read-only" },
          tool: { name: "run", description: "Run cmd", input_schema: {} },
        },
      ],
    });

    expect(items.some((i) => i.category === "anchor")).toBe(true);
    expect(items.some((i) => i.action.type === "assemblyFn")).toBe(true);
    expect(items.some((i) => i.action.type === "nativeFn")).toBe(true);
    expect(items.some((i) => i.action.type === "catalog")).toBe(true);
    expect(items.some((i) => i.action.type === "importManifest")).toBe(true);
    expect(items.some((i) => i.action.type === "literal")).toBe(true);
    expect(items.some((i) => i.action.type === "proxy")).toBe(true);
  });

  test("filterPaletteItems matches label and description", () => {
    const items = buildPaletteItems({
      unboundFunctions: ["my_handler"],
      nativeFunctions: [],
      proxyTools: [],
    });
    const filtered = filterPaletteItems(items, "handler");
    expect(filtered.some((i) => i.label === "my_handler")).toBe(true);
    expect(filtered.some((i) => i.label === "Branch")).toBe(false);
  });

  test("groupPaletteItems preserves category order", () => {
    const items = buildPaletteItems({
      unboundFunctions: ["fn1"],
      nativeFunctions: [{ name: "n1", module: "g", signature: "", description: "", params: [] }],
      proxyTools: [],
    });
    const groups = groupPaletteItems(items);
    const cats = groups.map((g) => g.category);
    expect(cats.indexOf("anchor")).toBeLessThan(cats.indexOf("function"));
    expect(cats.indexOf("function")).toBeLessThan(cats.indexOf("native"));
  });

  test("groupPaletteItems alphabetizes items within a category", () => {
    const items = buildPaletteItems({
      unboundFunctions: ["zebra", "alpha", "Mike"],
      nativeFunctions: [],
      proxyTools: [],
    });
    const fnGroup = groupPaletteItems(items).find((g) => g.category === "function");
    expect(fnGroup).toBeDefined();
    expect(fnGroup!.items.map((i) => i.label)).toEqual(["alpha", "Mike", "zebra"]);
  });

  test("groupPaletteItems attaches visual identity to each group", () => {
    const items = buildPaletteItems({
      unboundFunctions: ["fn1"],
      nativeFunctions: [],
      proxyTools: [],
    });
    for (const group of groupPaletteItems(items)) {
      expect(group.colorToken).toMatch(/^var\(--cat-/);
      expect(group.icon).toBeTruthy();
    }
  });
});
