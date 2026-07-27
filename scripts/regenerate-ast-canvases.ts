/**
 * chaosnexus-forge/scripts/regenerate-ast-canvases.ts
 *
 * Regenerates editable (non-displayOnly) canvas sidecars from Rhai via the Rust
 * semantic visualizer + TypeScript function-lane layout. Primary target:
 * terminal_tool.rhai visual parity with the curated multi-lane assembly graph.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { finalizeCanvasDocumentLayout } from "../src/lib/dual_editor/canvas_layout.ts";
import type { CanvasDocumentV3 } from "../src/lib/dual_editor/canvas_schema.ts";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
const TAURI_DIR = join(REPO_ROOT, "chaosnexus-forge/src-tauri");

interface AstTarget {
  rhaiPath: string;
  sidecarPath: string;
}

const TARGETS: AstTarget[] = [
  {
    rhaiPath: "chaosnexus-scripts/plugins/terminal/terminal_tool.rhai",
    sidecarPath:
      "chaosnexus-scripts/plugins/terminal/.chaosnexus-forge/terminal_tool.rhai.canvas.json",
  },
];

function dumpAstCanvas(rhaiAbs: string): CanvasDocumentV3 {
  const json = execFileSync(
    "cargo",
    ["run", "--quiet", "--example", "dump_visual_canvas", "--", rhaiAbs],
    {
      cwd: TAURI_DIR,
      encoding: "utf8",
      env: {
        ...process.env,
        // Avoid sccache/telemetry noise in CI; keep local wrapper if set.
        CARGO_TERM_COLOR: "never",
      },
      maxBuffer: 8 * 1024 * 1024,
    }
  );
  // cargo may still print compile lines; take the last JSON object line.
  const lines = json
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{") && l.endsWith("}"));
  const raw = lines[lines.length - 1];
  if (!raw) {
    throw new Error(`dump_visual_canvas produced no JSON for ${rhaiAbs}\n${json.slice(0, 500)}`);
  }
  return JSON.parse(raw) as CanvasDocumentV3;
}

function main(): void {
  let failed = 0;
  for (const target of TARGETS) {
    try {
      const rhaiAbs = join(REPO_ROOT, target.rhaiPath);
      if (!existsSync(rhaiAbs)) {
        throw new Error(`missing Rhai source: ${target.rhaiPath}`);
      }
      const ast = dumpAstCanvas(rhaiAbs);
      // Strip any accidental displayOnly from upstream serializers.
      const { displayOnly: _ignored, ...rest } = ast as CanvasDocumentV3 & {
        displayOnly?: boolean;
      };
      const laid = finalizeCanvasDocumentLayout(rest, { force: true });
      if (laid.displayOnly) {
        delete laid.displayOnly;
      }
      const abs = join(REPO_ROOT, target.sidecarPath);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, `${JSON.stringify(laid)}\n`, "utf8");

      const leaves = laid.nodes.filter((n) => n.type !== "group");
      const events = leaves.filter((n) => n.kind === "event");
      const ys = new Set(leaves.map((n) => n.y));
      console.log(
        `OK ${target.sidecarPath} (${leaves.length} leaves, ${events.length} events, ${ys.size} Y-lanes, ${laid.edges.length} edges)`
      );
    } catch (err) {
      failed += 1;
      console.error(`FAIL ${target.sidecarPath}:`, err);
    }
  }
  if (failed > 0) process.exit(1);
  console.log(`\nWrote ${TARGETS.length - failed} AST canvas sidecar(s).`);
}

main();
