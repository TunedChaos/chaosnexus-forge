// chaosnexus-forge/src/lib/dual_editor/layout_spring.test.ts
//
// Unit tests for the damped spring layout animator.

import { describe, expect, it } from "vitest";
import { animateNodesToPositions, cancelLayoutSpring } from "./layout_spring";

describe("layout_spring animateNodesToPositions", () => {
  it("settles two nodes to their spring targets", async () => {
    cancelLayoutSpring();

    const nodes = [
      { id: "a", position: { x: 0, y: 0 } },
      { id: "b", position: { x: 10, y: 10 } },
    ];
    const targets = new Map([
      ["a", { x: 100, y: 40 }],
      ["b", { x: 220, y: 40 }],
    ]);

    let now = 0;
    const frames: Array<() => void> = [];

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("spring did not settle")), 2000);
      animateNodesToPositions(nodes, targets, {
        now: () => now,
        requestFrame: (cb) => {
          frames.push(() => cb(now));
          return frames.length;
        },
        cancelFrame: () => {},
        reducedMotion: false,
        timeoutMs: 700,
        onFrame: () => {},
        onDone: (settled, cancelled) => {
          clearTimeout(timeout);
          try {
            expect(cancelled).toBe(false);
            expect(settled.find((n) => n.id === "a")?.position).toEqual({ x: 100, y: 40 });
            expect(settled.find((n) => n.id === "b")?.position).toEqual({ x: 220, y: 40 });
            resolve();
          } catch (e) {
            reject(e);
          }
        },
      });

      // Drive the fake rAF clock until settle or timeout budget.
      for (let i = 0; i < 80 && frames.length > 0; i++) {
        now += 16;
        const next = frames.shift();
        next?.();
      }
    });
  });

  it("snaps instantly when reducedMotion is set", async () => {
    cancelLayoutSpring();
    const nodes = [{ id: "a", position: { x: 0, y: 0 } }];
    const targets = new Map([["a", { x: 50, y: 60 }]]);

    await new Promise<void>((resolve) => {
      animateNodesToPositions(nodes, targets, {
        reducedMotion: true,
        onFrame: () => {},
        onDone: (settled) => {
          expect(settled[0].position).toEqual({ x: 50, y: 60 });
          resolve();
        },
      });
    });
  });
});
