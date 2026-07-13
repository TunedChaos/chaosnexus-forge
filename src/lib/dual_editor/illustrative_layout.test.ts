// chaosnexus-forge/src/lib/dual_editor/illustrative_layout.test.ts

/**
 * @module
 * @description Unit tests for deterministic spacing and de-overlap algorithms
 * used to format illustrative canvases in ChaosNexus Forge.
 */
import { describe, expect, it } from "vitest";
import { col, deOverlapNodes, GAP_X, NODE_W, row } from "./illustrative_layout";
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
});
