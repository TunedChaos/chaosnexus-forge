/**
 * @file node_palette.ts
 *
 * Shared categorized palette for the visual scripting context menu and side panel.
 */

import type { McpConnection, McpToolSchema } from "$lib/mcp.svelte";
import type { SchemaFunction } from "$lib/schema.svelte";
import { NODE_CATALOG, CATALOG_CATEGORY_LABELS, type CatalogCategory } from "./node_catalog";
import { categoryVisual, type CategoryIcon } from "./node_visuals";

/** Union of catalog categories and special palette groups. */
export type PaletteCategory =
  | CatalogCategory
  | "anchor"
  | "function"
  | "native"
  | "mcp";

/** Position on the visual canvas. */
export interface FlowPosition {
  x: number;
  y: number;
}

/** The action payload when a palette item is dragged or clicked. */
export type PaletteAction =
  | { type: "anchor"; label: string }
  | { type: "assemblyFn"; fnName: string }
  | { type: "nativeFn"; fnName: string }
  | { type: "control"; kind: "branch" | "iterator" }
  | { type: "literal"; valueType: string }
  | { type: "catalog"; kind: string }
  | { type: "importManifest" }
  | { type: "proxy"; connection: McpConnection; tool: McpToolSchema };

/** A single spawnable item in the palette. */
export interface PaletteItem {
  id: string;
  category: PaletteCategory;
  label: string;
  description: string;
  action: PaletteAction;
}

/** Human-readable labels for palette sections. */
export const PALETTE_CATEGORY_LABELS: Record<string, string> = {
  ...CATALOG_CATEGORY_LABELS,
  anchor: "Anchors",
  function: "Script Functions",
  native: "Native API",
  mcp: "MCP Proxy",
};

/** Input dependencies for building the palette. */
export interface BuildPaletteInput {
  unboundFunctions: string[];
  nativeFunctions: SchemaFunction[];
  proxyTools: { conn: McpConnection; tool: McpToolSchema }[];
}

/** Builds the full palette from live editor sources. */
export function buildPaletteItems(input: BuildPaletteInput): PaletteItem[] {
  const items: PaletteItem[] = [];

  items.push({
    id: "anchor:new",
    category: "anchor",
    label: "Blank Anchor",
    description: "Insert a new Rhai node anchor at the cursor",
    action: { type: "anchor", label: `node_${Date.now()}` },
  });

  items.push({
    id: "event:import",
    category: "event",
    label: "Import public functions",
    description: "Spawn Event node + exec chain from Rhai manifest",
    action: { type: "importManifest" },
  });

  for (const fnName of input.unboundFunctions) {
    items.push({
      id: `fn:${fnName}`,
      category: "function",
      label: fnName,
      description: `Manifest function ${fnName}()`,
      action: { type: "assemblyFn", fnName },
    });
  }

  for (const fn of input.nativeFunctions) {
    items.push({
      id: `native:${fn.name}`,
      category: "native",
      label: fn.name,
      description: fn.description || fn.signature,
      action: { type: "nativeFn", fnName: fn.name },
    });
  }

  items.push(
    {
      id: "control:branch",
      category: "control",
      label: "Branch",
      description: "Route exec by boolean condition",
      action: { type: "catalog", kind: "branch" },
    },
    {
      id: "control:iterator",
      category: "flow",
      label: "Iterator",
      description: "Legacy array fan-out (data-gated)",
      action: { type: "control", kind: "iterator" },
    }
  );

  for (const def of NODE_CATALOG) {
    if (["branch", "iterator", "literal", "comment"].includes(def.kind)) continue;
    items.push({
      id: `catalog:${def.kind}`,
      category: def.category,
      label: def.title,
      description: def.description,
      action: { type: "catalog", kind: def.kind },
    });
  }

  for (const valueType of ["string", "int", "float", "bool", "json"] as const) {
    items.push({
      id: `literal:${valueType}`,
      category: "literal",
      label: `Literal (${valueType})`,
      description: `Constant ${valueType} source node`,
      action: { type: "literal", valueType },
    });
  }

  for (const { conn, tool } of input.proxyTools) {
    items.push({
      id: `mcp:${conn.id}:${tool.name}`,
      category: "mcp",
      label: `${conn.id}: ${tool.name}`,
      description: tool.description || `MCP tool on ${conn.label || conn.id}`,
      action: { type: "proxy", connection: conn, tool },
    });
  }

  return items;
}

/** Case-insensitive filter across label and description. */
export function filterPaletteItems(items: PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      PALETTE_CATEGORY_LABELS[item.category].toLowerCase().includes(q)
  );
}

/**
 * Logical category order (most-used groups first) used by both the palette panel
 * and the context menu. Nodes are alphabetized *within* each category below, so
 * this array only governs the order the section headers appear in.
 */
export const PALETTE_CATEGORY_ORDER: PaletteCategory[] = [
  "event",
  "anchor",
  "function",
  "native",
  "control",
  "flow",
  "variable",
  "operator",
  "literal",
  "data",
  "error",
  "escape",
  "machine-learning",
  "science",
  "mcp",
];

/** A rendered palette section: its category, label, visual identity, and items. */
export interface PaletteGroup {
  category: PaletteCategory;
  label: string;
  /** `var(--cat-*)` token for the section swatch (node_visuals SSOT). */
  colorToken: string;
  /** Lucide icon component for the section header (node_visuals SSOT). */
  icon: CategoryIcon;
  items: PaletteItem[];
}

/**
 * Groups filtered items by category for panel/menu rendering. Sections follow
 * the logical {@link PALETTE_CATEGORY_ORDER}; items within each section are
 * sorted alphabetically (case-insensitive) by label for predictable scanning.
 */
export function groupPaletteItems(items: PaletteItem[]): PaletteGroup[] {
  const grouped = new Map<PaletteCategory, PaletteItem[]>();
  for (const item of items) {
    const list = grouped.get(item.category) ?? [];
    list.push(item);
    grouped.set(item.category, list);
  }
  return PALETTE_CATEGORY_ORDER.filter((c) => grouped.has(c)).map((category) => {
    const visual = categoryVisual(category);
    return {
      category,
      label: PALETTE_CATEGORY_LABELS[category],
      colorToken: visual.colorToken,
      icon: visual.icon,
      items: grouped
        .get(category)!
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
    };
  });
}
