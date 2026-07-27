/**
 * chaosnexus-forge/src/lib/dual_editor/terminal_canvas_parity.test.ts
 *
 * Golden checks: automated AST+layout for terminal_tool must produce a
 * multi-lane editable graph with the same key nodes as the curated illustration.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { finalizeCanvasDocumentLayout } from "./canvas_layout";
import { buildTerminalIllustration } from "./illustrative_canvas_builder";
import type { CanvasDocumentV3 } from "./canvas_schema";
import { isDisplayOnlyCanvas } from "./canvas_schema";

const REPO_ROOT = resolve(process.cwd(), "..");
const SIDECAR = join(
  REPO_ROOT,
  "chaosnexus-scripts/plugins/terminal/.chaosnexus-forge/terminal_tool.rhai.canvas.json"
);

function loadSidecar(): CanvasDocumentV3 {
  expect(existsSync(SIDECAR)).toBe(true);
  return JSON.parse(readFileSync(SIDECAR, "utf8")) as CanvasDocumentV3;
}

describe("terminal_tool canvas visual parity", () => {
  it("bundled sidecar is multi-lane, editable, and contains illustration keystones", () => {
    const doc = loadSidecar();
    expect(isDisplayOnlyCanvas(doc)).toBe(false);
    expect(doc.displayOnly).toBeFalsy();

    const leaves = doc.nodes.filter((n) => n.type !== "group");
    const events = leaves.filter((n) => n.kind === "event");
    expect(events.length).toBe(3);

    const labels = leaves.map((n) => n.label);
    expect(labels.some((l) => l.includes("load_config") || l === "load_config")).toBe(true);
    expect(leaves.some((n) => n.kind === "for-each")).toBe(true);
    expect(
      labels.some((l) => l.includes("register_mcp_tool") || l === "register_mcp_tool")
    ).toBe(true);
    expect(labels.some((l) => l.includes("args.contains"))).toBe(true);
    expect(
      labels.some((l) => l.includes("run_command") || l === "run_command")
    ).toBe(true);

    const falseEdges = (doc.edges || []).filter((e) => e.sourceHandle === "false");
    expect(falseEdges.length).toBeGreaterThanOrEqual(1);

    const ys = leaves.map((n) => n.y);
    const xs = leaves.map((n) => n.x);
    const uniqueYs = new Set(ys);
    expect(uniqueYs.size).toBeGreaterThanOrEqual(3);

    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    // Reject the old ~6900×470 ribbon aspect.
    expect(height).toBeGreaterThan(200);
    expect(width / Math.max(height, 1)).toBeLessThan(12);
    expect(leaves.length).toBeLessThan(45);
  });

  it("force layout of illustration topology stays multi-lane (regression guard)", () => {
    const illust = buildTerminalIllustration();
    // Strip preplaced coords to simulate fresh AST placement.
    const stripped: CanvasDocumentV3 = {
      ...illust,
      displayOnly: undefined,
      nodes: illust.nodes.map((n) =>
        n.type === "group" ? n : { ...n, x: 0, y: 0 }
      ),
    };
    const laid = finalizeCanvasDocumentLayout(stripped, { force: true });
    const leaves = laid.nodes.filter((n) => n.type !== "group");
    const ys = new Set(leaves.map((n) => n.y));
    expect(ys.size).toBeGreaterThanOrEqual(3);
    expect(isDisplayOnlyCanvas(laid)).toBe(false);
  });
});
