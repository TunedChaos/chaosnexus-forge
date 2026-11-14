/**
 * chaosnexus-forge/src/lib/dual_editor/node_visuals.ts
 *
 * Single source of truth for per-category node visual identity: a CSS color
 * token (mirrors the `--pin-*` pattern in app.css) plus a lucide icon. Both the
 * palette (section swatch) and the canvas (node title bar) read from here so the
 * color/icon for a category can never drift between the two surfaces (DRY).
 */

import type { Component } from "svelte";
import IconZap from "~icons/lucide/zap";
import IconBraces from "~icons/lucide/braces";
import IconCpu from "~icons/lucide/cpu";
import IconBrainCircuit from "~icons/lucide/brain-circuit";
import IconFlaskConical from "~icons/lucide/flask-conical";
import IconGitBranch from "~icons/lucide/git-branch";
import IconRepeat from "~icons/lucide/repeat";
import IconVariable from "~icons/lucide/variable";
import IconCalculator from "~icons/lucide/calculator";
import IconType from "~icons/lucide/type";
import IconBrackets from "~icons/lucide/brackets";
import IconTriangleAlert from "~icons/lucide/triangle-alert";
import IconCode from "~icons/lucide/code";
import IconPlug from "~icons/lucide/plug";
import IconAnchor from "~icons/lucide/anchor";
import type { CatalogCategory } from "./node_catalog";
import { CATALOG_CATEGORY_LABELS } from "./node_catalog";

/** Icon component type produced by `unplugin-icons` (a Svelte component). */
export type CategoryIcon = Component;

/**
 * Category -> `var(--cat-*)` color token. The token (not a literal hex) lets the
 * monochromacy themes collapse every category to the accent in one place.
 */
export const CATEGORY_COLOR_TOKEN: Record<CatalogCategory, string> = {
  event: "var(--cat-event)",
  function: "var(--cat-function)",
  native: "var(--cat-native)",
  control: "var(--cat-control)",
  flow: "var(--cat-flow)",
  variable: "var(--cat-variable)",
  operator: "var(--cat-operator)",
  literal: "var(--cat-literal)",
  data: "var(--cat-data)",
  error: "var(--cat-error)",
  escape: "var(--cat-escape)",
  "machine-learning": "var(--cat-machine-learning)",
  science: "var(--cat-science)",
  mcp: "var(--cat-mcp)",
  anchor: "var(--cat-anchor)",
};

/** Category -> lucide icon component (the non-color type channel, WCAG 1.4.1). */
export const CATEGORY_ICON: Record<CatalogCategory, CategoryIcon> = {
  event: IconZap,
  function: IconBraces,
  native: IconCpu,
  control: IconGitBranch,
  flow: IconRepeat,
  variable: IconVariable,
  operator: IconCalculator,
  literal: IconType,
  data: IconBrackets,
  error: IconTriangleAlert,
  escape: IconCode,
  "machine-learning": IconBrainCircuit,
  science: IconFlaskConical,
  mcp: IconPlug,
  anchor: IconAnchor,
};

/** Resolved visual identity for a category: color token, icon, display label. */
export interface CategoryVisual {
  colorToken: string;
  icon: CategoryIcon;
  label: string;
}

/** Returns the visual identity for a category (anchor fallback for unknowns). */
export function categoryVisual(category: CatalogCategory | string): CategoryVisual {
  const key = (category in CATEGORY_COLOR_TOKEN ? category : "anchor") as CatalogCategory;
  return {
    colorToken: CATEGORY_COLOR_TOKEN[key],
    icon: CATEGORY_ICON[key],
    label: CATALOG_CATEGORY_LABELS[key],
  };
}
