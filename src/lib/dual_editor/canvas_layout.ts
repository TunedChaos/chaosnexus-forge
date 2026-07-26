// chaosnexus-forge/src/lib/dual_editor/canvas_layout.ts
//
// Merges AST-parsed visual canvas documents with existing canvas layouts.
// Preserves user-dragged node coordinates while auto-positioning new nodes cleanly.

import type { CanvasDocumentV3, CanvasEdgeRecord, CanvasNodeRecord } from "./canvas_schema";
import { col, finalizeLayout, GAP_X, NODE_W, row } from "./illustrative_layout";

/**
 * Runs full automatic layout for a freshly generated canvas document (e.g. on initial load without a sidecar).
 * Assigns clean grid coordinates to unpositioned nodes, de-overlaps siblings, and fits group bounds.
 */
export function finalizeCanvasDocumentLayout(doc: CanvasDocumentV3): CanvasDocumentV3 {
  if (!doc.nodes || doc.nodes.length === 0) return doc;

  let leafIndex = 0;
  const nodes = doc.nodes.map((n) => {
    if (n.type === "group") {
      return {
        ...n,
        x: Number.isFinite(n.x) ? n.x : 50,
        y: Number.isFinite(n.y) ? n.y : 50,
      };
    }
    const x = Number.isFinite(n.x) ? n.x : col(leafIndex);
    const y = Number.isFinite(n.y) ? n.y : row(leafIndex);
    leafIndex++;
    return {
      ...n,
      x,
      y,
      parentId: n.parentId ?? "main_group",
    };
  });

  const finalNodes = finalizeLayout(nodes);
  return {
    ...doc,
    nodes: finalNodes,
  };
}

/**
 * Positions newly added nodes relative to their incoming execution sources or on the layout grid.
 */
function positionNewNodes(
  newNodes: CanvasNodeRecord[],
  existingNodes: CanvasNodeRecord[],
  edges: CanvasEdgeRecord[]
): CanvasNodeRecord[] {
  const result: CanvasNodeRecord[] = [];
  const placedMap = new Map<string, CanvasNodeRecord>();

  for (const n of existingNodes) {
    placedMap.set(n.id, n);
  }

  let unplacedGridIndex = existingNodes.filter((n) => n.type !== "group").length;

  for (const node of newNodes) {
    // Find incoming edge to anchor position relative to source node
    const incomingEdge = edges.find((e) => e.target === node.id);
    const sourceNode = incomingEdge ? placedMap.get(incomingEdge.source) : undefined;

    let x: number;
    let y: number;

    if (sourceNode && Number.isFinite(sourceNode.x) && Number.isFinite(sourceNode.y)) {
      x = sourceNode.x + NODE_W + GAP_X;
      y = sourceNode.y;
    } else {
      x = col(unplacedGridIndex);
      y = row(unplacedGridIndex);
      unplacedGridIndex++;
    }

    const placedNode: CanvasNodeRecord = {
      ...node,
      x,
      y,
      parentId: node.parentId ?? "main_group",
    };

    result.push(placedNode);
    placedMap.set(placedNode.id, placedNode);
  }

  return result;
}

/**
 * Merges a newly parsed AST canvas (from Rhai code) with an existing canvas layout.
 * Preserves user-dragged coordinates and group bounds for existing nodes, while
 * automatically positioning new nodes and de-overlapping the visual graph.
 */
export function mergeCanvasWithExistingLayout(
  newCanvas: CanvasDocumentV3,
  existingCanvas: CanvasDocumentV3 | null | undefined
): CanvasDocumentV3 {
  if (!existingCanvas || !existingCanvas.nodes || existingCanvas.nodes.length === 0) {
    return finalizeCanvasDocumentLayout(newCanvas);
  }

  const existingNodeById = new Map<string, CanvasNodeRecord>();
  const existingNodeByKey = new Map<string, CanvasNodeRecord>();

  for (const n of existingCanvas.nodes) {
    if (n.id) existingNodeById.set(n.id, n);
    const key = `${n.kind || ""}:${n.label || ""}:${n.fn || ""}`;
    existingNodeByKey.set(key, n);
  }

  const updatedNodes: CanvasNodeRecord[] = [];
  const unpositionedNodes: CanvasNodeRecord[] = [];

  for (const astNode of newCanvas.nodes) {
    let matched = existingNodeById.get(astNode.id);
    if (!matched) {
      const key = `${astNode.kind || ""}:${astNode.label || ""}:${astNode.fn || ""}`;
      matched = existingNodeByKey.get(key);
    }

    if (matched && Number.isFinite(matched.x) && Number.isFinite(matched.y)) {
      updatedNodes.push({
        ...astNode,
        x: matched.x,
        y: matched.y,
        parentId: matched.parentId ?? astNode.parentId,
        width: matched.width ?? astNode.width,
        height: matched.height ?? astNode.height,
        style: matched.style ?? astNode.style,
        manualWidth: matched.manualWidth,
        manualHeight: matched.manualHeight,
      });
    } else if (astNode.type === "group") {
      const groupX = Number.isFinite(astNode.x) ? astNode.x : (matched?.x ?? 50);
      const groupY = Number.isFinite(astNode.y) ? astNode.y : (matched?.y ?? 50);
      updatedNodes.push({
        ...astNode,
        x: groupX,
        y: groupY,
        style: matched?.style ?? astNode.style,
        manualWidth: matched?.manualWidth ?? astNode.manualWidth,
        manualHeight: matched?.manualHeight ?? astNode.manualHeight,
      });
    } else {
      unpositionedNodes.push({ ...astNode });
    }
  }

  // Preserve existing group nodes missing from AST output
  for (const exNode of existingCanvas.nodes) {
    if (exNode.type === "group" && !updatedNodes.some((n) => n.id === exNode.id)) {
      updatedNodes.push({ ...exNode });
    }
  }

  if (unpositionedNodes.length > 0) {
    const positionedNew = positionNewNodes(unpositionedNodes, updatedNodes, newCanvas.edges);
    updatedNodes.push(...positionedNew);
  }

  const finalNodes = finalizeLayout(updatedNodes);

  return {
    ...newCanvas,
    nodes: finalNodes,
  };
}
