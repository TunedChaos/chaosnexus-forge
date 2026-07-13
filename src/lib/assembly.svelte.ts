/**
 * @file assembly.svelte.ts
 * @description Reactive store for the assembly-line function manifest (Phase 6b).
 * Fetches per-tab Rhai signatures from the engine via `extract_plugin_functions`.
 */

// chaosnexus-forge/src/lib/assembly.svelte.ts

import { invoke } from "@tauri-apps/api/core";
import {
  parseSignaturesJson,
  reconcileManifest,
  validateGraph,
  type FnSignature,
  type GraphDiagnostic,
  type GraphNode,
  type GraphWire,
} from "./graph";
import { canvasTabKey } from "./dual_editor/canvas_storage";

/**
 * Manages the state of function manifests for the assembly-line visual scripting tool,
 * handling signature fetching, caching, and manifest reconciliation for graph nodes.
 */
class AssemblyStore {
  /** Manifest JSON keyed by `plugin:filename` tab key. */
  manifests = $state<Record<string, FnSignature[]>>({});
  /** Compile error from the engine manifest parse, if any. */
  manifestErrors = $state<Record<string, string | null>>({});

  /**
   * Retrieves the cached function signatures for a specific tab key.
   *
   * @param key - The tab key (usually derived from plugin and filename).
   * @returns An array of function signatures.
   */
  signaturesFor(key: string): FnSignature[] {
    return this.manifests[key] ?? [];
  }

  /**
   * Retrieves the cached compilation error for a specific tab key, if any.
   *
   * @param key - The tab key.
   * @returns The error message or null if no error occurred.
   */
  errorFor(key: string): string | null {
    return this.manifestErrors[key] ?? null;
  }

  /**
   * True once a manifest fetch has resolved successfully for the tab (even if it
   * yielded zero functions). False while unloaded or after a failed fetch, so
   * callers can suppress false "stale binding" errors when there is no ground
   * truth about which functions exist.
   */
  isKnown(key: string): boolean {
    return this.manifests[key] !== undefined && !this.manifestErrors[key];
  }

  /** Fetches the engine AST manifest for a Rhai tab. */
  async refresh(
    projectPath: string,
    pluginName: string,
    filename: string
  ): Promise<FnSignature[]> {
    const key = canvasTabKey(pluginName, filename);
    try {
      const raw = (await invoke("extract_plugin_functions", {
        projectPath,
        pluginName,
        filename,
      })) as string;
      const { signatures, error } = parseSignaturesJson(raw);
      this.manifests = { ...this.manifests, [key]: signatures };
      this.manifestErrors = { ...this.manifestErrors, [key]: error };
      return signatures;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.manifestErrors = { ...this.manifestErrors, [key]: msg };
      this.manifests = { ...this.manifests, [key]: [] };
      return [];
    }
  }

  /**
   * Builds graph nodes and wires from raw canvas metadata, then performs
   * graph validation and reconciliation against the known manifest signatures.
   *
   * @param tabKey - The tab key identifying the target manifest.
   * @param canvasNodes - Raw node metadata from the UI canvas.
   * @param canvasEdges - Raw edge metadata from the UI canvas.
   * @returns An array of diagnostic issues found in the graph topology.
   */
  diagnosticsForCanvas(
    tabKey: string,
    canvasNodes: { id: string; fn?: string; kind?: string; type?: string }[],
    canvasEdges: {
      id: string;
      source: string;
      target: string;
      sourceHandle?: string;
      targetHandle?: string;
      type?: string;
    }[]
  ): GraphDiagnostic[] {
    const graphNodes: GraphNode[] = canvasNodes
      .filter((n) => n.type !== "group")
      .map((n) => ({
        id: n.id,
        fn: n.fn ?? n.id,
        kind: (n.kind as GraphNode["kind"]) ?? "function",
      }));
    const wires: GraphWire[] = canvasEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      kind: e.type === "execEdge" ? "exec" : "data",
    }));
    return validateGraph(graphNodes, wires, this.signaturesFor(tabKey), this.isKnown(tabKey));
  }

  /**
   * Reconciles a list of graph nodes against the known function manifest for a tab,
   * categorizing nodes as bound, stale, or unbound.
   *
   * @param tabKey - The tab key identifying the target manifest.
   * @param graphNodes - The nodes currently present in the graph.
   * @returns An object separating bound nodes, stale nodes, and unbound signatures.
   */
  reconcile(
    tabKey: string,
    graphNodes: GraphNode[]
  ) {
    return reconcileManifest(graphNodes, this.signaturesFor(tabKey));
  }
}

/** Singleton instance of the AssemblyStore. */
export const assembly = new AssemblyStore();
