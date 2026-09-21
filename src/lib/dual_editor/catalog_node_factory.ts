/**
 * @file catalog_node_factory.ts
 *
 * Spawns Svelte Flow nodes from the declarative node catalog SSOT.
 */

import type { Node } from "@xyflow/svelte";
import {
  NODE_CATALOG,
  catalogByKind,
  catalogPinsToDescriptors,
  type CatalogNodeDef,
} from "./node_catalog";

/** Creates a canvas node from a catalog definition at the given flow position. */
export function createCatalogNode(
  def: CatalogNodeDef,
  position: { x: number; y: number },
  parentId?: string,
  overrides?: Record<string, unknown>
): Node {
  const id = `${def.kind}_${Date.now()}`;
  const defaults = def.defaults ?? {};
  return {
    id,
    type: def.flowType,
    data: {
      label: def.title,
      kind: def.kind,
      nodeType: def.flowType,
      fn: "",
      stale: false,
      pins: catalogPinsToDescriptors(def.pins),
      ...defaults,
      ...overrides,
    },
    position,
    parentId,
  };
}

/** Creates a node by catalog kind string (palette dispatch). */
export function createCatalogNodeByKind(
  kind: string,
  position: { x: number; y: number },
  parentId?: string,
  overrides?: Record<string, unknown>
): Node | null {
  const def = catalogByKind(kind);
  if (!def) return null;
  return createCatalogNode(def, position, parentId, overrides);
}

/** All Svelte Flow type ids registered for catalog nodes. */
export function catalogFlowTypes(): string[] {
  return NODE_CATALOG.map((d) => d.flowType);
}
