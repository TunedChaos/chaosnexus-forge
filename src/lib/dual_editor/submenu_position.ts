/**
 * @module
 * Pure geometry for placing a flyout submenu beside its anchor row the way a
 * native desktop menu does: open toward the side with room (right by default),
 * flip to the other side when it would overflow the viewport, and clamp
 * vertically so it is never pushed off-screen. Kept framework-free so it is
 * unit-testable in isolation from the Svelte component that consumes it.
 */

import type { Rect, Size } from "./group_geometry";

/** Where a flyout submenu should render relative to the viewport. */
export interface FlyoutPlacement {
  /** Viewport-relative left, in CSS pixels (for `position: fixed`). */
  x: number;
  /** Viewport-relative top, in CSS pixels. */
  y: number;
  /** Which side of the anchor the menu opened toward. */
  side: "left" | "right";
  /** Height budget so a tall menu scrolls instead of overflowing the screen. */
  maxHeight: number;
}

/** Tunables for {@link computeFlyoutPosition}. */
export interface FlyoutOptions {
  /** Gap between the anchor edge and the submenu, in pixels. Default `2`. */
  gap?: number;
}

/**
 * Computes the on-screen placement for a submenu anchored to a menu row.
 *
 * Horizontal: prefer opening to the right of the anchor; if the menu would spill
 * past the right viewport edge, flip to the left of the anchor. Either result is
 * finally clamped into `[0, viewport.width - menu.width]` so it can never sit
 * partly off-screen even on very narrow viewports.
 *
 * Vertical: top-align with the anchor, then lift up just enough to keep the
 * bottom on-screen; `maxHeight` reports the remaining vertical budget so callers
 * can cap the menu and let it scroll.
 *
 * @param anchor Viewport-relative rect of the row the submenu flies out from.
 * @param menu Intrinsic size of the submenu (measured or estimated).
 * @param viewport Available viewport size (`innerWidth`/`innerHeight`).
 * @param options Optional gap override.
 * @returns The clamped placement and side the submenu opened toward.
 */
export function computeFlyoutPosition(
  anchor: Rect,
  menu: Size,
  viewport: Size,
  options: FlyoutOptions = {}
): FlyoutPlacement {
  const gap = options.gap ?? 2;

  // Horizontal: open right, flip left when the right side has no room.
  let side: "left" | "right" = "right";
  let x = anchor.x + anchor.width + gap;
  if (x + menu.width > viewport.width) {
    side = "left";
    x = anchor.x - menu.width - gap;
  }

  // Clamp into the viewport regardless of the chosen side.
  const maxX = Math.max(0, viewport.width - menu.width);
  if (x < 0) x = 0;
  else if (x > maxX) x = maxX;

  // Vertical: align with the anchor top, lift up to keep the bottom visible.
  let y = anchor.y;
  if (y + menu.height > viewport.height) {
    y = Math.max(0, viewport.height - menu.height);
  }
  if (y < 0) y = 0;

  const maxHeight = Math.max(0, Math.min(menu.height, viewport.height - y));

  return { x, y, side, maxHeight };
}
