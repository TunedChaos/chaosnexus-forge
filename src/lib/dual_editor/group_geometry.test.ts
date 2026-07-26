/**
 * @module
 * chaosnexus-forge/src/lib/dual_editor/group_geometry.test.ts
 */

import { describe, it, expect } from "vitest";
import type { Node } from "@xyflow/svelte";
import {
  parseGroupSize,
  formatGroupStyle,
  computeGroupBounds,
  resizeGroupsBottomUp,
  minGroupSizeForChildren,
  emptyGroupFloor,
  effectiveSize,
  DEFAULT_NODE_SIZE,
  MIN_GROUP_SIZE,
  GROUP_HEADER_MIN_SIZE,
  GROUP_PADDING,
  type Size,
} from "./group_geometry";

const readFixed = () => DEFAULT_NODE_SIZE;

function leaf(id: string, x: number, y: number, parentId?: string): Node {
  return {
    id,
    type: "codeNativeNode",
    position: { x, y },
    parentId,
    data: { label: id },
  };
}

function makeGroup(
  id: string,
  x: number,
  y: number,
  style: string,
  parentId?: string
): Node {
  return {
    id,
    type: "group",
    position: { x, y },
    parentId,
    style,
    data: { label: id },
  };
}

/** Assert every child is fully inside the group with padding on all four sides. */
function expectChildrenFullyVisible(
  group: Node,
  children: Node[],
  read: (id: string) => Size | undefined
): void {
  const size = parseGroupSize(group.style as string);
  for (const child of children) {
    const cs = effectiveSize(child, read);
    expect(child.position.x).toBeGreaterThanOrEqual(GROUP_PADDING.x);
    expect(child.position.y).toBeGreaterThanOrEqual(GROUP_PADDING.y);
    expect(child.position.x + cs.width).toBeLessThanOrEqual(size.width - GROUP_PADDING.x);
    expect(child.position.y + cs.height).toBeLessThanOrEqual(size.height - GROUP_PADDING.y);
  }
}

describe("parseGroupSize", () => {
  it("clamps -Infinity and negative widths to MIN_GROUP_SIZE", () => {
    const size = parseGroupSize("width: -Infinitypx; height: 50px;");
    expect(size.width).toBe(MIN_GROUP_SIZE.width);
    expect(size.height).toBe(MIN_GROUP_SIZE.height);
  });

  it("round-trips through formatGroupStyle", () => {
    const style = formatGroupStyle({ width: 400, height: 300 });
    expect(parseGroupSize(style)).toEqual({ width: 400, height: 300 });
  });
});

describe("computeGroupBounds", () => {
  it("uses Math.max for the right/bottom edges (regression for maxX bug)", () => {
    const children = [leaf("a", 10, 20), leaf("b", 250, 80)];
    const bounds = computeGroupBounds(children, readFixed);
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThan(0);
    expect(Number.isFinite(bounds!.width)).toBe(true);
    expect(bounds!.width).toBeGreaterThan(250);
  });
});

describe("resizeGroupsBottomUp", () => {
  it("grows a group to fit its children", () => {
    const nodes: Node[] = [
      makeGroup("g1", 0, 0, "width: 220px; height: 140px;"),
      leaf("n1", 40, 50, "g1"),
      leaf("n2", 320, 120, "g1"),
    ];

    const resized = resizeGroupsBottomUp(nodes, readFixed);
    const g1 = resized.find((n) => n.id === "g1")!;
    const size = parseGroupSize(g1.style as string);
    expect(size.width).toBeGreaterThan(400);
    expect(size.height).toBeGreaterThan(200);
  });

  it("bubbles nested group resize into the parent group", () => {
    const nodes: Node[] = [
      makeGroup("outer", 0, 0, "width: 220px; height: 140px;"),
      makeGroup("inner", 30, 40, "width: 220px; height: 140px;", "outer"),
      leaf("leaf", 20, 30, "inner"),
      leaf("leaf2", 280, 90, "inner"),
    ];

    const resized = resizeGroupsBottomUp(nodes, readFixed);
    const inner = resized.find((n) => n.id === "inner")!;
    const outer = resized.find((n) => n.id === "outer")!;
    const innerSize = parseGroupSize(inner.style as string);
    const outerSize = parseGroupSize(outer.style as string);
    expect(innerSize.width).toBeGreaterThan(400);
    expect(outerSize.width).toBeGreaterThan(innerSize.width);
  });

  it("shifts group position when a child extends above/left of origin", () => {
    const nodes: Node[] = [
      makeGroup("g1", 100, 100, "width: 400px; height: 300px;"),
      leaf("n1", -5, -10, "g1"),
    ];

    const resized = resizeGroupsBottomUp(nodes, readFixed);
    const g1 = resized.find((n) => n.id === "g1")!;
    const n1 = resized.find((n) => n.id === "n1")!;

    expect(g1.position.x).toBeLessThan(100);
    expect(n1.position.x).toBeGreaterThanOrEqual(0);
  });

  it("snug-fits content: shrinks a too-large group toward its single child", () => {
    // A group's own (possibly inflated) style must never feed back into sizing,
    // so a large box with one small child collapses to fit it. This is the core
    // fix for the runaway-growth bug.
    const nodes: Node[] = [
      makeGroup("g1", 0, 0, "width: 900px; height: 700px;"),
      leaf("n1", 40, 50, "g1"),
    ];

    const resized = resizeGroupsBottomUp(nodes, readFixed);
    const size = parseGroupSize((resized.find((n) => n.id === "g1")!).style as string);
    expect(size.width).toBeLessThan(900);
    expect(size.height).toBeLessThan(700);
    // ...but still wraps the child with padding (never below the content floor).
    expect(size.width).toBeGreaterThanOrEqual(MIN_GROUP_SIZE.width);
    expect(size.height).toBeGreaterThanOrEqual(MIN_GROUP_SIZE.height);
  });

  it("is idempotent: a second pass produces the identical size", () => {
    const nodes: Node[] = [
      makeGroup("g1", 0, 0, "width: 220px; height: 140px;"),
      leaf("n1", 40, 50, "g1"),
      leaf("n2", 360, 220, "g1"),
    ];
    const once = resizeGroupsBottomUp(nodes, readFixed);
    const twice = resizeGroupsBottomUp(once, readFixed);
    const a = parseGroupSize((once.find((n) => n.id === "g1")!).style as string);
    const b = parseGroupSize((twice.find((n) => n.id === "g1")!).style as string);
    expect(b).toEqual(a);
  });

  it("shrinks to fit when a member is removed", () => {
    const before: Node[] = [
      makeGroup("g1", 0, 0, "width: 220px; height: 140px;"),
      leaf("n1", 40, 50, "g1"),
      leaf("n2", 360, 220, "g1"),
    ];
    const grown = resizeGroupsBottomUp(before, readFixed);
    const grownSize = parseGroupSize((grown.find((n) => n.id === "g1")!).style as string);

    // Remove the far member; the group re-fits to the remaining content.
    const after: Node[] = [
      grown.find((n) => n.id === "g1")!,
      grown.find((n) => n.id === "n1")!,
    ];
    const reflowed = resizeGroupsBottomUp(after, readFixed);
    const reflowedSize = parseGroupSize((reflowed.find((n) => n.id === "g1")!).style as string);

    expect(reflowedSize.width).toBeLessThan(grownSize.width);
    expect(reflowedSize.height).toBeLessThan(grownSize.height);
    expect(reflowedSize.width).toBeGreaterThanOrEqual(MIN_GROUP_SIZE.width);
  });

  it("keeps a manual size as a floor even when content is small", () => {
    // A user's explicit resize (recorded as data.manualWidth/Height) persists:
    // the group stays large though its single child would fit a snug box.
    const group = makeGroup("g1", 0, 0, "width: 220px; height: 140px;");
    (group.data as Record<string, unknown>).manualWidth = 640;
    (group.data as Record<string, unknown>).manualHeight = 480;
    const nodes: Node[] = [group, leaf("n1", 40, 50, "g1")];

    const resized = resizeGroupsBottomUp(nodes, readFixed);
    const size = parseGroupSize((resized.find((n) => n.id === "g1")!).style as string);
    expect(size.width).toBe(640);
    expect(size.height).toBe(480);
  });

  it("mirrors size into width/height and publishes a content-floor min", () => {
    const nodes: Node[] = [
      makeGroup("g1", 0, 0, "width: 220px; height: 140px;"),
      leaf("n1", 40, 50, "g1"),
      leaf("n2", 320, 120, "g1"),
    ];
    const resized = resizeGroupsBottomUp(nodes, readFixed);
    const g1 = resized.find((n) => n.id === "g1")! as Node & {
      width?: number;
      height?: number;
    };
    const size = parseGroupSize(g1.style as string);

    expect(g1.width).toBe(size.width);
    expect(g1.height).toBe(size.height);

    // With no manual size, the applied snug size equals the published content
    // floor (the minimum a manual resize may not cross), and that floor stays at
    // or above the structural minimum.
    const data = g1.data as { minWidth?: number; minHeight?: number };
    expect(data.minWidth).toBe(size.width);
    expect(data.minHeight).toBe(size.height);
    expect(data.minWidth).toBeGreaterThanOrEqual(MIN_GROUP_SIZE.width);
    expect(data.minHeight).toBeGreaterThanOrEqual(MIN_GROUP_SIZE.height);
  });

  it("re-anchors excess top-left gap so the content floor can shrink back down", () => {
    // Simulates dead space left when a group was enlarged from the top/left:
    // the member stayed put in parent-relative coords, inflating minX/minY.
    const nodes: Node[] = [
      makeGroup("g1", 50, 80, "width: 500px; height: 400px;"),
      leaf("n1", 100, 120, "g1"),
    ];

    const resized = resizeGroupsBottomUp(nodes, readFixed);
    const g1 = resized.find((n) => n.id === "g1")!;
    const n1 = resized.find((n) => n.id === "n1")!;
    const size = parseGroupSize(g1.style as string);

    expect(n1.position.x).toBe(GROUP_PADDING.x);
    expect(n1.position.y).toBe(GROUP_PADDING.y);
    expect(size.width).toBeLessThan(500);
    expect(size.height).toBeLessThan(400);
    expectChildrenFullyVisible(g1, [n1], readFixed);
  });

  it("manual enlarge then clearing manual restores the snug content floor", () => {
    const nodes: Node[] = [
      makeGroup("g1", 0, 0, "width: 220px; height: 140px;"),
      leaf("n1", 40, 50, "g1"),
    ];
    const snug = resizeGroupsBottomUp(nodes, readFixed);
    const snugGroup = snug.find((n) => n.id === "g1")!;
    const snugSize = parseGroupSize(snugGroup.style as string);

    const enlarged = snug.map((n) =>
      n.id === "g1"
        ? {
            ...n,
            data: {
              ...(n.data as Record<string, unknown>),
              manualWidth: snugSize.width + 120,
              manualHeight: snugSize.height + 80,
            },
          }
        : n
    );
    const withManual = resizeGroupsBottomUp(enlarged, readFixed);
    const enlargedSize = parseGroupSize(
      (withManual.find((n) => n.id === "g1")!).style as string
    );
    expect(enlargedSize.width).toBe(snugSize.width + 120);
    expect(enlargedSize.height).toBe(snugSize.height + 80);

    const cleared = withManual.map((n) => {
      if (n.id !== "g1") return n;
      const data = { ...(n.data as Record<string, unknown>) };
      delete data.manualWidth;
      delete data.manualHeight;
      return { ...n, data };
    });
    const shrunk = resizeGroupsBottomUp(cleared, readFixed);
    expect(parseGroupSize((shrunk.find((n) => n.id === "g1")!).style as string)).toEqual(
      snugSize
    );
  });

  it("keeps every member visible on all four sides after recompute", () => {
    const nodes: Node[] = [
      makeGroup("g1", 0, 0, "width: 220px; height: 140px;"),
      leaf("n1", -8, 5, "g1"),
      leaf("n2", 280, 200, "g1"),
    ];
    const resized = resizeGroupsBottomUp(nodes, readFixed);
    const g1 = resized.find((n) => n.id === "g1")!;
    const members = resized.filter((n) => n.parentId === "g1");
    expectChildrenFullyVisible(g1, members, readFixed);
  });
});

describe("empty-group header floor", () => {
  it("keeps MIN_GROUP_SIZE at or above the header-fit floor in both axes", () => {
    // Invariant: the structural minimum must never be smaller than the size
    // required to keep an empty group's header/title legible.
    expect(MIN_GROUP_SIZE.width).toBeGreaterThanOrEqual(GROUP_HEADER_MIN_SIZE.width);
    expect(MIN_GROUP_SIZE.height).toBeGreaterThanOrEqual(GROUP_HEADER_MIN_SIZE.height);
  });

  it("emptyGroupFloor is the max of the structural and header floors", () => {
    expect(emptyGroupFloor()).toEqual({
      width: Math.max(MIN_GROUP_SIZE.width, GROUP_HEADER_MIN_SIZE.width),
      height: Math.max(MIN_GROUP_SIZE.height, GROUP_HEADER_MIN_SIZE.height),
    });
  });

  it("publishes the header-fit floor as the min for an empty group", () => {
    const nodes: Node[] = [makeGroup("g1", 0, 0, "width: 220px; height: 140px;")];
    const resized = resizeGroupsBottomUp(nodes, readFixed);
    const g1 = resized.find((n) => n.id === "g1")! as Node & {
      data: { minWidth?: number; minHeight?: number };
    };
    const floor = emptyGroupFloor();
    expect(g1.data.minWidth).toBe(floor.width);
    expect(g1.data.minHeight).toBe(floor.height);
    expect(g1.data.minWidth).toBeGreaterThanOrEqual(GROUP_HEADER_MIN_SIZE.width);
    expect(g1.data.minHeight).toBeGreaterThanOrEqual(GROUP_HEADER_MIN_SIZE.height);
  });
});

describe("minGroupSizeForChildren", () => {
  it("returns the empty-group floor for an empty group", () => {
    expect(minGroupSizeForChildren([], readFixed)).toEqual(emptyGroupFloor());
  });

  it("clamps a tight content extent up to MIN_GROUP_SIZE", () => {
    const floor = minGroupSizeForChildren([leaf("n1", 0, 0)], readFixed);
    expect(floor.width).toBeGreaterThanOrEqual(MIN_GROUP_SIZE.width);
    expect(floor.height).toBeGreaterThanOrEqual(MIN_GROUP_SIZE.height);
  });
});
