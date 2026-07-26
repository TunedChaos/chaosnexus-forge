/**
 * @module
 * Undo/redo history for the visual scripting editor. The graph derives from two
 * persistent sources of truth - the Rhai source text and the canvas sidecar
 * (positions, groups, sizes) - so a snapshot captures BOTH. Restoring a snapshot
 * rewrites those sources and lets the existing reactive parse pass rebuild the
 * node/edge graph, giving a single undo/redo stack that covers code edits AND
 * layout operations (move, group, resize, delete) "like the text editor".
 */

/** An atomic editor state: the Rhai source plus the serialized canvas sidecar. */
export interface EditorSnapshot {
  /** Rhai source text for the active tab. */
  content: string;
  /** Serialized canvas sidecar (JSON string) for cheap structural equality. */
  canvas: string;
}

/** Upper bound on retained snapshots so a long session cannot grow unbounded. */
export const MAX_HISTORY = 100;

/**
 * A linear undo/redo stack of {@link EditorSnapshot}s with a movable cursor.
 *
 * Recording past the cursor truncates the redo branch (standard editor
 * semantics), and an identical push is a no-op so re-applying a restored
 * snapshot never spawns a duplicate entry. One instance is kept per open tab.
 */
export class EditorHistory {
  private stack: EditorSnapshot[] = [];
  /** Index of the snapshot describing the current on-screen state (-1 = empty). */
  private cursor = -1;

  /** Replaces the entire stack with a single baseline snapshot. */
  reset(snapshot: EditorSnapshot): void {
    this.stack = [snapshot];
    this.cursor = 0;
  }

  /** The snapshot describing the current state, or null before any baseline. */
  current(): EditorSnapshot | null {
    return this.cursor >= 0 ? this.stack[this.cursor] : null;
  }

  /** True when `snapshot` differs from the current top (content or canvas). */
  private differs(snapshot: EditorSnapshot): boolean {
    const top = this.current();
    return !top || top.content !== snapshot.content || top.canvas !== snapshot.canvas;
  }

  /**
   * Records a new snapshot, dropping any redo branch ahead of the cursor.
   * No-ops (returning false) when the snapshot matches the current state, so
   * applying a restored snapshot - which re-emits the same content/canvas - does
   * not corrupt the stack. Trims the oldest entry past {@link MAX_HISTORY}.
   *
   * @returns true when a new entry was actually appended.
   */
  push(snapshot: EditorSnapshot): boolean {
    if (this.cursor < 0) {
      this.reset(snapshot);
      return true;
    }
    if (!this.differs(snapshot)) return false;

    this.stack = this.stack.slice(0, this.cursor + 1);
    this.stack.push(snapshot);
    if (this.stack.length > MAX_HISTORY) {
      this.stack.shift();
    }
    this.cursor = this.stack.length - 1;
    return true;
  }

  /** True when there is a prior state to step back to. */
  canUndo(): boolean {
    return this.cursor > 0;
  }

  /** True when there is a forward state to step to. */
  canRedo(): boolean {
    return this.cursor >= 0 && this.cursor < this.stack.length - 1;
  }

  /** Steps the cursor back one and returns that snapshot (or null if at start). */
  undo(): EditorSnapshot | null {
    if (!this.canUndo()) return null;
    this.cursor -= 1;
    return this.stack[this.cursor];
  }

  /** Steps the cursor forward one and returns that snapshot (or null if at end). */
  redo(): EditorSnapshot | null {
    if (!this.canRedo()) return null;
    this.cursor += 1;
    return this.stack[this.cursor];
  }
}
