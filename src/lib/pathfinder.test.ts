// chaosnexus-forge/src/lib/pathfinder.test.ts

import { describe, test, expect } from "vitest";
import { findSmartPath, type Obstacle } from "./pathfinder";

describe("A* Smart Wire Pathfinder", () => {
  test("returns direct line when no obstacles are present", () => {
    const path = findSmartPath(0, 0, 100, 100, []);
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 100, y: 100 });
  });

  test("routes around a blocking obstacle", () => {
    // Obstacle blocks the direct path from (0, 10) to (100, 10)
    const obstacles: Obstacle[] = [
      { x: 30, y: -10, width: 40, height: 40 }, // Center blocks y=0-30, x=30-70
    ];

    const path = findSmartPath(0, 10, 100, 10, obstacles);
    expect(path.length).toBeGreaterThan(2); // Should have routed around
    expect(path[0]).toEqual({ x: 0, y: 10 });
    expect(path[path.length - 1]).toEqual({ x: 100, y: 10 });

    // Ensure none of the generated path segments cross deep inside the obstacle
    for (const pt of path) {
      const isInside = pt.x > 35 && pt.x < 65 && pt.y > -5 && pt.y < 25;
      expect(isInside).toBe(false);
    }
  });

  test("returns simple direct path if start and end are identical", () => {
    const path = findSmartPath(50, 50, 50, 50, []);
    expect(path).toHaveLength(2);
    expect(path[0]).toEqual({ x: 50, y: 50 });
    expect(path[1]).toEqual({ x: 50, y: 50 });
  });
});
