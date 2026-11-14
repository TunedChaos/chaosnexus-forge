// chaosnexus-forge/tests/e2e/canvas-coverage.spec.ts
/**
 * @description End-to-end test suite for visual canvas node coverage, wire rendering, and group header avoidance in ChaosNexus Forge.
 */
import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(process.cwd(), "..");

/** Public Scripts example + Forge-only terminal fixture. */
const ILLUSTRATIVE_PLUGINS: { plugin: string; file: string; base: "scripts" | "fixtures" }[] = [
  { plugin: "translation_test", file: "translation_test_tool.rhai", base: "scripts" },
  { plugin: "terminal", file: "terminal_tool.rhai", base: "fixtures" },
];

function pluginRoot(pluginName: string, base: "scripts" | "fixtures"): string {
  if (base === "fixtures") {
    return join(REPO_ROOT, "chaosnexus-forge/fixtures/scripts/plugins", pluginName);
  }
  return join(REPO_ROOT, "chaosnexus-scripts/plugins", pluginName);
}

/** Seeds a bundled plugin tab with its committed illustrative canvas sidecar. */
async function seedPluginCanvas(
  page: Page,
  pluginName: string,
  filename: string,
  base: "scripts" | "fixtures" = "scripts"
): Promise<void> {
  const root = pluginRoot(pluginName, base);
  const canvasPath = join(root, ".chaosnexus-forge", `${filename}.canvas.json`);
  const rhaiPath = join(root, filename);
  if (!existsSync(canvasPath)) {
    throw new Error(`Missing canvas sidecar: ${canvasPath}`);
  }
  const canvas = JSON.parse(readFileSync(canvasPath, "utf8"));
  const rhaiContent = readFileSync(rhaiPath, "utf8");

  await page.evaluate(
    ({ pluginName, filename, rhaiContent, canvas }) => {
      const state = (window as { _chaosforge_state?: { workbench?: any } })._chaosforge_state;
      if (!state?.workbench) return;
      const wb = state.workbench;
      const key = `${pluginName}:${filename}`;

      wb.projectPath = "/mock/workspace";
      wb.activePlugin = { name: pluginName, files: [] };
      wb.nodeRegistry = [];
      wb.fileContents = {
        ...wb.fileContents,
        [key]: rhaiContent,
      };
      wb.canvasContents = {
        ...wb.canvasContents,
        [key]: canvas,
      };
      wb.openTab(pluginName, filename);
    },
    { pluginName, filename, rhaiContent, canvas }
  );

  await page.waitForSelector('[data-testid="flow-node"]', { timeout: 10000 });
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function boxesOverlap(a: Box, b: Box, tolerance = 4): boolean {
  return (
    a.x + a.w - tolerance > b.x &&
    b.x + b.w - tolerance > a.x &&
    a.y + a.h - tolerance > b.y &&
    b.y + b.h - tolerance > a.y
  );
}

async function assertNoNodeOverlap(page: Page): Promise<void> {
  const boxes: Box[] = await page.locator('[data-testid="flow-node"]').evaluateAll((nodes) =>
    nodes.map((n) => {
      const r = n.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    })
  );

  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      expect(boxesOverlap(boxes[i], boxes[j])).toBe(false);
    }
  }
}

async function assertWiresAvoidGroupHeaders(page: Page): Promise<void> {
  const crossing = await page.evaluate(() => {
    const header = document.querySelector('[data-testid="flow-group-header"]');
    if (!header) return false;
    const rect = header.getBoundingClientRect();
    const paths = document.querySelectorAll<SVGPathElement>(
      ".svelte-flow__edge.cf-edge .svelte-flow__edge-path"
    );

    function pointInRect(x: number, y: number, r: DOMRect): boolean {
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }

    for (const path of paths) {
      const svg = path.ownerSVGElement;
      const ctm = path.getScreenCTM();
      if (!svg || !ctm) continue;
      const len = path.getTotalLength();
      for (let i = 0; i <= 40; i++) {
        const p = path.getPointAtLength((i / 40) * len);
        const pt = svg.createSVGPoint();
        pt.x = p.x;
        pt.y = p.y;
        const screen = pt.matrixTransform(ctm);
        if (pointInRect(screen.x, screen.y, rect)) {
          return true;
        }
      }
    }
    return false;
  });

  expect(crossing).toBe(false);
}

test.describe("Bundled illustrative canvas coverage", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav");
  });

  test("renders wired translation_test plugin graph", async ({ page }) => {
    await seedPluginCanvas(page, "translation_test", "translation_test_tool.rhai", "scripts");
    await expect(page.locator('[data-testid="flow-node"]').first()).toBeVisible();
  });

  test("renders wired terminal fixture with branch and loop nodes", async ({ page }) => {
    await seedPluginCanvas(page, "terminal", "terminal_tool.rhai", "fixtures");
    await expect(page.locator('[data-testid="flow-node"]').first()).toBeVisible();
    await expect(page.getByText("For Each").first()).toBeVisible();
    await expect(page.getByText("Branch").first()).toBeVisible();
    const edgeCount = await page.getByRole("group", { name: /^Edge from / }).count();
    expect(edgeCount).toBeGreaterThan(5);
  });

  test("terminal nodes do not overlap and edges use themed stroke width", async ({ page }) => {
    await seedPluginCanvas(page, "terminal", "terminal_tool.rhai", "fixtures");
    await assertNoNodeOverlap(page);

    const strokeWidth = await page
      .locator(".svelte-flow__edge.cf-edge .svelte-flow__edge-path")
      .first()
      .evaluate((el) => parseFloat(getComputedStyle(el).strokeWidth));
    expect(strokeWidth).toBeGreaterThanOrEqual(3);

    const connectedPins = await page.locator('[data-testid="flow-exec-pin"][data-connected="true"]').count();
    expect(connectedPins).toBeGreaterThan(0);
  });

  test("terminal wires avoid the Main Logic group header band", async ({ page }) => {
    await seedPluginCanvas(page, "terminal", "terminal_tool.rhai", "fixtures");
    await assertWiresAvoidGroupHeaders(page);
  });

  test("terminal data wire inherits its source pin type color (array = violet)", async ({
    page,
  }) => {
    await seedPluginCanvas(page, "terminal", "terminal_tool.rhai", "fixtures");

    // The `cfg.commands.keys()` Script block returns an array; its data wire into
    // the For Each `items` pin must paint with the --pin-array token (#8b5cf6),
    // not the generic gray, proving per-node type drives the wire color.
    const strokes = await page
      .locator(".svelte-flow__edge.cf-edge .svelte-flow__edge-path")
      .evaluateAll((paths) => paths.map((p) => getComputedStyle(p).stroke));

    expect(strokes.length).toBeGreaterThan(0);
    expect(strokes).toContain("rgb(139, 92, 246)");
  });

  test("edge hover thickens connector stroke", async ({ page }) => {
    await seedPluginCanvas(page, "terminal", "terminal_tool.rhai", "fixtures");
    const edge = page.getByRole("group", { name: /^Edge from / }).first();
    const path = edge.locator(".svelte-flow__edge-path");

    const before = await path.evaluate((el) => parseFloat(getComputedStyle(el).strokeWidth));
    await edge.hover();
    await page.waitForTimeout(150);
    const after = await path.evaluate((el) => parseFloat(getComputedStyle(el).strokeWidth));
    expect(after).toBeGreaterThan(before);
  });

  for (const { plugin, file, base } of ILLUSTRATIVE_PLUGINS) {
    test(`${plugin} illustrative nodes do not overlap`, async ({ page }) => {
      await seedPluginCanvas(page, plugin, file, base);
      await assertNoNodeOverlap(page);
    });
  }
});
