/**
 * @file dual-editor-tabbar-merge.spec.ts
 * @module chaosnexus-forge/tests/e2e/dual-editor-tabbar-merge
 * @description Playwright end-to-end tests for the dual editor tab and action bar merge behavior.
 */
import { test, expect, type Page } from "@playwright/test";

/**
 * Verifies the merged editor header: the open-tabs strip now lives inside the
 * single file action bar (replacing the old standalone tab row and the
 * redundant `File:` label), Save stays reachable in every view mode, and the
 * markdown view control prevents preview-only from getting stuck.
 */

/** Seeds workbench state and opens a single Rhai tab in the given view mode. */
async function openRhaiTab(page: Page, viewMode: "split" | "code" | "visual"): Promise<void> {
  await page.evaluate((mode) => {
    const state = (window as { _chaosforge_state?: { workbench?: any } })._chaosforge_state;
    if (!state?.workbench) return;
    const wb = state.workbench;
    wb.projectPath = "/mock/workspace";
    wb.activePlugin = { name: "terminal", files: [] };
    wb.fileContents = wb.fileContents || {};
    wb.fileContents["terminal:terminal_tool.rhai"] = "// --- [NODE: main] ---\nfn main() {}\n";
    wb.openTab("terminal", "terminal_tool.rhai");
    const tab = wb.activeTab;
    if (tab) tab.viewMode = mode;
  }, viewMode);
  await page.waitForSelector('[data-testid="editor-action-bar"]', { timeout: 10000 });
}

/** Seeds workbench state and opens a single Markdown tab in the given view mode. */
async function openMarkdownTab(
  page: Page,
  viewMode: "split" | "code" | "preview"
): Promise<void> {
  await page.evaluate((mode) => {
    const state = (window as { _chaosforge_state?: { workbench?: any } })._chaosforge_state;
    if (!state?.workbench) return;
    const wb = state.workbench;
    wb.projectPath = "/mock/workspace";
    wb.activePlugin = { name: "terminal", files: [] };
    wb.fileContents = wb.fileContents || {};
    wb.fileContents["terminal:README.md"] = "# Title\n\nBody text\n";
    wb.openTab("terminal", "README.md");
    const tab = wb.activeTab;
    if (tab) tab.viewMode = mode;
  }, viewMode);
  await page.waitForSelector('[data-testid="editor-action-bar"]', { timeout: 10000 });
}

test.describe("Dual editor tab/action bar merge", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav");
  });

  test("tabs render inside the single action bar (no standalone tab row)", async ({ page }) => {
    await openRhaiTab(page, "split");

    // Exactly one tab strip exists, and it lives inside the action bar.
    await expect(page.locator('[data-testid="editor-tab-strip"]')).toHaveCount(1);
    await expect(
      page.locator('[data-testid="editor-action-bar"] [data-testid="editor-tab-strip"]')
    ).toHaveCount(1);

    // The active tab is present and flagged active.
    const activeTab = page.locator('[data-testid="editor-tab"][data-active="true"]');
    await expect(activeTab).toHaveCount(1);
  });

  test("Save button is reachable in split, code, and visual modes", async ({ page }) => {
    for (const mode of ["split", "code", "visual"] as const) {
      await openRhaiTab(page, mode);
      await expect(page.locator('[data-testid="editor-save-btn"]')).toBeVisible();
    }
  });

  test("rhai view toggle sits at the code-pane divider edge", async ({ page }) => {
    await openRhaiTab(page, "split");

    const toggle = page.locator('[data-testid="editor-view-toggle"]');
    await expect(toggle).toBeVisible();

    // In split, the code-pane toggle and the visual toolbar toggle sit on
    // opposite sides of (and adjacent to) the split handle.
    const handle = page.locator('[data-testid="dual-editor-split-handle"]');
    await expect(handle).toBeVisible();

    const toggleBox = await toggle.boundingBox();
    const handleBox = await handle.boundingBox();
    expect(toggleBox).not.toBeNull();
    expect(handleBox).not.toBeNull();
    if (!toggleBox || !handleBox) return;

    // The code-pane toggle is to the left of the divider.
    expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(handleBox.x + handleBox.width + 4);
  });

  test("Save button stays horizontally stable across rhai view modes", async ({ page }) => {
    await openRhaiTab(page, "split");
    const save = page.locator('[data-testid="editor-save-btn"]');
    const splitBox = await save.boundingBox();
    expect(splitBox).not.toBeNull();
    if (!splitBox) return;

    for (const mode of ["code", "visual"] as const) {
      await openRhaiTab(page, mode);
      const box = await save.boundingBox();
      expect(box).not.toBeNull();
      if (!box) return;
      expect(Math.abs(box.x - splitBox.x)).toBeLessThanOrEqual(4);
    }
  });

  test("markdown uses arrow toggles and preview-only is not stuck", async ({ page }) => {
    await openMarkdownTab(page, "preview");

    // Global bar keeps Save reachable; preview header owns the restore toggle.
    await expect(page.locator('[data-testid="editor-save-btn"]')).toBeVisible();
    const previewToggle = page.locator('[data-testid="markdown-preview-toggle"]');
    await expect(previewToggle).toBeVisible();

    // The preview arrow restores the split layout (editor pane reappears).
    await previewToggle.click();
    await page.waitForSelector('[data-testid="dual-editor-code-pane"]', { timeout: 10000 });
    await expect(page.locator('[data-testid="dual-editor-code-pane"]')).toBeVisible();

    // In split, the editor toolbar exposes its own expand toggle.
    await expect(page.locator('[data-testid="editor-view-toggle"]')).toBeVisible();
  });
});
