// chaosnexus-forge/tests/e2e/node-palette.spec.ts
/**
 * E2E: open Node Palette, search, and insert a catalog/native item.
 */
import { test, expect, type Page } from "@playwright/test";

const PLUGIN = "terminal";
const FILE = "palette_demo.rhai";
const KEY = `${PLUGIN}:${FILE}`;

async function seedRhaiTab(page: Page): Promise<void> {
  await page.evaluate(
    ({ plugin, file, key }) => {
      const wb = (window as any)._chaosforge_state!.workbench!;
      wb.projectPath = "/mock/workspace";
      wb.activePlugin = { name: plugin, files: [] };
      wb.nodeRegistry = [];
      wb.fileContents = {
        ...wb.fileContents,
        [key]: "// --- [NODE: alpha] ---\nfn alpha() {}\n",
      };
      wb.canvasContents = {
        ...wb.canvasContents,
        [key]: {
          version: 2,
          nodes: [
            {
              id: "main_group",
              label: "Main Logic",
              x: 50,
              y: 50,
              type: "group",
              style: "width: 800px; height: 600px;",
            },
            { id: "alpha", label: "alpha", x: 120, y: 140, parentId: "main_group" },
          ],
          edges: [],
        },
      };
      wb.openTab(plugin, file);
      wb.setTabViewMode(plugin, file, "visual");
    },
    { plugin: PLUGIN, file: FILE, key: KEY },
  );

  await page.waitForSelector('[data-testid="visual-canvas-surface"]', { timeout: 10000 });
}

test.describe("Node palette", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav");
    await page.waitForFunction(() => !!(window as any)._chaosforge_state?.workbench);
    await seedRhaiTab(page);
  });

  test("toggles palette, filters, and inserts Blank Anchor", async ({ page }) => {
    const before = await page.locator(".svelte-flow__node").count();

    await page.getByTestId("visual-palette-toggle").click();
    await expect(page.getByTestId("node-palette-panel")).toBeVisible();

    await page.getByTestId("node-palette-search").fill("Blank Anchor");
    const item = page.locator('[data-testid="node-palette-item"][data-palette-id="anchor:new"]');
    await expect(item).toBeVisible();
    await item.click();

    await expect
      .poll(async () => page.locator(".svelte-flow__node").count())
      .toBeGreaterThan(before);

    await page.getByTestId("node-palette-close").click();
    await expect(page.getByTestId("node-palette-panel")).toBeHidden();
  });
});
