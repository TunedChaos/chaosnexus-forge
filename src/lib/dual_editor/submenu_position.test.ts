/**
 * @module
 * chaosnexus-forge/src/lib/dual_editor/submenu_position.test.ts
 */

import { describe, it, expect } from "vitest";
import { computeFlyoutPosition } from "./submenu_position";

const VIEWPORT = { width: 1000, height: 800 };
const MENU = { width: 180, height: 240 };

describe("computeFlyoutPosition", () => {
  it("opens to the right of the anchor when there is room", () => {
    const anchor = { x: 100, y: 100, width: 200, height: 30 };
    const p = computeFlyoutPosition(anchor, MENU, VIEWPORT, { gap: 2 });
    expect(p.side).toBe("right");
    expect(p.x).toBe(anchor.x + anchor.width + 2);
    expect(p.y).toBe(anchor.y);
  });

  it("flips to the left when the right side would overflow", () => {
    // Anchor pinned near the right edge: right-open menu would spill off-screen.
    const anchor = { x: 880, y: 100, width: 110, height: 30 };
    const p = computeFlyoutPosition(anchor, MENU, VIEWPORT, { gap: 2 });
    expect(p.side).toBe("left");
    expect(p.x).toBe(anchor.x - MENU.width - 2);
    expect(p.x).toBeGreaterThanOrEqual(0);
  });

  it("never lets the menu extend past the right viewport edge", () => {
    const anchor = { x: 950, y: 100, width: 200, height: 30 };
    const p = computeFlyoutPosition(anchor, MENU, VIEWPORT);
    expect(p.x + MENU.width).toBeLessThanOrEqual(VIEWPORT.width);
    expect(p.x).toBeGreaterThanOrEqual(0);
  });

  it("lifts the menu up and caps maxHeight when it overflows the bottom", () => {
    const anchor = { x: 100, y: 700, width: 200, height: 30 };
    const p = computeFlyoutPosition(anchor, MENU, VIEWPORT);
    expect(p.y).toBe(VIEWPORT.height - MENU.height);
    expect(p.y + MENU.height).toBeLessThanOrEqual(VIEWPORT.height);
    expect(p.maxHeight).toBeLessThanOrEqual(MENU.height);
  });

  it("clamps top and left to zero on tiny viewports", () => {
    const anchor = { x: 5, y: 5, width: 10, height: 10 };
    const tiny = { width: 120, height: 120 };
    const p = computeFlyoutPosition(anchor, MENU, tiny);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.maxHeight).toBeGreaterThanOrEqual(0);
  });
});
