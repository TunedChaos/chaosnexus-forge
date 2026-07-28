// chaosnexus-forge/src/lib/cycle_detector.ts
//
// Directed-graph cycle helpers for Vhai canvas edges.

import type { Edge } from "@xyflow/svelte";

/** Builds adjacency list once for O(V+E) traversals. */
function buildOutgoing(edges: Edge[]): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    let list = adj.get(e.source);
    if (!list) {
      list = [];
      adj.set(e.source, list);
    }
    list.push(e.target);
  }
  return adj;
}

/**
 * Checks if adding a directed edge from source to target would create a cycle.
 * This checks if there is already a directed path from target to source.
 */
export function wouldCreateCycle(source: string, target: string, edges: Edge[]): boolean {
  if (source === target) return true; // Self-loops are always cycles

  const adj = buildOutgoing(edges);
  const visited = new Set<string>();
  const queue = [target];
  visited.add(target);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === source) {
      return true;
    }
    const outs = adj.get(current);
    if (!outs) continue;
    for (const next of outs) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }

  return false;
}

/**
 * Scans the entire graph and returns a set of edge IDs that are part of a cycle.
 * Uses Tarjan-style SCC coloring: an edge (u→v) is cyclic iff u and v share an SCC.
 */
export function getCyclicEdges(edges: Edge[]): Set<string> {
  const cyclicEdgeIds = new Set<string>();
  if (edges.length === 0) return cyclicEdgeIds;

  const adj = buildOutgoing(edges);
  const nodes = new Set<string>();
  for (const e of edges) {
    nodes.add(e.source);
    nodes.add(e.target);
  }

  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccId = new Map<string, number>();
  let sccCount = 0;

  function strongConnect(v: string): void {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) ?? []) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        sccId.set(w, sccCount);
      } while (w !== v);
      sccCount += 1;
    }
  }

  for (const v of nodes) {
    if (!indices.has(v)) strongConnect(v);
  }

  // Count members per SCC - only multi-node SCCs (or self-loops) contain cycles.
  const sccSize = new Map<number, number>();
  for (const id of sccId.values()) {
    sccSize.set(id, (sccSize.get(id) ?? 0) + 1);
  }

  for (const e of edges) {
    if (e.source === e.target) {
      cyclicEdgeIds.add(e.id);
      continue;
    }
    const a = sccId.get(e.source);
    const b = sccId.get(e.target);
    if (a !== undefined && a === b && (sccSize.get(a) ?? 0) > 1) {
      cyclicEdgeIds.add(e.id);
    }
  }

  return cyclicEdgeIds;
}
