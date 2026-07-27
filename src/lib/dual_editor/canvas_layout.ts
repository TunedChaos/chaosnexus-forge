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

  // Check if nodes already have valid non-staircased preplaced coordinates
  const hasPreplacedCoordinates =
    leafNodes.length > 0 &&
    leafNodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y) && (n.x !== 0 || n.y !== 0)) &&
    !isStaircasedLayout(doc);

  if (hasPreplacedCoordinates) {
    const finalNodes = finalizeLayout(doc.nodes);
    return {
      ...doc,
      nodes: finalNodes,
    };
  }

  const edges = doc.edges || [];

  // Build adjacency maps for execution flow (ignoring data wires for layout tree structure)
  const targetMap = new Map<string, string[]>();
  const execInDegree = new Map<string, number>();

  for (const node of leafNodes) {
    execInDegree.set(node.id, 0);
    targetMap.set(node.id, []);
  }

  for (const edge of edges) {
    if (edge.kind === "data") continue; // Only trace execution flow for function lanes
    if (execInDegree.has(edge.target)) {
      execInDegree.set(edge.target, (execInDegree.get(edge.target) || 0) + 1);
    }
    if (targetMap.has(edge.source)) {
      targetMap.get(edge.source)!.push(edge.target);
    }
  }

  // Root nodes start new horizontal function lanes
  const eventRoots = leafNodes.filter((n) => n.kind === "event");
  const otherRoots = leafNodes.filter((n) => n.kind !== "event" && execInDegree.get(n.id) === 0);
  const orderedRoots = [...eventRoots, ...otherRoots];

  const visited = new Set<string>();
  const positionedNodes: CanvasNodeRecord[] = [];
  let nextAvailableRow = 0;

  function layoutTree(nodeId: string, depthCol: number, startRow: number): number {
    if (visited.has(nodeId)) return startRow;
    visited.add(nodeId);

    const node = leafNodes.find((n) => n.id === nodeId);
    let maxRowUsed = startRow;

    if (node) {
      positionedNodes.push({
        ...node,
        x: col(depthCol),
        y: row(startRow),
        parentId: node.parentId ?? "main_group",
      });
    }

    const nextTargets = (targetMap.get(nodeId) || []).filter((t: string) => !visited.has(t));
    if (nextTargets.length === 0) {
      return startRow;
    }

    let childStartRow = startRow;
    for (let i = 0; i < nextTargets.length; i++) {
      const childMaxRow = layoutTree(nextTargets[i], depthCol + 1, childStartRow);
      maxRowUsed = Math.max(maxRowUsed, childMaxRow);
      childStartRow = maxRowUsed + 1;
    }

    return maxRowUsed;
  }

  // Separate roots into execution chains vs standalone function nodes
  const chainRoots = orderedRoots.filter((r) => (targetMap.get(r.id) || []).length > 0);
  const standaloneRoots = orderedRoots.filter((r) => (targetMap.get(r.id) || []).length === 0);

  // 1. Layout execution chains
  for (const root of chainRoots) {
    if (visited.has(root.id)) continue;
    const maxRow = layoutTree(root.id, 0, nextAvailableRow);
    nextAvailableRow = maxRow + 1;
  }

  // 2. Layout standalone functions in a balanced multi-column grid
  const unvisitedStandalone = standaloneRoots.filter((r) => !visited.has(r.id));
  const sCount = unvisitedStandalone.length;
  const numCols = sCount <= 3 ? 1 : sCount <= 8 ? 2 : 3;

  for (let i = 0; i < sCount; i++) {
    const root = unvisitedStandalone[i];
    visited.add(root.id);

    const colIdx = i % numCols;
    const rowIdx = nextAvailableRow + Math.floor(i / numCols);

    positionedNodes.push({
      ...root,
      x: col(colIdx),
      y: row(rowIdx),
      parentId: root.parentId ?? "main_group",
    });
  }

  if (sCount > 0) {
    nextAvailableRow += Math.ceil(sCount / numCols);
  }

  // Position any remaining unvisited nodes (orphan data nodes or cyclic loops)
  let orphanIndex = 0;
  for (const node of leafNodes) {
    if (!visited.has(node.id)) {
      visited.add(node.id);
      const gridCol = orphanIndex % 4;
      const gridRow = nextAvailableRow + Math.floor(orphanIndex / 4);
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
