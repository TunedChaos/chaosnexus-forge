/**
 * @module
 * chaosnexus-forge/src/lib/dual_editor/group_membership.test.ts
 */

import { describe, it, expect } from "vitest";
import type { Node } from "@xyflow/svelte";
import {
  absolutePosition,
  isReparentableOnDrag,
  isSelfOrDescendant,
  pickDeepestGroup,
  rebaseToParent,
  resolveDropTarget,
  resolveDropTargetAtPoint,
  resolveDropTargetForDrag,
  dropPointForDrag,
  liftNodesToRootForDrag,
  collectGroupDescendants,
  groupsContainingPoint,
  restackGroups,
  orderNodesParentFirst,
} from "./group_membership";
import { DEFAULT_NODE_SIZE } from "./group_geometry";
import { Z_MAIN_GROUP, Z_NODE_BASE } from "$lib/parser";

const readFixed = () => DEFAULT_NODE_SIZE;
function groupNode(id: string, x = 0, y = 0, parentId?: string, zIndex?: number): Node {
  return {
    id,
    type: "group",
    position: { x, y },
    parentId,
    zIndex,
    style: "width: 300px; height: 200px;",
    data: { label: id },
  };
}

function leaf(id: string, x: number, y: number, parentId?: string): Node {
  return {
    id,
    type: "codeNativeNode",
    position: { x, y },
    parentId,
    data: { label: id },
  };
}

describe("absolutePosition", () => {
  it("sums parent chain offsets for nested groups", () => {
    const nodes = [groupNode("outer", 50, 60), groupNode("inner", 10, 20, "outer"), leaf("n", 5, 5, "inner")];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(absolutePosition(nodes[2], byId)).toEqual({ x: 65, y: 85 });
  });
});

describe("isSelfOrDescendant", () => {
  it("detects descendant groups", () => {
    const nodes = [groupNode("outer"), groupNode("inner", 0, 0, "outer")];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(isSelfOrDescendant("inner", "outer", byId)).toBe(true);
    expect(isSelfOrDescendant("outer", "inner", byId)).toBe(false);
  });
});

describe("pickDeepestGroup", () => {
  it("prefers the deepest overlapping group", () => {
    const nodes = [
      groupNode("outer", 0, 0, undefined, 1),
      groupNode("inner", 20, 20, "outer", 2),
    ];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const picked = pickDeepestGroup(["outer", "inner"], "dragged", byId);
    expect(picked).toBe("inner");
  });

  it("excludes self and descendants", () => {
    const nodes = [groupNode("outer"), groupNode("inner", 0, 0, "outer")];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(pickDeepestGroup(["inner"], "outer", byId)).toBeNull();
  });
});

describe("isReparentableOnDrag", () => {
  it("never re-parents the canvas-spanning main_group", () => {
    expect(isReparentableOnDrag(groupNode("main_group"))).toBe(false);
  });

  it("allows leaf nodes and nested groups to be re-parented", () => {
    expect(isReparentableOnDrag(leaf("a", 0, 0))).toBe(true);
    expect(isReparentableOnDrag(groupNode("inner", 0, 0, "main_group"))).toBe(true);
  });

  it("rejects null/undefined drop targets", () => {
    expect(isReparentableOnDrag(null)).toBe(false);
    expect(isReparentableOnDrag(undefined)).toBe(false);
  });
});

describe("resolveDropTarget (dragged groups)", () => {
  it("nests a dragged group into the deepest eligible sibling group", () => {
    const nodes = [
      groupNode("main_group", 0, 0, undefined, 0),
      groupNode("groupA", 50, 50, "main_group", 1),
      groupNode("groupB", 400, 400, "main_group", 1),
    ];
    // groupB dragged over groupA (and main_group); self is excluded by caller.
    const target = resolveDropTarget(nodes[2], nodes, ["main_group", "groupA"], readFixed);
    expect(target).toBe("groupA");
  });

  it("never drops a group into itself or a descendant", () => {
    const nodes = [
      groupNode("outer", 0, 0, "main_group", 1),
      groupNode("inner", 20, 20, "outer", 2),
      groupNode("main_group", 0, 0, undefined, 0),
    ];
    // Dragging "outer": its only overlaps are itself and its descendant "inner",
    // both ineligible. It still overlaps its parent, so it stays in main_group -
    // crucially never nesting into itself or its own child.
    const target = resolveDropTarget(nodes[0], nodes, ["inner"], readFixed);
    expect(target).not.toBe("outer");
    expect(target).not.toBe("inner");
    expect(target).toBe("main_group");
  });

  it("clears the parent when a dragged node leaves all groups", () => {
    const nodes = [
      groupNode("g", 0, 0, undefined, 1),
      // Child far outside the 300x200 group box, so its center is not inside.
      leaf("a", 5000, 5000, "g"),
    ];
    expect(resolveDropTarget(nodes[1], nodes, [], readFixed)).toBeNull();
  });
});

describe("resolveDropTargetAtPoint (cursor-based)", () => {
  it("nests into the deepest group whose bounds contain the cursor", () => {
    const nodes = [
      groupNode("main_group", 0, 0, undefined, 0),
      groupNode("inner", 100, 100, "main_group", 1),
      leaf("beta", 120, 120, "inner"),
    ];
    // Cursor inside inner (deepest).
    expect(resolveDropTargetAtPoint(nodes[2], nodes, { x: 200, y: 200 }, readFixed)).toBe(
      "inner"
    );
  });

  it("re-parents to an outer group when the cursor leaves the inner box", () => {
    const nodes = [
      {
        ...groupNode("main_group", 50, 50, undefined, 0),
        style: "width: 800px; height: 600px;",
      },
      groupNode("inner", 420, 100, "main_group", 1),
      leaf("beta", 60, 70, "inner"),
    ];
    // Inside main (50..850) but left of inner's abs left edge (~470).
    expect(resolveDropTargetAtPoint(nodes[2], nodes, { x: 200, y: 300 }, readFixed)).toBe(
      "main_group"
    );
  });

  it("detaches when the cursor is outside every group including main_group", () => {
    const nodes = [
      {
        ...groupNode("main_group", 50, 50, undefined, 0),
        style: "width: 800px; height: 600px;",
      },
      groupNode("inner", 420, 100, "main_group", 1),
      leaf("beta", 60, 70, "inner"),
    ];
    expect(resolveDropTargetAtPoint(nodes[2], nodes, { x: 900, y: 700 }, readFixed)).toBeNull();
  });

  it("never drops a group into itself or a descendant", () => {
    const nodes = [
      groupNode("main_group", 0, 0, undefined, 0),
      groupNode("outer", 50, 50, "main_group", 1),
      groupNode("inner", 20, 20, "outer", 2),
    ];
    // Cursor inside inner while dragging outer: inner is ineligible (descendant).
    expect(resolveDropTargetAtPoint(nodes[1], nodes, { x: 100, y: 100 }, readFixed)).toBe(
      "main_group"
    );
  });
});

describe("collectGroupDescendants", () => {
  it("returns the group and every nested child in depth-first order", () => {
    const nodes = [
      groupNode("main_group", 0, 0, undefined, 0),
      groupNode("inner", 50, 50, "main_group", 1),
      leaf("a", 10, 10, "inner"),
      leaf("b", 20, 20, "inner"),
    ];
    const ids = collectGroupDescendants("inner", nodes).map((n) => n.id);
    expect(ids).toEqual(["inner", "a", "b"]);
  });
});

describe("liftNodesToRootForDrag", () => {
  it("moves nested nodes to root with absolute coordinates", () => {
    const nodes = [
      groupNode("main_group", 50, 50, undefined, 0),
      groupNode("inner", 100, 80, "main_group", 1),
      leaf("a", 10, 10, "inner"),
    ];
    const lifted = liftNodesToRootForDrag(nodes, ["inner"]);
    const inner = lifted.find((n) => n.id === "inner")!;
    expect(inner.parentId).toBeUndefined();
    expect(inner.position).toEqual({ x: 150, y: 130 });
  });
});

describe("dropPointForDrag / resolveDropTargetForDrag", () => {
  it("uses the cursor for leaf nodes", () => {
    const nodes = [
      {
        ...groupNode("main_group", 50, 50, undefined, 0),
        style: "width: 800px; height: 600px;",
      },
      groupNode("inner", 420, 100, "main_group", 1),
      leaf("beta", 60, 70, "inner"),
    ];
    const cursor = { x: 200, y: 300 };
    expect(dropPointForDrag(nodes[2], nodes, cursor, readFixed)).toEqual(cursor);
    expect(resolveDropTargetForDrag(nodes[2], nodes, cursor, readFixed)).toBe("main_group");
  });

  it("uses the cursor (header position) for group drags so a group drops into the group it is over", () => {
    const nodes = [
      {
        ...groupNode("main_group", 50, 50, undefined, 0),
        style: "width: 800px; height: 600px;",
      },
      groupNode("inner", 100, 100, "main_group", 1),
      // A second sibling group the dragged group's header is released over.
      groupNode("sibling", 400, 100, "main_group", 1),
    ];
    // Dragging `inner` by its header so the cursor lands inside `sibling`.
    const cursor = { x: 460, y: 160 };
    expect(dropPointForDrag(nodes[1], nodes, cursor, readFixed)).toEqual(cursor);
    expect(resolveDropTargetForDrag(nodes[1], nodes, cursor, readFixed)).toBe("sibling");
  });

  it("detaches a dragged group when the cursor leaves every group", () => {
    const nodes = [
      {
        ...groupNode("main_group", 50, 50, undefined, 0),
        style: "width: 800px; height: 600px;",
      },
      groupNode("inner", 100, 100, "main_group", 1),
    ];
    // Cursor far outside main_group's bounds (a header dragged off the canvas group).
    expect(
      resolveDropTargetForDrag(nodes[1], nodes, { x: -500, y: 200 }, readFixed)
    ).toBeNull();
  });
});

describe("groupsContainingPoint", () => {
  it("returns every group whose absolute bounds contain the point", () => {
    const nodes = [
      groupNode("main_group", 0, 0),
      groupNode("inner", 50, 50, "main_group"),
    ];
    expect(groupsContainingPoint({ x: 100, y: 100 }, nodes, readFixed).sort()).toEqual([
      "inner",
      "main_group",
    ]);
    expect(groupsContainingPoint({ x: 10, y: 10 }, nodes, readFixed)).toEqual(["main_group"]);
  });
});

describe("rebaseToParent", () => {
  it("converts absolute coords into parent-relative coords", () => {
    const nodes = [groupNode("g", 100, 50)];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(rebaseToParent({ x: 150, y: 80 }, "g", byId)).toEqual({ x: 50, y: 30 });
  });
});

describe("orderNodesParentFirst", () => {
  it("places every parent before its children regardless of input order", () => {
    // Deliberately out of order: child before its group, nested group before parent.
    const nodes = [
      leaf("a", 0, 0, "nested"),
      groupNode("nested", 0, 0, "main_group"),
      groupNode("main_group"),
      leaf("b", 0, 0, "main_group"),
    ];
    const ordered = orderNodesParentFirst(nodes);
    const indexOf = (id: string) => ordered.findIndex((n) => n.id === id);

    expect(indexOf("main_group")).toBeLessThan(indexOf("nested"));
    expect(indexOf("main_group")).toBeLessThan(indexOf("b"));
    expect(indexOf("nested")).toBeLessThan(indexOf("a"));
    expect(ordered).toHaveLength(nodes.length);
  });

  it("keeps dangling-parent nodes instead of dropping them", () => {
    const nodes = [leaf("orphan", 0, 0, "missing"), groupNode("main_group")];
    const ordered = orderNodesParentFirst(nodes);
    expect(ordered.map((n) => n.id).sort()).toEqual(["main_group", "orphan"]);
  });
});

describe("restackGroups", () => {
  it("assigns main, nested groups, and leaves to distinct bands", () => {
    const nodes = [
      groupNode("main_group"),
      groupNode("nested", 0, 0, "main_group"),
      leaf("a", 0, 0, "nested"),
    ];
    const stacked = restackGroups(nodes);
    const main = stacked.find((n) => n.id === "main_group")!;
    const nested = stacked.find((n) => n.id === "nested")!;
    const leafNode = stacked.find((n) => n.id === "a")!;

    expect(main.zIndex).toBe(Z_MAIN_GROUP);
    expect(nested.zIndex).toBeGreaterThan(main.zIndex!);
    expect(leafNode.zIndex).toBeGreaterThanOrEqual(Z_NODE_BASE);
  });
});
