// chaosnexus-forge/src/lib/dual_editor/canvas_storage.ts
//
// Sidecar persistence for Svelte Flow canvas layout (.chaosnexus-forge/*.canvas.json).
// Keeps Rhai source free of embedded CANVAS_METADATA comment blocks.

import { invoke } from "@tauri-apps/api/core";
import type { Edge, Node } from "@xyflow/svelte";
import type { CanvasMetadata } from "$lib/parser";
import { buildCanvasMetadata, extractEmbeddedCanvasMetadata, stripCanvasMetadata } from "$lib/parser";

/**
 * Determines whether a given filename represents a Rhai script.
 * 
 * @param filename - The filename to check.
 * @returns True if the file has a .rhai extension.
 */
export function isRhaiScript(filename: string): boolean {
  return filename.endsWith(".rhai");
}

/**
 * Generates a unique key for tracking a canvas tab based on its plugin and file name.
 * 
 * @param pluginName - The name of the plugin.
 * @param filename - The specific filename within the plugin.
 * @returns A uniquely formatted string key.
 */
export function canvasTabKey(pluginName: string, filename: string): string {
  return `${pluginName}:${filename}`;
}

/**
 * Loads canvas layout for a Rhai tab: sidecar first, then legacy embedded metadata migration.
 */
export async function loadCanvasForTab(
  projectPath: string,
  pluginName: string,
  filename: string,
  rhaiContent: string
): Promise<{ metadata: CanvasMetadata | null; strippedRhai: string; migratedFromEmbedded: boolean }> {
  if (!isRhaiScript(filename)) {
    return { metadata: null, strippedRhai: rhaiContent, migratedFromEmbedded: false };
  }

  try {
    const sidecar = (await invoke("read_canvas_sidecar", {
      projectPath,
      pluginName,
      filename,
    })) as string | null;

    if (sidecar) {
      const metadata = JSON.parse(sidecar) as CanvasMetadata;
      return {
        metadata,
        strippedRhai: stripCanvasMetadata(rhaiContent),
        migratedFromEmbedded: hasEmbeddedCanvasMetadata(rhaiContent),
      };
    }
  } catch (err) {
    console.error("Failed to read canvas sidecar:", err);
  }

  const embedded = extractEmbeddedCanvasMetadata(rhaiContent);
  if (embedded) {
    return {
      metadata: embedded,
      strippedRhai: stripCanvasMetadata(rhaiContent),
      migratedFromEmbedded: true,
    };
  }

  return { metadata: null, strippedRhai: rhaiContent, migratedFromEmbedded: false };
}

/**
 * Checks whether the given script code contains embedded canvas metadata.
 * 
 * @param code - The source code to check.
 * @returns True if metadata is embedded within the script.
 */
export function hasEmbeddedCanvasMetadata(code: string): boolean {
  return extractEmbeddedCanvasMetadata(code) !== null;
}

/** Persists canvas JSON to the plugin sidecar file. */
export async function writeCanvasSidecar(
  projectPath: string,
  pluginName: string,
  filename: string,
  metadata: CanvasMetadata
): Promise<void> {
  await invoke("write_canvas_sidecar", {
    projectPath,
    pluginName,
    filename,
    contents: JSON.stringify(metadata),
  });
}

/** Removes sidecar when the Rhai script is deleted. */
export async function deleteCanvasSidecar(
  projectPath: string,
  pluginName: string,
  filename: string
): Promise<void> {
  await invoke("delete_canvas_sidecar", {
    projectPath,
    pluginName,
    filename,
  });
}

/** Builds metadata from live graph state. */
export function canvasFromFlow(nodes: Node[], edges: Edge[]): CanvasMetadata {
  return buildCanvasMetadata(nodes, edges);
}
