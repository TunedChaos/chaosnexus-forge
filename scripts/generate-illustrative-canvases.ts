/**
 * Illustrative Canvas Generator Script
 * 
 * @module scripts/generate-illustrative-canvases
 * @description Writes display-only, fully-wired v3 canvas sidecars for all bundled sample plugins.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ILLUSTRATIVE_TARGETS } from "../src/lib/dual_editor/illustrative_canvas_builder.ts";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");

function main(): void {
  let failed = 0;
  for (const target of ILLUSTRATIVE_TARGETS) {
    try {
      const doc = target.build();
      if (!doc.displayOnly) {
        throw new Error("displayOnly must be true for illustrative canvases");
      }
      if (!doc.edges.length) {
        throw new Error("illustrative canvas must have wiring edges");
      }
      const abs = join(REPO_ROOT, target.sidecarPath);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, `${JSON.stringify(doc)}\n`, "utf8");
      console.log(`OK ${target.sidecarPath} (${doc.nodes.length} nodes, ${doc.edges.length} edges)`);
    } catch (err) {
      failed += 1;
      console.error(`FAIL ${target.sidecarPath}:`, err);
    }
  }
  if (failed > 0) process.exit(1);
  console.log(`\nWrote ${ILLUSTRATIVE_TARGETS.length} illustrative canvas sidecars.`);
}

main();
