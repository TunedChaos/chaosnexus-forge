// chaosnexus-forge/src/lib/parser.ts

import type { Node, Edge } from "@xyflow/svelte";
import type { NodeDef } from "./types";
import { formatGroupStyle, parseGroupSize } from "./dual_editor/group_geometry";
import {
  CANVAS_SCHEMA_VERSION,
  type CanvasDocumentV3,
  type CanvasEdgeRecord,
  type CanvasNodeRecord,
  type CanvasPinDescriptor,
  resolveWireKind,
} from "./dual_editor/canvas_schema";
import { catalogByKind, catalogPinsToDescriptors } from "./dual_editor/node_catalog";
import { buildEdgeStyle, sourceDataTypeFor } from "./dual_editor/edge_visuals";

/** Re-export v3 canvas document shape (sidecar SSOT). */
export type CanvasMetadata = CanvasDocumentV3;
export { CANVAS_SCHEMA_VERSION };

/** Plugin entry lifecycle anchor (mirrors UE Event BeginPlay). */
export const PLUGIN_ENTRY_ANCHOR = "on_plugin_start";

/**
 * Canvas stacking bands. The "Main Logic" group is always pinned to the very
 * back, other groups float just above it, and leaf nodes sit on top of every
 * group. {@link Z_NODE_BASE} leaves ample headroom so optimistic node additions
 * in the editor can compute a higher value and land on top.
 */
/** Z-index for the main logic group, pinned to the back. */
export const Z_MAIN_GROUP = 0;
/** Z-index for floating child groups. */
export const Z_GROUP = 1;
/** Base Z-index for leaf nodes so they sit on top of groups. */
export const Z_NODE_BASE = 1000;

/**
 * Sidecar canvas schema (v3 Vhai logic flow).
 *
 * v3 is additive over v2: edges gain optional `kind` ("exec" | "data"), nodes
 * gain expanded `kind` taxonomy, optional `pins`, and escape-hatch fields
 * (`scriptBody`, `operatorId`, `varName`, `eventId`). v1/v2 files load unchanged.
 */

const EMBEDDED_META_REGEX = /\/\/\s*---\s*\[CANVAS_METADATA:\s*(.*?)\s*\]\s*---/s;
const EMBEDDED_REGION_REGEX = /\/\/\s*#region\s+CANVAS_METADATA[\s\S]*?\/\/\s*#endregion\s*/g;
const EMBEDDED_LINE_REGEX = /\/\/\s*---\s*\[CANVAS_METADATA:\s*[\s\S]*?\]\s*---\s*/g;

/** 
 * Extracts legacy embedded canvas JSON from a Rhai buffer (migration path). 
 *
 * @param code - The Rhai script text containing a metadata block.
 * @returns The parsed CanvasMetadata, or null if not found or invalid.
 */
export function extractEmbeddedCanvasMetadata(code: string): CanvasMetadata | null {
  code = code || "";
  const regionMatch = code.match(EMBEDDED_META_REGEX);
  if (!regionMatch?.[1]) return null;
  try {
    return JSON.parse(regionMatch[1].trim()) as CanvasMetadata;
  } catch (e) {
    console.error("Failed to parse embedded canvas metadata:", e);
    return null;
  }
}

/** 
 * Removes legacy CANVAS_METADATA blocks from Rhai source. 
 *
 * @param code - The raw Rhai source code string.
 * @returns The code with all canvas metadata regions stripped.
 */
export function stripCanvasMetadata(code: string): string {
  code = code || "";
  return code.replace(EMBEDDED_REGION_REGEX, "").replace(EMBEDDED_LINE_REGEX, "").trimEnd();
}

function resolveCanvasMetadata(
  code: string,
  externalMetadata?: CanvasMetadata | null
): CanvasMetadata {
  if (externalMetadata) return externalMetadata;
  return extractEmbeddedCanvasMetadata(code) ?? { nodes: [], edges: [] };
}

/**
 * Parses Rhai script text to extract active node anchors and reconstructs
 * Svelte Flow nodes and edges using sidecar or legacy embedded canvas metadata.
 *
 * @param code - The Rhai script source code.
 * @param nodeRegistry - The list of available UI node definitions (optional).
 * @param externalMetadata - External v3 metadata loaded from a `.canvas.json` sidecar.
 * @returns An object containing the corresponding Svelte Flow `nodes` and `edges`.
 */
export function parseRhaiToFlow(
  code: string,
  nodeRegistry: NodeDef[] = [],
  externalMetadata?: CanvasMetadata | null
): { nodes: Node[]; edges: Edge[] } {
  code = code || "";
  const nodeRegex = /\/\/\s*---\s*\[NODE:\s*(.*?)\s*\]\s*---/g;
  const activeLabels: string[] = [];
  let match;
  while ((match = nodeRegex.exec(code)) !== null) {
    if (match[1]) {
      activeLabels.push(match[1].trim());
    }
  }

  const metadata = resolveCanvasMetadata(code, externalMetadata);
  const finalNodes: Node[] = [];
  const activeNodeIds = new Set<string>();

  let hasMainGroup = false;
  if (metadata.nodes?.length) {
    metadata.nodes.forEach((n) => {
      if (n.type === "group") {
        if (n.id === "main_group") hasMainGroup = true;
        activeNodeIds.add(n.id);
        const sanitizedSize = parseGroupSize(n.style || "width: 800px; height: 600px;");
        const sanitizedStyle = formatGroupStyle(sanitizedSize);
        finalNodes.push({
          id: n.id,
          type: "group",
          data: {
            label: n.label || "",
            // Honor a persisted manual size so a user's resize survives reload.
            // Absent on legacy/corrupted sidecars, which therefore re-fit snugly
            // (this is what heals the runaway-inflated groups on next load).
            manualWidth: n.manualWidth,
            manualHeight: n.manualHeight,
          },
          position: { x: n.x, y: n.y },
          parentId: n.parentId,
          // Mirror size into width/height: Svelte Flow's NodeWrapper applies these
          // after `style`, so they must agree (and feed accurate drag hit-testing).
          width: sanitizedSize.width,
          height: sanitizedSize.height,
          style: sanitizedStyle,
          class:
            n.class ||
            (n.id === "main_group"
              ? "main-logic-group border-2 !border-primary/80 bg-primary/5 rounded-xl shadow-lg shadow-primary/20 backdrop-blur-md"
              : "light-group"),
          // Main Logic is pinned to the very back; every other group floats above
          // it but stays below leaf nodes so child nodes remain visible.
          zIndex: n.id === "main_group" ? Z_MAIN_GROUP : Z_GROUP,
        });
      }
    });
  }

  // Only synthesize Main Logic when there are node anchors to contain.
  if (!hasMainGroup && activeLabels.length > 0) {
    hasMainGroup = true;
    activeNodeIds.add("main_group");
    finalNodes.push({
      id: "main_group",
      type: "group",
      data: { label: "Main Logic" },
      position: { x: 50, y: 50 },
      width: 800,
      height: 600,
      style: "width: 800px; height: 600px;",
      class:
        "main-logic-group border-2 !border-primary/80 bg-primary/5 rounded-xl shadow-lg shadow-primary/20 backdrop-blur-md",
      zIndex: Z_MAIN_GROUP,
    });
  }

  const defaultParentId = hasMainGroup ? "main_group" : undefined;

  // Illustrative sidecars already contain the full wired graph; Rhai `[NODE:]`
  // anchors must not spawn duplicate Function nodes on top of catalog nodes.
  if (!metadata.displayOnly) activeLabels.forEach((label, index) => {
    const metaNode = metadata.nodes?.find((n) => n.label === label);

    let id = `node_${index + 1}`;
    let x = 100;
    let y = 100 + index * 100;
    let parentId: string | undefined = defaultParentId;

    if (metaNode) {
      id = metaNode.id;
      x = metaNode.x;
      y = metaNode.y;
      // Honor the saved parent exactly. An explicitly absent parent means the
      // node lives at the root, which MUST round-trip: otherwise a node dragged
      // out of every group snaps back into Main on the next parse (the cause of
      // the "drag-out doesn't stick" oddity). Only brand-new anchors that have
      // no sidecar entry fall back to defaultParentId.
      parentId = metaNode.parentId;
    }

    let type = "codeNativeNode";
    let nodeDef: NodeDef | undefined = undefined;

    if (
      metaNode?.type &&
      metaNode.type !== "default" &&
      metaNode.type !== "rhaiNode" &&
      metaNode.type !== "codeNativeNode"
    ) {
      nodeDef = nodeRegistry.find((d) => d.type_id === metaNode.type);
      if (nodeDef) {
        type = metaNode.type;
      }
    } else {
      const blockCode = getNodeCode(code, label);
      for (const def of nodeRegistry) {
        const baseFunc = def.template.split("(")[0].replace("let {{results}} =", "").trim();
        if (blockCode.includes(baseFunc) && blockCode.split("\n").length <= 3) {
          type = def.type_id;
          nodeDef = def;
          break;
        }
      }
    }

    activeNodeIds.add(id);
    finalNodes.push({
      id,
      type: type === "codeNativeNode" ? "codeNativeNode" : "rhaiNode",
      data: {
        label,
        def: nodeDef,
        nodeType: type,
        isEntryAnchor: label === PLUGIN_ENTRY_ANCHOR,
        // v2 assembly-line bindings; default `fn` to the anchor label so
        // existing single-block nodes already reference a callable function.
        fn: metaNode?.fn ?? label,
        kind: metaNode?.kind,
      },
      position: { x, y },
      parentId,
      style: metaNode?.style || undefined,
      class: metaNode?.class || undefined,
      // Leaf nodes sit above all groups; ordering by code position means freshly
      // appended anchors receive the highest z-index and land on top.
      zIndex: Z_NODE_BASE + index,
    });
  });

  // v3: canvas-only catalog nodes (no Rhai `[NODE:]` anchor) still restore wires.
  metadata.nodes?.forEach((metaNode) => {
    if (metaNode.id && metaNode.kind) activeNodeIds.add(metaNode.id);
  });

  const nodeKindById = new Map(
    (metadata.nodes ?? []).map((n) => [n.id, n.kind ?? "function"] as const)
  );

  // Per-node pin descriptors (explicit overrides, else catalog defaults) so data
  // wires inherit the color of their *specific* source pin's type (DRY with the
  // VhaiNode pin resolution).
  const nodePinsById = new Map(
    (metadata.nodes ?? []).map((n) => {
      const catalog = catalogByKind(n.kind ?? "");
      return [n.id, n.pins ?? (catalog ? catalogPinsToDescriptors(catalog.pins) : [])] as const;
    })
  );

  const finalEdges: Edge[] = [];
  metadata.edges?.forEach((edge) => {
    if (activeNodeIds.has(edge.source) && activeNodeIds.has(edge.target)) {
      const isExec = resolveWireKind(edge) === "exec";
      finalEdges.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? undefined,
        targetHandle: edge.targetHandle ?? undefined,
        label: edge.label,
        type: isExec ? "execEdge" : "tacticalEdge",
        animated: !isExec,
        class: "cf-edge",
        style: buildEdgeStyle({
          isExec,
          sourceKind: nodeKindById.get(edge.source),
          sourceHandle: edge.sourceHandle ?? undefined,
          sourceDataType: sourceDataTypeFor(
            nodePinsById.get(edge.source),
            edge.sourceHandle
          ),
        }),
      });
    }
  });

  return { nodes: finalNodes, edges: finalEdges };
}

/** 
 * Builds sidecar canvas metadata (v3) from the current Svelte Flow graph. 
 *
 * @param nodes - The current flow nodes.
 * @param edges - The current flow edges.
 * @param options - Additional options, like `displayOnly`.
 * @returns A v3 CanvasMetadata document.
 */
export function buildCanvasMetadata(
  nodes: Node[],
  edges: Edge[],
  options?: { displayOnly?: boolean }
): CanvasMetadata {
  return {
    version: CANVAS_SCHEMA_VERSION,
    displayOnly: options?.displayOnly,
    nodes: nodes.map((n) => {
      const data = n.data as {
        label?: string;
        nodeType?: string;
        fn?: string;
        kind?: string;
        value?: unknown;
        valueType?: string;
        manualWidth?: number;
        manualHeight?: number;
        scriptBody?: string;
        operatorId?: string;
        varName?: string;
        eventId?: string;
        pins?: CanvasPinDescriptor[];
      };
      const kind = typeof data.kind === "string" ? data.kind : undefined;
      const catalog = kind ? catalogByKind(kind) : undefined;
      const record: CanvasNodeRecord = {
        id: n.id,
        label: data.label || "",
        x: Math.round(n.position.x),
        y: Math.round(n.position.y),
        type:
          n.type === "group"
            ? "group"
            : (data.nodeType as string) ||
              (n.type === "codeNativeNode" ? "codeNativeNode" : "rhaiNode"),
        parentId: n.parentId,
        style: typeof n.style === "string" ? n.style : undefined,
        class: typeof n.class === "string" ? n.class : undefined,
        manualWidth: n.type === "group" && typeof data.manualWidth === "number" ? data.manualWidth : undefined,
        manualHeight:
          n.type === "group" && typeof data.manualHeight === "number" ? data.manualHeight : undefined,
        fn: typeof data.fn === "string" ? data.fn : undefined,
        kind,
        value: data.kind === "literal" ? data.value : undefined,
        valueType:
          data.kind === "literal" && typeof data.valueType === "string"
            ? data.valueType
            : undefined,
        pins:
          data.pins ?? (catalog ? catalogPinsToDescriptors(catalog.pins) : undefined),
        scriptBody: typeof data.scriptBody === "string" ? data.scriptBody : undefined,
        operatorId: typeof data.operatorId === "string" ? data.operatorId : undefined,
        varName: typeof data.varName === "string" ? data.varName : undefined,
        eventId: typeof data.eventId === "string" ? data.eventId : undefined,
      };
      return record;
    }),
    edges: edges.map((e) => {
      const edgeRecord: CanvasEdgeRecord = {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label ? String(e.label) : undefined,
        sourceHandle: e.sourceHandle ?? undefined,
        targetHandle: e.targetHandle ?? undefined,
        kind: e.type === "execEdge" ? "exec" : "data",
      };
      return edgeRecord;
    }),
  };
}

/**
 * @deprecated Canvas layout is stored in `.chaosnexus-forge/*.canvas.json` sidecars.
 * Use `buildCanvasMetadata` and `stripCanvasMetadata` instead.
 *
 * @param code - The Rhai source text.
 * @param nodes - Flow nodes.
 * @param edges - Flow edges.
 * @returns Stripped code.
 */
export function serializeFlowToRhai(code: string, nodes: Node[], edges: Edge[]): string {
  void buildCanvasMetadata(nodes, edges);
  return stripCanvasMetadata(code);
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findNodeEndIndex(restOfCode: string): number {
  const nextNodeRegex = /\/\/\s*---\s*\[NODE:[\s\S]*?\]\s*---/;
  const metadataRegionRegex = /(\/\/\s*#region\s+CANVAS_METADATA|\/\/\s*---\s*\[CANVAS_METADATA:)/;

  const nextNodeMatch = restOfCode.match(nextNodeRegex);
  const metaMatch = restOfCode.match(metadataRegionRegex);

  let endIdx = restOfCode.length;

  if (nextNodeMatch?.index !== undefined) {
    endIdx = Math.min(endIdx, nextNodeMatch.index);
  }
  if (metaMatch?.index !== undefined) {
    endIdx = Math.min(endIdx, metaMatch.index);
  }

  return endIdx;
}

/**
 * Retrieves the discrete Rhai logic block code segment for a specific node label.
 *
 * @param code - The Rhai source code.
 * @param label - The target node label to look for.
 * @returns The Rhai code associated with the specified node label.
 */
export function getNodeCode(code: string, label: string): string {
  code = code || "";
  const escapedLabel = escapeRegExp(label);
  const anchorRegex = new RegExp(String.raw`//\s*---\s*\[NODE:\s*${escapedLabel}\s*\]\s*---`);
  const match = code.match(anchorRegex);
  if (!match || match.index === undefined) return "";

  const startIdx = match.index + match[0].length;
  const restOfCode = code.slice(startIdx);

  const endIdx = findNodeEndIndex(restOfCode);

  return restOfCode.slice(0, endIdx).trim();
}

/**
 * Replaces the discrete Rhai logic block code segment for a specific node label.
 *
 * @param code - The Rhai source code.
 * @param label - The target node label whose code will be updated.
 * @param newNodeCode - The new Rhai code to substitute.
 * @returns The complete script string with the node's block replaced.
 */
export function updateNodeCode(code: string, label: string, newNodeCode: string): string {
  code = code || "";
  const escapedLabel = escapeRegExp(label);
  const anchorRegex = new RegExp(String.raw`//\s*---\s*\[NODE:\s*${escapedLabel}\s*\]\s*---`);
  const match = code.match(anchorRegex);
  if (!match || match.index === undefined) return code;

  const startIdx = match.index + match[0].length;
  const restOfCode = code.slice(startIdx);

  const endIdx = findNodeEndIndex(restOfCode);

  const updatedNodeSegment = `\n${newNodeCode.trim() ? newNodeCode.trim() + "\n" : ""}`;
  return code.slice(0, startIdx) + updatedNodeSegment + restOfCode.slice(endIdx);
}

/**
 * Removes a node anchor and its associated Rhai block from the script.
 * Returns the original code when the anchor is not found.
 *
 * @param code - The full Rhai script source.
 * @param label - The node anchor label to delete.
 * @returns The script with the targeted block removed.
 */
export function removeNodeAnchor(code: string, label: string): string {
  code = code || "";
  const escapedLabel = escapeRegExp(label);
  const anchorRegex = new RegExp(
    String.raw`\n?//\s*---\s*\[NODE:\s*${escapedLabel}\s*\]\s*---`
  );
  const match = code.match(anchorRegex);
  if (!match || match.index === undefined) return code;

  const startIdx = match.index;
  const restOfCode = code.slice(startIdx + match[0].length);

  const endIdx = findNodeEndIndex(restOfCode);

  const before = code.slice(0, startIdx).trimEnd();
  const after = restOfCode.slice(endIdx).trimStart();
  if (!before) return after;
  if (!after) return before + "\n";
  return `${before}\n\n${after}`;
}
