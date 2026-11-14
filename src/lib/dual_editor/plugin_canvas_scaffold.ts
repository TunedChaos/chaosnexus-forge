/**
 * chaosnexus-forge/src/lib/dual_editor/plugin_canvas_scaffold.ts
 *
 * Generates an edge-free v3 canvas sidecar for a freshly scaffolded Rhai plugin
 * entry script so the Dual Editor can visualize it immediately.
 */

import { invoke } from "@tauri-apps/api/core";
import { parseSignaturesJson } from "$lib/graph";
import { buildCanvasMetadata } from "$lib/parser";
import { buildSkeletonGraph } from "./canvas_skeleton";
import { writeCanvasSidecar } from "./canvas_storage";

/**
 * Extracts public function signatures from a Rhai entry script and writes a
 * skeleton `.chaosnexus-forge/*.canvas.json` sidecar beside it.
 */
export async function scaffoldPluginCanvasSidecar(
  projectPath: string,
  pluginName: string,
  filename: string
): Promise<void> {
  const raw = (await invoke("extract_plugin_functions", {
    projectPath,
    pluginName,
    filename,
  })) as string;

  const { signatures, error } = parseSignaturesJson(raw);
  if (error) {
    throw new Error(error);
  }

  const { nodes, edges } = buildSkeletonGraph(signatures);
  const metadata = buildCanvasMetadata(nodes, edges);
  await writeCanvasSidecar(projectPath, pluginName, filename, metadata);
}
