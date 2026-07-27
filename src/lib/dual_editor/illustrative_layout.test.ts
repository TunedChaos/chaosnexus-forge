// chaosnexus-forge/src/lib/dual_editor/illustrative_layout.test.ts

/**
 * @module
 * @description Unit tests for deterministic spacing and de-overlap algorithms
 * used to format illustrative canvases in ChaosNexus Forge.
 */
import { describe, expect, it } from "vitest";
import { col, deOverlapNodes, GAP_X, NODE_H, NODE_W, row } from "./illustrative_layout";
import type { CanvasNodeRecord } from "./canvas_schema";

function leaf(id: string, x: number, y: number): CanvasNodeRecord {
  return { id, label: id, x, y, parentId: "main_group", kind: "script" };
}

describe("illustrative_layout deOverlapNodes", () => {
  it("separates same-row nodes horizontally instead of stacking vertically", () => {
    const nodes = deOverlapNodes([
      { id: "main_group", label: "Main Logic", x: 50, y: 50, type: "group" },
      leaf("a", col(0), row(0)),
      leaf("b", col(1), row(0)),
      leaf("c", col(2), row(0)),
    ]);

    const siblings = nodes.filter((n) => n.parentId === "main_group");
    for (let i = 0; i < siblings.length; i++) {
      for (let j = i + 1; j < siblings.length; j++) {
        const a = siblings[i];
        const b = siblings[j];
        if (Math.abs(a.y - b.y) < 36) {
          expect(a.x + NODE_W + GAP_X).toBeLessThanOrEqual(b.x + 1);
        }
      }
    }
  });

  it("resolves exact overlapping node collisions via physics push-apart", () => {
    const nodes = deOverlapNodes([
      { id: "main_group", label: "Main Logic", x: 50, y: 50, type: "group" },
      leaf("node_1", 30, 45),
      leaf("node_2", 30, 45),
    ]);

    const n1 = nodes.find((n) => n.id === "node_1")!;
    const n2 = nodes.find((n) => n.id === "node_2")!;

    // Must be pushed apart so they no longer occupy the exact same space
    const overlapX = Math.min(n1.x + NODE_W + 36 - n2.x, n2.x + NODE_W + 36 - n1.x);
    const overlapY = Math.min(n1.y + NODE_H + 24 - n2.y, n2.y + NODE_H + 24 - n1.y);
    expect(overlapX <= 0 || overlapY <= 0).toBe(true);
  });
});
