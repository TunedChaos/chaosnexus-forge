/**
 * @file rhai_import.ts
 *
 * Best-effort importer: maps existing Rhai public functions to Function Call
 * nodes and wraps unrecognized function bodies in Script escape-hatch nodes.
 * No strict bidirectional round-trip (graph-authoritative model).
 */

import type { FnSignature } from "$lib/graph";
import {
  buildSkeletonGraph,
  type SkeletonGraphOptions,
  type SkeletonGraphResult,
} from "./canvas_skeleton";

/** Result of a manifest import skeleton build. */
export type ImportResult = SkeletonGraphResult;

/**
 * Builds a minimal Vhai graph from a Rhai manifest. Default layout is
 * edge-free (terminal convention); pass `{ chainExec: true }` for the legacy
 * linear exec chain used by the in-app import button.
 */
export function importRhaiManifestToGraph(
  signatures: FnSignature[],
  startPosition?: { x: number; y: number },
  options?: Omit<SkeletonGraphOptions, "startPosition">
): ImportResult {
  return buildSkeletonGraph(signatures, {
    ...options,
    startPosition: startPosition ?? { x: 120, y: 120 },
    chainExec: options?.chainExec ?? false,
  });
}
