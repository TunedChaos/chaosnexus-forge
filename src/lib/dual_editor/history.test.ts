/**
 * @module
 * chaosnexus-forge/src/lib/dual_editor/history.test.ts
 */
import { describe, it, expect } from "vitest";
import { EditorHistory, MAX_HISTORY, type EditorSnapshot } from "./history";

const snap = (content: string, canvas = ""): EditorSnapshot => ({ content, canvas });

describe("EditorHistory", () => {
  it("starts empty with no undo/redo", () => {
    const h = new EditorHistory();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
    expect(h.current()).toBeNull();
  });

  it("treats the first push as the baseline (no undo yet)", () => {
    const h = new EditorHistory();
    expect(h.push(snap("a"))).toBe(true);
    expect(h.current()).toEqual(snap("a"));
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });

  it("ignores a push identical to the current state", () => {
    const h = new EditorHistory();
    h.push(snap("a", "c1"));
    expect(h.push(snap("a", "c1"))).toBe(false);
    expect(h.canUndo()).toBe(false);
  });

  it("distinguishes content vs canvas changes", () => {
    const h = new EditorHistory();
    h.push(snap("a", "c1"));
    expect(h.push(snap("a", "c2"))).toBe(true); // canvas-only change
    expect(h.push(snap("b", "c2"))).toBe(true); // content-only change
    expect(h.canUndo()).toBe(true);
  });

  it("undoes and redoes through the stack", () => {
    const h = new EditorHistory();
    h.push(snap("a"));
    h.push(snap("b"));
    h.push(snap("c"));

    expect(h.undo()).toEqual(snap("b"));
    expect(h.undo()).toEqual(snap("a"));
    expect(h.undo()).toBeNull();
    expect(h.canUndo()).toBe(false);

    expect(h.redo()).toEqual(snap("b"));
    expect(h.redo()).toEqual(snap("c"));
    expect(h.redo()).toBeNull();
    expect(h.canRedo()).toBe(false);
  });

  it("truncates the redo branch when pushing after an undo", () => {
    const h = new EditorHistory();
    h.push(snap("a"));
    h.push(snap("b"));
    h.push(snap("c"));
    h.undo(); // back to b
    expect(h.canRedo()).toBe(true);

    h.push(snap("d")); // new branch from b
    expect(h.canRedo()).toBe(false);
    expect(h.current()).toEqual(snap("d"));
    expect(h.undo()).toEqual(snap("b"));
  });

  it("reset clears the stack to a single baseline", () => {
    const h = new EditorHistory();
    h.push(snap("a"));
    h.push(snap("b"));
    h.reset(snap("fresh"));
    expect(h.current()).toEqual(snap("fresh"));
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });

  it("caps retained history at MAX_HISTORY, dropping the oldest", () => {
    const h = new EditorHistory();
    for (let i = 0; i < MAX_HISTORY + 20; i++) h.push(snap(`s${i}`));
    // Walk all the way back; the oldest survivors were trimmed.
    let steps = 0;
    while (h.undo()) steps++;
    expect(steps).toBe(MAX_HISTORY - 1);
    expect(h.current()).toEqual(snap(`s20`));
  });
});
