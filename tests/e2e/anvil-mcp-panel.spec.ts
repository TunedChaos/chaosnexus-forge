// chaosnexus-forge/tests/e2e/anvil-mcp-panel.spec.ts
/**
 * E2E: Anvil MCP sidebar server CRUD under MOCK_TAURI (distinct from Mesh).
 */
import { test, expect, type Page } from "@playwright/test";

async function bootApp(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForSelector("nav");
  await page.waitForFunction(() => !!(window as any)._chaosforge_state?.workbench);
  await page.evaluate(() => {
    (window as any)._chaosforge_state.workbench.projectPath = "/mock/workspace";
  });
}

test.describe("Anvil MCP panel", () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
  });

  test("adds, lists, removes a server and apply-restart succeeds", async ({ page }) => {
    await page.getByTestId("sidebar-tab-anvil-mcp").click();
    await expect(page.getByTestId("anvil-mcp-panel")).toBeVisible();

    await page.getByTestId("anvil-mcp-name").fill("docs");
    await page.getByTestId("anvil-mcp-command").fill("npx");
    await page.getByTestId("anvil-mcp-args").fill("-y @modelcontextprotocol/server-memory");
    await page.getByTestId("anvil-mcp-prefix").fill("mem");
    await page.getByTestId("anvil-mcp-save").click();

    await expect(page.getByTestId("anvil-mcp-server-row")).toHaveCount(1);
    await expect(page.getByTestId("anvil-mcp-server-row").first()).toContainText("docs");
    await expect(page.getByTestId("anvil-mcp-server-row").first()).toContainText("prefix: mem");

    await page.getByTestId("anvil-mcp-apply-restart").click();
    await expect(page.getByTestId("anvil-mcp-panel")).toBeVisible();

    await page.getByTestId("anvil-mcp-remove").click();
    await expect(page.getByTestId("anvil-mcp-server-row")).toHaveCount(0);
  });
});
