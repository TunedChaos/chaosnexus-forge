// chaosnexus-forge/src/lib/cycle_detector.ts

import type { Edge } from "@xyflow/svelte";

/**
 * Checks if adding a directed edge from source to target would create a cycle.
 * This checks if there is already a directed path from target to source.
 */
export function wouldCreateCycle(source: string, target: string, edges: Edge[]): boolean {
  if (source === target) return true; // Self-loops are always cycles

  const visited = new Set<string>();
  const queue = [target];
  visited.add(target);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === source) {
      return true;
    }

    // Traverse all outgoing edges from the current node
    for (const edge of edges) {
      if (edge.source === current) {
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push(edge.target);
        }
      }
    }
  }

  return false;
}

/**
 * Scans the entire graph and returns a set of edge IDs that are part of a cycle.
 * An edge (u, v) is cyclic if there is a path from v back to u.
 */
export function getCyclicEdges(edges: Edge[]): Set<string> {
  const cyclicEdgeIds = new Set<string>();

  for (const edge of edges) {
    // If there's a path from target back to source, this edge is part of a cycle.
    if (
      wouldCreateCycle(
        edge.source,
        edge.target,
        edges.filter((e) => e.id !== edge.id)
      )
    ) {
      cyclicEdgeIds.add(edge.id);
    }
  }

  return cyclicEdgeIds;
}
