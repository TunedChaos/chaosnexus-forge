// chaosnexus-forge/tests/e2e/canvas-coverage.spec.ts
/**
 * @description End-to-end test suite for visual canvas node coverage, wire rendering, and group header avoidance in ChaosNexus Forge.
 */
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(process.cwd(), "..");

const ILLUSTRATIVE_PLUGINS: { plugin: string; file: string }[] = [
  { plugin: "safe", file: "safe_tool.rhai" },
  { plugin: "st", file: "st_tool.rhai" },
  { plugin: "translation_test", file: "translation_test_tool.rhai" },
  { plugin: "time", file: "time_tool.rhai" },
  { plugin: "dependencies", file: "dependencies_tool.rhai" },
  { plugin: "db_test", file: "db_test_tool.rhai" },
  { plugin: "http_ws_example", file: "http_ws_example_tool.rhai" },
  { plugin: "mcp_bridge_demo", file: "mcp_bridge_demo_tool.rhai" },
  { plugin: "terminal", file: "terminal_tool.rhai" },
  { plugin: "core_plugin_manager", file: "core_plugin_manager_tool.rhai" },
  { plugin: "pkg_manager", file: "pkg_manager_tool.rhai" },
  { plugin: "disabled/crash_test", file: "crash_test_tool.rhai" },
];

/** Seeds a bundled plugin tab with its committed illustrative canvas sidecar. */
async function seedPluginCanvas(
  page: Page,
  pluginName: string,
  filename: string
): Promise<void> {
  const canvas = JSON.parse(
    readFileSync(
      join(REPO_ROOT, "chaosnexus-scripts/plugins", pluginName, ".chaosnexus-forge", `${filename}.canvas.json`),
      "utf8"
    )
  );
  const rhaiContent = readFileSync(
    join(REPO_ROOT, "chaosnexus-scripts/plugins", pluginName, filename),
    "utf8"
  );

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

  test("renders wired safe plugin graph with display-only badge", async ({ page }) => {
    await seedPluginCanvas(page, "safe", "safe_tool.rhai");
    await expect(page.locator('[data-testid="flow-group"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="flow-node"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="canvas-display-only-badge"]')).toBeVisible();
    const edgeCount = await page.getByRole("group", { name: /^Edge from / }).count();
    expect(edgeCount).toBeGreaterThan(0);
  });

  test("renders wired terminal plugin with branch and loop nodes", async ({ page }) => {
    await seedPluginCanvas(page, "terminal", "terminal_tool.rhai");
    await expect(page.locator('[data-testid="canvas-display-only-badge"]')).toBeVisible();
    await expect(page.locator('[data-testid="flow-node"]').first()).toBeVisible();
    await expect(page.getByText("For Each").first()).toBeVisible();
    await expect(page.getByText("Branch").first()).toBeVisible();
    const edgeCount = await page.getByRole("group", { name: /^Edge from / }).count();
    expect(edgeCount).toBeGreaterThan(5);
  });

  test("terminal nodes do not overlap and edges use themed stroke width", async ({ page }) => {
    await seedPluginCanvas(page, "terminal", "terminal_tool.rhai");
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
    await seedPluginCanvas(page, "terminal", "terminal_tool.rhai");
    await assertWiresAvoidGroupHeaders(page);
  });

  test("terminal data wire inherits its source pin type color (array = violet)", async ({
    page,
  }) => {
    await seedPluginCanvas(page, "terminal", "terminal_tool.rhai");

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
    await seedPluginCanvas(page, "terminal", "terminal_tool.rhai");
    const edge = page.getByRole("group", { name: /^Edge from / }).first();
    const path = edge.locator(".svelte-flow__edge-path");

    const before = await path.evaluate((el) => parseFloat(getComputedStyle(el).strokeWidth));
    await edge.hover();
    await page.waitForTimeout(150);
    const after = await path.evaluate((el) => parseFloat(getComputedStyle(el).strokeWidth));
    expect(after).toBeGreaterThan(before);
  });

  for (const { plugin, file } of ILLUSTRATIVE_PLUGINS) {
    test(`${plugin} illustrative nodes do not overlap`, async ({ page }) => {
      await seedPluginCanvas(page, plugin, file);
      await assertNoNodeOverlap(page);
    });
  }
});
