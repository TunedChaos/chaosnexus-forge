// chaosnexus-forge/tests/e2e/dual-editor-viewmodes.spec.ts
//
// Phase 7 (M7) coverage for the Rhai dual editor view modes: a `.rhai` buffer
// must render the visual graph, and the code/split/visual toggles must move the
// panes correctly. These guard the visual-scripting surface the recent group
// containment + resize work depends on.
import { test, expect, type Page } from "@playwright/test";

const PLUGIN = "terminal";
const FILE = "viewmodes_demo.rhai";
const KEY = `${PLUGIN}:${FILE}`;

/** Seeds a Rhai tab with a single grouped node and opens it in split mode. */
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
      wb.setTabViewMode(plugin, file, "split");
    },
    { plugin: PLUGIN, file: FILE, key: KEY }
  );

  await page.waitForSelector('[data-testid="dual-editor-code-pane"]', { timeout: 10000 });
}

test.describe("Dual editor view modes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav");
    await seedRhaiTab(page);
  });

  test("renders the visual graph alongside the code pane in split mode", async ({ page }) => {
    await expect(page.locator('[data-testid="dual-editor-code-pane"]')).toBeVisible();
    await expect(page.locator(".svelte-flow")).toBeVisible();
    // The seeded group + node must materialize on the canvas.
    await expect(page.locator('[data-group-id="main_group"]')).toBeVisible();
    await expect(page.locator('.svelte-flow__node[data-id="alpha"]')).toBeVisible();
  });

  test("the code toggle collapses the visual pane and back", async ({ page }) => {
    // Code-only: the flow canvas is gone, the code pane fills the width.
    await page.locator('[data-testid="editor-view-toggle"]').click();
    await expect(page.locator(".svelte-flow")).toHaveCount(0);
    await expect(page.locator('[data-testid="dual-editor-code-pane"]')).toBeVisible();

    // Back to split: both panes return.
    await page.locator('[data-testid="editor-view-toggle"]').click();
    await expect(page.locator(".svelte-flow")).toBeVisible();
    await expect(page.locator('[data-testid="dual-editor-code-pane"]')).toBeVisible();
  });

  test("the visual toggle expands to visual-only and back to split", async ({ page }) => {
    // Visual-only: the code pane is hidden, the canvas remains.
    await page.locator('[data-testid="visual-view-toggle"]').click();
    await expect(page.locator('[data-testid="dual-editor-code-pane"]')).toHaveCount(0);
    await expect(page.locator(".svelte-flow")).toBeVisible();

    // Back to split: the code pane returns.
    await page.locator('[data-testid="visual-view-toggle"]').click();
    await expect(page.locator('[data-testid="dual-editor-code-pane"]')).toBeVisible();
    await expect(page.locator(".svelte-flow")).toBeVisible();
  });
});
