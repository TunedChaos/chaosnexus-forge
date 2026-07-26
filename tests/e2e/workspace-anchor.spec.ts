// chaosnexus-forge/tests/e2e/workspace-anchor.spec.ts
/**
 * @description End-to-end tests for the workspace anchor field in the registry sidebar.
 */
import { test, expect, type Page } from "@playwright/test";

/**
 * The registry sidebar's "Workspace" section exposes the active anchor path as a
 * read-only, full-width field (easy to select/copy and paste into a file
 * explorer) alongside a one-click Copy button that confirms with "Copied!".
 */
const MOCK_PATH = "/mock/workspace/chaosnexus";

async function seedWorkspace(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForSelector("nav");
  await page.evaluate((path) => {
    const state = (window as { _chaosforge_state?: { workbench?: any } })._chaosforge_state;
    if (!state?.workbench) return;
    state.workbench.projectPath = path;
    state.workbench.activePlugin = { name: "terminal", files: [] };
  }, MOCK_PATH);
  await page.waitForSelector('[data-testid="workspace-anchor-input"]', { timeout: 10000 });
}

test.describe("Workspace anchor field", () => {
  test("shows the anchor in a non-editable copyable input", async ({ page }) => {
    await seedWorkspace(page);

    const input = page.getByTestId("workspace-anchor-input");
    await expect(input).toHaveValue(MOCK_PATH);
    await expect(input).not.toHaveAttribute("readonly");
  });

  test("copy button copies the path and confirms", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await seedWorkspace(page);

    const copyBtn = page.getByTestId("workspace-anchor-copy");
    await expect(copyBtn).toHaveText("Copy");
    await copyBtn.click();
    await expect(copyBtn).toHaveText("Copied!");

    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe(MOCK_PATH);
  });

  test("long paths scroll to show the end and cannot be edited", async ({ page }) => {
    const longPath =
      "/home/user/projects/very/deep/nested/plugins/folder/chaosnexus-workspace-tail";
    await page.goto("/");
    await page.waitForSelector("nav");
    await page.evaluate((path) => {
      const state = (window as { _chaosforge_state?: { workbench?: any } })._chaosforge_state;
      if (!state?.workbench) return;
      state.workbench.projectPath = path;
      state.workbench.activePlugin = { name: "terminal", files: [] };
    }, longPath);
    const input = page.getByTestId("workspace-anchor-input");
    await expect(input).toHaveValue(longPath);

    // Overflow should pin the viewport on the path tail (folder name), not the prefix.
    await expect
      .poll(() => input.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(0);

    await input.focus();
    await input.press("End");
    const atEnd = await input.evaluate((el) => (el as HTMLInputElement).selectionStart);
    expect(atEnd).toBe(longPath.length);

    await input.press("ArrowLeft");
    await expect
      .poll(() => input.evaluate((el) => (el as HTMLInputElement).selectionStart))
      .toBe(longPath.length - 1);

    await input.press("Backspace");
    await input.press("Delete");
    await expect(input).toHaveValue(longPath);
  });
});
