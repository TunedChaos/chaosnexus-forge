// chaosnexus-forge/src/lib/dual_editor/edge_visuals.ts
//
// SSOT for canvas edge stroke tokens: width, color (matched to source pin role),
// and dash pattern. Consumed by DualEditor, parser, and edge Svelte components.

import { catalogByKind } from "./node_catalog";
import { categoryVisual } from "./node_visuals";
import { pinRoleFromDataType } from "./pin_roles";
import { getCyclicEdges } from "$lib/cycle_detector";
import type { Node, Edge } from "@xyflow/svelte";
import type { CanvasPinDescriptor } from "$lib/dual_editor/canvas_schema";

/** Stroke width for execution flow edges. */
export const EDGE_WIDTH_EXEC = 3;
/** Stroke width for data flow edges. */
export const EDGE_WIDTH_DATA = 3;
/** Stroke width for cyclic/error flow edges, slightly thicker for visibility. */
export const EDGE_WIDTH_CYCLIC = 3.5;

/** Minimal pin shape needed to resolve a source data type (matches CanvasPinDescriptor). */
interface PinTypeLike {
  id: string;
  pinKind?: string;
  dataType?: string;
}

/**
 * Options required to determine the styling and color variables for a rendered edge.
 */
export interface EdgeStyleOptions {
  isExec: boolean;
  isCyclic?: boolean;
  sourceKind?: string;
  sourceHandle?: string;
  /**
   * Engine data type of the *specific* source pin (from the node's persisted
   * `pins` descriptors). Takes precedence over the catalog default so per-node
   * type overrides (e.g. a Script block returning an array) color their wire.
   */
  sourceDataType?: string;
}

/**
 * Resolves the data type carried by a node's source handle, honoring per-node
 * pin overrides. Returns `undefined` for exec pins or when the handle is unknown.
 *
 * @param pins The list of pin descriptors on the node.
 * @param handle The identifier of the specific handle (pin).
 * @returns The resolved data type, or undefined.
 */
export function sourceDataTypeFor(
  pins: PinTypeLike[] | undefined,
  handle: string | undefined | null
): string | undefined {
  if (!pins || !handle) return undefined;
  const pin = pins.find((p) => p.id === handle);
  if (!pin || pin.pinKind === "exec") return undefined;
  return pin.dataType;
}

/**
 * Resolves the CSS color token for an edge (source pin role, then node category).
 *
 * @param options The styling options and node metadata for the edge.
 * @returns A CSS variable reference for the edge color.
 */
export function edgeColorCssVar(options: EdgeStyleOptions): string {
  if (options.isCyclic) {
    return "var(--color-error, #ef4444)";
  }
  if (options.isExec) {
    return "var(--pin-exec)";
  }

  // Per-node pin type wins so explicit overrides (Script returns, typed natives)
  // tint the wire even when the catalog default for that handle is "generic".
  if (options.sourceDataType) {
    const role = pinRoleFromDataType(options.sourceDataType);
    if (role !== "generic") {
      return `var(--pin-${role})`;
    }
  }

  const catalog = catalogByKind(options.sourceKind ?? "");
  if (catalog) {
    const pin = catalog.pins.find((p) => p.id === options.sourceHandle);
    if (pin?.role) {
      return `var(--pin-${pin.role})`;
    }
    return categoryVisual(catalog.category).colorToken;
  }

  return "var(--pin-generic)";
}

/**
 * Inline style string using CSS custom properties (hover rules read these, not literal stroke).
 *
 * @param options The styling options and node metadata for the edge.
 * @returns A CSS style string containing stroke and color properties.
 */
export function buildEdgeStyle(options: EdgeStyleOptions): string {
  const width = options.isCyclic
    ? EDGE_WIDTH_CYCLIC
    : options.isExec
      ? EDGE_WIDTH_EXEC
      : EDGE_WIDTH_DATA;
  const color = edgeColorCssVar(options);
  const dash =
    options.isCyclic || !options.isExec ? "stroke-dasharray: 6,4;" : "";
  return `--cf-edge-color: ${color}; --cf-edge-w: ${width}px; ${dash}`;
}

/**
 * Reconciles visual styling (colors, dash array, cyclic warnings) for edges.
 * Position-only node moves do NOT rebuild edge objects - obstacles come from
 * `publishObstacleSnapshot`, not `data.nodes`.
 *
 * @param edges The edges currently rendered in the canvas.
 * @param nodes The nodes currently rendered in the canvas (for pin/kind lookup).
 * @returns An updated array of edges with synchronized styles, or the original if unchanged.
 */
export function reconcileVisualEdges(edges: Edge[], nodes: Node[]): Edge[] {
  let changed = false;
  const cyclicEdgeIds = getCyclicEdges(edges);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const mappedEdges = edges.map((e) => {
    const isExec = e.type === "execEdge";
    const isCyclic = !isExec && cyclicEdgeIds.has(e.id);
    const sourceNode = nodeById.get(e.source);
    const sourceData = sourceNode?.data as
      | { kind?: string; pins?: CanvasPinDescriptor[] }
      | undefined;
    const sourceKind = sourceData?.kind;
    const nextStyle = buildEdgeStyle({
      isExec,
      isCyclic,
      sourceKind,
      sourceHandle: e.sourceHandle ?? undefined,
      sourceDataType: sourceDataTypeFor(sourceData?.pins, e.sourceHandle),
    });
    const nextType = isExec ? "execEdge" : "tacticalEdge";
    const hadStampedNodes = e.data != null && "nodes" in (e.data as object);

    const needsUpdate =
      e.data?.isCyclic !== isCyclic ||
      e.style !== nextStyle ||
      e.type !== nextType ||
      e.animated !== false ||
      hadStampedNodes;

    if (!needsUpdate) return e;

    changed = true;
    const prevData = { ...(e.data as Record<string, unknown> | undefined) };
    delete prevData.nodes;
    return {
      ...e,
      type: nextType,
      animated: false,
      class: "cf-edge",
      style: nextStyle,
      data: { ...prevData, isCyclic, kind: isExec ? "exec" : "data" },
    };
  });

  return changed ? mappedEdges : edges;
}
