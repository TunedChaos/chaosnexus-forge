/**
 * @file visual-node-pins.spec.ts
 * @module chaosnexus-forge/tests/e2e/visual-node-pins
 * @description Playwright end-to-end tests for visual scripting node pins representation.
 */
import { test, expect, type Page } from "@playwright/test";

/**
 * Verifies the Unreal-Engine-Vhai pin treatment on visual-scripting nodes:
 * every pin renders with the `bp-pin` shell, and a pin reports `data-connected`
 * true only when a wire lands on it (filled) versus false when idle (empty).
 *
 * The graph is seeded through a registry-backed node type so the anchored nodes
 * resolve to pin-bearing `rhaiNode`s and the wire survives the parser's
 * active-node filter, all without requiring the live engine manifest.
 */
async function seedWiredGraph(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = (window as { _chaosforge_state?: { workbench?: any } })._chaosforge_state;
    if (!state?.workbench) return;
    const wb = state.workbench;
    const key = "terminal:pins_demo.rhai";

    wb.projectPath = "/mock/workspace";
    wb.activePlugin = { name: "terminal", files: [] };

    // A registry node type with one typed data input (bool) + one typed data
    // output (string). Anchored nodes matching this type render as `rhaiNode`s
    // that expose these pins, letting us assert per-type color roles too.
    wb.nodeRegistry = [
      {
        type_id: "link_node",
        label: "Link",
        inputs: [{ id: "in", label: "In", pin_type: "Data", data_type: "bool" }],
        outputs: [{ id: "out", label: "Out", pin_type: "Data", data_type: "string" }],
        template: "",
      },
    ];

    // Seed content + canvas BEFORE opening so openTab skips the backend fetch
    // (and its canvas reload), preserving this exact topology.
    wb.fileContents = {
      ...wb.fileContents,
      [key]: "// --- [NODE: alpha] ---\n\n// --- [NODE: beta] ---\n",
    };
    wb.canvasContents = {
      ...wb.canvasContents,
      [key]: {
        version: 2,
        nodes: [
          { id: "alpha", label: "alpha", x: 60, y: 80, type: "link_node" },
          { id: "beta", label: "beta", x: 360, y: 80, type: "link_node" },
        ],
        edges: [{ id: "wire1", source: "alpha", target: "beta", sourceHandle: "out", targetHandle: "in" }],
      },
    };

    wb.openTab("terminal", "pins_demo.rhai");
  });

  await page.waitForSelector('[data-testid="flow-node"]', { timeout: 10000 });
}

test.describe("Visual scripting node pins", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav");
  });

  test("renders Vhai pins with connected (filled) vs idle (empty) states", async ({ page }) => {
    await seedWiredGraph(page);

    // Both anchored nodes materialize.
    await expect(page.locator('[data-testid="flow-node"]')).toHaveCount(2);

    // Every pin uses the Vhai shell class.
    const pins = page.locator('[data-testid="flow-pin"]');
    await expect(pins).toHaveCount(4);
    await expect(page.locator('[data-testid="flow-pin"].bp-pin')).toHaveCount(4);

    // The single wire (alpha.out -> beta.in) fills exactly those two pins; the
    // other two (alpha.in, beta.out) stay empty.
    await expect(page.locator('[data-testid="flow-pin"][data-connected="true"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="flow-pin"][data-connected="false"]')).toHaveCount(2);
  });

  test("color-codes pins by type via data-pin-role", async ({ page }) => {
    await seedWiredGraph(page);
    await expect(page.locator('[data-testid="flow-node"]')).toHaveCount(2);

    // Each of the two nodes exposes one bool input + one string output.
    await expect(page.locator('[data-testid="flow-pin"][data-pin-role="bool"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="flow-pin"][data-pin-role="string"]')).toHaveCount(2);

    // The typed color resolves to the fixed --pin-* token, not the generic ring.
    const boolColor = await page
      .locator('[data-testid="flow-pin"][data-pin-role="bool"]')
      .first()
      .evaluate((el) => getComputedStyle(el).borderTopColor);
    // #06b6d4 -> rgb(6, 182, 212)
    expect(boolColor).toBe("rgb(6, 182, 212)");
  });

  test("renders pins in front of the node without clipping the circle", async ({ page }) => {
    await seedWiredGraph(page);
    await expect(page.locator('[data-testid="flow-node"]')).toHaveCount(2);

    const node = page.locator('[data-testid="flow-node"]').first();
    const inputPin = node.locator('[data-testid="flow-pin"][data-pin-role="bool"]').first();

    const nodeBox = await node.boundingBox();
    const pinBox = await inputPin.boundingBox();
    expect(nodeBox).not.toBeNull();
    expect(pinBox).not.toBeNull();

    // A left input pin must extend past the node's left edge (i.e. it is no
    // longer clipped by an overflow-hidden container).
    expect(pinBox!.x).toBeLessThan(nodeBox!.x);
  });
});
