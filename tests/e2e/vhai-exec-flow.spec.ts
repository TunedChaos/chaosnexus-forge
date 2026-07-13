// chaosnexus-forge/tests/e2e/vhai-exec-flow.spec.ts
import { test, expect, type Page } from "@playwright/test";

/**
 * Seeds a v3 canvas with Event -> Set Variable exec chain and verifies
 * white exec pins render on catalog-driven Vhai nodes.
 */
async function seedVhaiGraph(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = (window as { _chaosforge_state?: { workbench?: any } })._chaosforge_state;
    if (!state?.workbench) return;
    const wb = state.workbench;
    const key = "terminal:vhai_demo.rhai";

    wb.projectPath = "/mock/workspace";
    wb.activePlugin = { name: "terminal", files: [] };
    wb.nodeRegistry = [];

    wb.fileContents = {
      ...wb.fileContents,
      [key]: "// Vhai exec-flow demo\n",
    };
    wb.canvasContents = {
      ...wb.canvasContents,
      [key]: {
        version: 3,
        nodes: [
          {
            id: "evt1",
            label: "on_plugin_start",
            x: 120,
            y: 80,
            kind: "event",
            eventId: "on_plugin_start",
          },
          {
            id: "set1",
            label: "Set Variable",
            x: 120,
            y: 220,
            kind: "set-variable",
            varName: "count",
          },
        ],
        edges: [
          {
            id: "exec1",
            source: "evt1",
            target: "set1",
            sourceHandle: "then",
            targetHandle: "exec_in",
            kind: "exec",
          },
        ],
      },
    };

    wb.openTab("terminal", "vhai_demo.rhai");
  });

  await page.waitForSelector('[data-testid="flow-node"]', { timeout: 10000 });
}

test.describe("Vhai exec flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav");
  });

  test("renders exec pins on event and set-variable catalog nodes", async ({ page }) => {
    await seedVhaiGraph(page);

    await expect(page.locator('[data-testid="flow-node"]')).toHaveCount(2);
    // Event: 1 exec out; Set Variable: exec in + exec out
    await expect(page.locator('[data-testid="flow-exec-pin"]')).toHaveCount(3);
    await expect(page.locator('[data-testid="flow-exec-pin"][data-connected="true"]')).toHaveCount(
      2
    );
  });

  test("tags catalog nodes with their logic category for color + icon", async ({ page }) => {
    await seedVhaiGraph(page);

    // Each node's title bar carries data-category (drives the --cat-* hue + icon).
    // Distinct categories prove the visual separation is wired per node type.
    await expect(page.locator('[data-category="event"]')).toHaveCount(1);
    await expect(page.locator('[data-category="variable"]')).toHaveCount(1);
  });
});
