// chaosnexus-forge/src/lib/dual_editor/layout_spring.ts
//
// Damped spring animator that settles Svelte Flow node positions toward layout
// targets after regenerate / auto-layout (bubble-map feel without free force graphs).

export type SpringPoint = { x: number; y: number };

export type SpringTargets = Map<string, SpringPoint>;

export interface SpringNodeLike {
  id: string;
  position: SpringPoint;
}

export interface AnimateNodesOptions {
  /** Called each frame with positions cloned onto the input node list. */
  onFrame: (nodes: SpringNodeLike[]) => void;
  /** Called once when settled or cancelled. */
  onDone?: (nodes: SpringNodeLike[], cancelled: boolean) => void;
  /** Spring stiffness (higher = snappier). Default 0.18. */
  stiffness?: number;
  /** Velocity damping (higher = less bounce). Default 0.72. */
  damping?: number;
  /** Stop when every node is within this many px of its target. Default 0.5. */
  epsilon?: number;
  /** Hard timeout in ms. Default 700. */
  timeoutMs?: number;
  /**
   * When true (or when the environment prefers reduced motion), snap to targets
   * in one frame instead of springing.
   */
  reducedMotion?: boolean;
  /** Injected clock for tests (defaults to performance.now / Date.now). */
  now?: () => number;
  /** Injected rAF for tests. */
  requestFrame?: (cb: FrameRequestCallback) => number;
  /** Injected cancel for tests. */
  cancelFrame?: (id: number) => void;
}

export interface SpringAnimationHandle {
  /** Cancels the in-flight animation (onDone fires with cancelled=true). */
  cancel: () => void;
}

let activeHandle: SpringAnimationHandle | null = null;

/** Cancels any in-flight layout spring (safe no-op when idle). */
export function cancelLayoutSpring(): void {
  activeHandle?.cancel();
  activeHandle = null;
}

function defaultNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function prefersReducedMotion(): boolean {
  if (typeof matchMedia !== "function") return false;
  try {
    return matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Animates node positions toward `targetsById` with a damped spring.
 * Nodes missing from the target map keep their current position.
 *
 * @param nodes Current flow nodes (positions are the spring start).
 * @param targetsById Destination positions keyed by node id.
 * @param options Frame callbacks and spring tuning.
 * @returns Handle that can cancel the animation.
 */
export function animateNodesToPositions(
  nodes: SpringNodeLike[],
  targetsById: SpringTargets,
  options: AnimateNodesOptions
): SpringAnimationHandle {
  cancelLayoutSpring();

  const stiffness = options.stiffness ?? 0.18;
  const damping = options.damping ?? 0.72;
  const epsilon = options.epsilon ?? 0.5;
  const timeoutMs = options.timeoutMs ?? 700;
  const now = options.now ?? defaultNow;
  const requestFrame =
    options.requestFrame ??
    ((cb) =>
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(cb)
        : (setTimeout(() => cb(now()), 16) as unknown as number));
  const cancelFrame =
    options.cancelFrame ??
    ((id) => {
      if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
      else clearTimeout(id);
    });

  const working = nodes.map((n) => ({
    id: n.id,
    position: { x: n.position.x, y: n.position.y },
  }));
  const velocity = new Map<string, SpringPoint>();
  for (const n of working) {
    velocity.set(n.id, { x: 0, y: 0 });
  }

  let frameId = 0;
  let cancelled = false;
  let finished = false;
  const started = now();

  const finish = (wasCancelled: boolean) => {
    if (finished) return;
    finished = true;
    if (activeHandle !== null) activeHandle = null;
    options.onDone?.(working, wasCancelled);
  };

  const handle: SpringAnimationHandle = {
    cancel: () => {
      if (finished) return;
      cancelled = true;
      cancelFrame(frameId);
      finish(true);
    },
  };

  const snapToTargets = () => {
    for (const n of working) {
      const t = targetsById.get(n.id);
      if (t) {
        n.position.x = t.x;
        n.position.y = t.y;
      }
    }
    options.onFrame(working.map((n) => ({ id: n.id, position: { ...n.position } })));
    finish(false);
  };

  if (options.reducedMotion ?? prefersReducedMotion()) {
    activeHandle = handle;
    // Replace cancel so we do not double-finish after snap.
    handle.cancel = () => {
      cancelled = true;
    };
    snapToTargets();
    return handle;
  }

  const tick = () => {
    if (cancelled) {
      finish(true);
      return;
    }

    const elapsed = now() - started;
    let maxErr = 0;

    for (const n of working) {
      const t = targetsById.get(n.id);
      if (!t) continue;
      const v = velocity.get(n.id)!;
      const ax = (t.x - n.position.x) * stiffness;
      const ay = (t.y - n.position.y) * stiffness;
      v.x = (v.x + ax) * damping;
      v.y = (v.y + ay) * damping;
      n.position.x += v.x;
      n.position.y += v.y;
      maxErr = Math.max(maxErr, Math.abs(t.x - n.position.x), Math.abs(t.y - n.position.y));
    }

    options.onFrame(working.map((n) => ({ id: n.id, position: { ...n.position } })));

    if (maxErr < epsilon || elapsed >= timeoutMs) {
      // Snap residual error so sidecar coords are exact.
      for (const n of working) {
        const t = targetsById.get(n.id);
        if (t) {
          n.position.x = t.x;
          n.position.y = t.y;
        }
      }
      options.onFrame(working.map((n) => ({ id: n.id, position: { ...n.position } })));
      finish(false);
      return;
    }

    frameId = requestFrame(tick);
  };

  activeHandle = handle;
  frameId = requestFrame(tick);
  return handle;
}
