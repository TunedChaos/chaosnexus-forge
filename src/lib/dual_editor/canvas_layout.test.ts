// chaosnexus-forge/src/lib/dual_editor/canvas_layout.test.ts
import { describe, expect, it } from "vitest";
import type { CanvasDocumentV3 } from "./canvas_schema";
import { finalizeCanvasDocumentLayout, mergeCanvasWithExistingLayout } from "./canvas_layout";

describe("canvas_layout", () => {
  it("finalizeCanvasDocumentLayout assigns clean grid positions to unpositioned AST nodes", () => {
    const unpositioned: CanvasDocumentV3 = {
      version: 3,
      nodes: [
        { id: "main_group", label: "Main Logic", x: (undefined as unknown) as number, y: (undefined as unknown) as number, type: "group" },
        { id: "evt_1", label: "on_start", x: (undefined as unknown) as number, y: (undefined as unknown) as number, kind: "event" },
        { id: "fn_2", label: "log_info", x: (undefined as unknown) as number, y: (undefined as unknown) as number, kind: "function" },
      ],
      edges: [
        { id: "w_1", source: "evt_1", target: "fn_2", kind: "exec" },
      ],
    };

    const finalized = finalizeCanvasDocumentLayout(unpositioned);

    const evt1 = finalized.nodes.find((n) => n.id === "evt_1");
    const fn2 = finalized.nodes.find((n) => n.id === "fn_2");
    const group = finalized.nodes.find((n) => n.id === "main_group");

    expect(evt1).toBeDefined();
    expect(fn2).toBeDefined();
    expect(group).toBeDefined();

    expect(Number.isFinite(evt1!.x)).toBe(true);
    expect(Number.isFinite(evt1!.y)).toBe(true);
    expect(Number.isFinite(fn2!.x)).toBe(true);
    expect(Number.isFinite(fn2!.y)).toBe(true);

    // Nodes must not overlap (separate X coordinates or Y coordinates)
    expect(evt1!.x !== fn2!.x || evt1!.y !== fn2!.y).toBe(true);

    // Group must enclose children
    expect(group!.style).toContain("width:");
    expect(group!.style).toContain("height:");
  });

  it("mergeCanvasWithExistingLayout preserves user-dragged node coordinates", () => {
    const existing: CanvasDocumentV3 = {
      version: 3,
      nodes: [
        { id: "main_group", label: "Main Logic", x: 50, y: 50, type: "group", style: "width: 900px; height: 600px;" },
        { id: "evt_1", label: "on_start", x: 250, y: 180, kind: "event" },
        { id: "fn_2", label: "log_info", x: 550, y: 180, kind: "function" },
      ],
      edges: [
        { id: "w_1", source: "evt_1", target: "fn_2", kind: "exec" },
      ],
    };

    // New AST generated from code edit (lacks x/y coordinates)
    const newAst: CanvasDocumentV3 = {
      version: 3,
      nodes: [
        { id: "main_group", label: "Main Logic", x: (undefined as unknown) as number, y: (undefined as unknown) as number, type: "group" },
        { id: "evt_1", label: "on_start", x: (undefined as unknown) as number, y: (undefined as unknown) as number, kind: "event" },
        { id: "fn_2", label: "log_info", x: (undefined as unknown) as number, y: (undefined as unknown) as number, kind: "function" },
        { id: "fn_3", label: "fs_write", x: (undefined as unknown) as number, y: (undefined as unknown) as number, kind: "function" },
      ],
      edges: [
        { id: "w_1", source: "evt_1", target: "fn_2", kind: "exec" },
        { id: "w_2", source: "fn_2", target: "fn_3", kind: "exec" },
      ],
    };

    const merged = mergeCanvasWithExistingLayout(newAst, existing);

    const evt1 = merged.nodes.find((n) => n.id === "evt_1");
    const fn2 = merged.nodes.find((n) => n.id === "fn_2");
    const fn3 = merged.nodes.find((n) => n.id === "fn_3");

    // Existing coordinates must be preserved
    expect(evt1!.x).toBe(250);
    expect(evt1!.y).toBe(180);
    expect(fn2!.x).toBe(550);
    expect(fn2!.y).toBe(180);

    // Newly added node must receive valid, non-colliding coordinates
    expect(fn3).toBeDefined();
    expect(Number.isFinite(fn3!.x)).toBe(true);
    expect(Number.isFinite(fn3!.y)).toBe(true);
    expect(fn3!.x !== fn2!.x || fn3!.y !== fn2!.y).toBe(true);
  });

  it("finalizeCanvasDocumentLayout stacks false branch below true arm (not a 1D strip)", () => {
    const branched: CanvasDocumentV3 = {
      version: 3,
      nodes: [
        { id: "main_group", label: "Main Logic", x: 0, y: 0, type: "group" },
        { id: "evt_1", label: "execute", x: 0, y: 0, kind: "event" },
        { id: "br_1", label: 'os == "windows"', x: 0, y: 0, kind: "branch" },
        { id: "scr_true", label: 'shell = "powershell"', x: 0, y: 0, kind: "script" },
        { id: "scr_false", label: "sys_os", x: 0, y: 0, kind: "script" },
      ],
      edges: [
        { id: "w0", source: "evt_1", target: "br_1", sourceHandle: "then", kind: "exec" },
        { id: "w1", source: "br_1", target: "scr_true", sourceHandle: "true", kind: "exec" },
        { id: "w2", source: "br_1", target: "scr_false", sourceHandle: "false", kind: "exec" },
      ],
    };

    const laid = finalizeCanvasDocumentLayout(branched, { force: true });
    const ys = laid.nodes.filter((n) => n.type !== "group").map((n) => n.y);
    const uniqueYs = new Set(ys);
    expect(uniqueYs.size).toBeGreaterThanOrEqual(2);

    const trueNode = laid.nodes.find((n) => n.id === "scr_true")!;
    const falseNode = laid.nodes.find((n) => n.id === "scr_false")!;
    expect(falseNode.y).toBeGreaterThan(trueNode.y);

    const xs = laid.nodes.filter((n) => n.type !== "group").map((n) => n.x);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    // Must not look like a single horizontal ribbon (width >> height with one Y).
    expect(height).toBeGreaterThan(50);
    expect(width / Math.max(height, 1)).toBeLessThan(20);
  });

  it("force: true recomputes layout even when nodes already have coordinates", () => {
    const preplaced: CanvasDocumentV3 = {
      version: 3,
      nodes: [
        { id: "main_group", label: "Main Logic", x: 50, y: 50, type: "group" },
        { id: "evt_1", label: "on_start", x: 999, y: 999, kind: "event" },
        { id: "fn_2", label: "log_info", x: 1234, y: 999, kind: "function" },
      ],
      edges: [{ id: "w_1", source: "evt_1", target: "fn_2", sourceHandle: "then", kind: "exec" }],
    };

    const laid = finalizeCanvasDocumentLayout(preplaced, { force: true });
    const evt = laid.nodes.find((n) => n.id === "evt_1")!;
    const fn = laid.nodes.find((n) => n.id === "fn_2")!;
    expect(evt.x).not.toBe(999);
    expect(fn.x).toBeGreaterThan(evt.x);
    expect(evt.y).toBe(fn.y);
  });
});
