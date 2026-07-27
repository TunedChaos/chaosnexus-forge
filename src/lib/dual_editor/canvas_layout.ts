// chaosnexus-forge/src/lib/dual_editor/canvas_layout.ts
//
// Merges AST-parsed visual canvas documents with existing canvas layouts.
// Preserves user-dragged node coordinates while auto-positioning new nodes cleanly.

import type { CanvasDocumentV3, CanvasEdgeRecord, CanvasNodeRecord } from "./canvas_schema";
import { col, finalizeLayout, GAP_X, NODE_W, row } from "./illustrative_layout";

/**
 * Detects whether a canvas sidecar document exhibits the legacy diagonal staircase layout pattern.
 */
export function isStaircasedLayout(canvas: CanvasDocumentV3 | null | undefined): boolean {
  if (!canvas || !canvas.nodes) return false;
  const leafNodes = canvas.nodes.filter((n) => n.type !== "group");
  if (leafNodes.length < 3) return false;

  let staircaseMatches = 0;
  for (let i = 0; i < leafNodes.length; i++) {
    const n = leafNodes[i];
    const expectedX = col(i);
    const expectedY = row(i);
    if (Math.abs(n.x - expectedX) < 10 && Math.abs(n.y - expectedY) < 10) {
      staircaseMatches++;
    }
  }

  return staircaseMatches / leafNodes.length >= 0.6;
}

/**
 * Runs full automatic layout for a freshly generated canvas document (e.g. on initial load without a sidecar).
 * Groups nodes into horizontal function lanes and execution chains, avoiding diagonal staircasing.
 */
export function finalizeCanvasDocumentLayout(doc: CanvasDocumentV3): CanvasDocumentV3 {
  if (!doc.nodes || doc.nodes.length === 0) return doc;

  const leafNodes = doc.nodes.filter((n) => n.type !== "group");
  const groupNodes = doc.nodes.filter((n) => n.type === "group");
  const edges = doc.edges || [];

  // Build adjacency map & in-degree map for execution flow
  const targetMap = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of leafNodes) {
    inDegree.set(node.id, 0);
    targetMap.set(node.id, []);
  }

  for (const edge of edges) {
    if (inDegree.has(edge.target)) {
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }
    if (targetMap.has(edge.source)) {
      targetMap.get(edge.source)!.push(edge.target);
    }
  }

  // Root nodes start new horizontal function lanes (event nodes first, then un-parented nodes)
  const eventRoots = leafNodes.filter((n) => n.kind === "event");
  const otherRoots = leafNodes.filter((n) => n.kind !== "event" && inDegree.get(n.id) === 0);
  const orderedRoots = [...eventRoots, ...otherRoots];

  const visited = new Set<string>();
  const positionedNodes: CanvasNodeRecord[] = [];

  let rowIndex = 0;

  for (const root of orderedRoots) {
    if (visited.has(root.id)) continue;

    let colIndex = 0;
    let curr: string | undefined = root.id;

    // Advance horizontally along row(rowIndex) across columns
    while (curr && !visited.has(curr)) {
      visited.add(curr);
      const node = leafNodes.find((n) => n.id === curr);
      if (node) {
        positionedNodes.push({
          ...node,
          x: col(colIndex),
          y: row(rowIndex),
          parentId: node.parentId ?? "main_group",
        });
        colIndex++;
      }

      const nextTargets: string[] = (targetMap.get(curr) || []).filter((t: string) => !visited.has(t));
      curr = nextTargets.length > 0 ? nextTargets[0] : undefined;
    }

    rowIndex++;
  }

  // Position any remaining unvisited nodes (loops, branches, or standalone blocks)
  let orphanIndex = 0;
  for (const node of leafNodes) {
    if (!visited.has(node.id)) {
      visited.add(node.id);
      const gridCol = orphanIndex % 4;
      const gridRow = rowIndex + Math.floor(orphanIndex / 4);
      positionedNodes.push({
        ...node,
        x: col(gridCol),
        y: row(gridRow),
        parentId: node.parentId ?? "main_group",
      });
      orphanIndex++;
    }
  }

  const allNodes = [...groupNodes, ...positionedNodes];
  const finalNodes = finalizeLayout(allNodes);

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
      const gridCol = unplacedGridIndex % 4;
      const gridRow = Math.floor(unplacedGridIndex / 4);
      x = col(gridCol);
      y = row(gridRow);
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
  if (
    !existingCanvas ||
    !existingCanvas.nodes ||
    existingCanvas.nodes.length === 0 ||
    isStaircasedLayout(existingCanvas)
  ) {
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
