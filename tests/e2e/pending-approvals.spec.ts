// chaosnexus-forge/tests/e2e/pending-approvals.spec.ts
/**
 * @description End-to-end test suite for managing pending plugin capability approvals.
 */
import { test, expect, type Page } from "@playwright/test";

type SeededWindow = Window & {
  _chaosforge_state?: {
    workbench?: { projectPath: string };
    seedMockPending?: (name: string) => Promise<void>;
  };
};

async function bootWithPending(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForSelector("nav");
  await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.seedMockPending);

  await page.evaluate(async () => {
    const hook = (window as SeededWindow)._chaosforge_state!;
    hook.workbench!.projectPath = "/mock/workspace";
    await hook.seedMockPending!("e2e_pending_plugin");
  });

  await page.waitForSelector('[data-testid="pending-approvals-panel"]');
}

test.describe("Pending plugin approvals", () => {
  test("shows pending count and opens review modal", async ({ page }) => {
    await bootWithPending(page);

    await expect(page.getByTestId("pending-approvals-panel")).toBeVisible();
    await expect(page.getByTestId("pending-count")).toHaveText("1");

    await page.getByTestId("pending-item-e2e_pending_plugin").click();
    await expect(page.getByTestId("pending-review-modal")).toBeVisible();
    await expect(page.getByTestId("pending-rhai-source")).toContainText("execute");
    await expect(page.getByTestId("pending-cap-shell")).toBeChecked();
  });

  test("approve removes pending item from list", async ({ page }) => {
    await bootWithPending(page);

    await page.getByTestId("pending-item-e2e_pending_plugin").click();
    await page.getByTestId("pending-review-approve").click();
    await expect(page.getByTestId("pending-review-modal")).toBeHidden();
    await expect(page.getByTestId("pending-approvals-panel")).toBeHidden();
  });

  test("reject from list removes pending item", async ({ page }) => {
    await bootWithPending(page);

    await page.getByTestId("pending-reject-e2e_pending_plugin").click();
    await expect(page.getByTestId("pending-approvals-panel")).toBeHidden();
  });

  test("appears after reload when only pending exists at startup", async ({ page }) => {
    // Seed "startup" state in localStorage via the tauri mock. We then
    // reload so WorkbenchState.probeDefaultWorkspaces() runs with:
    // - live plugins: []
    // - pending plugins: [one item]
    await page.goto("/");
    await page.waitForSelector("nav");

    await page.evaluate(() => {
      localStorage.removeItem("chaosnexus-forge:last_project_path");
      localStorage.removeItem("chaosnexus-forge:session");

      localStorage.setItem("chaosnexus-forge:e2e_mock_active", "true");
      localStorage.setItem("chaosnexus-forge:e2e_mock_live_plugins", JSON.stringify([]));
      localStorage.setItem(
        "chaosnexus-forge:e2e_mock_pending_plugins",
        JSON.stringify([
          {
            name: "e2e_pending_plugin",
            tool_name: "e2e_pending_plugin_run",
            description: "Mock pending plugin for E2E.",
            requested_capabilities: ["shell"],
            created_at: new Date().toISOString(),
            rhai_source: 'fn execute(tool_name, args) { return "mock"; }',
            plugin_toml: 'name = "e2e_pending_plugin"\nversion = "0.1.0"\n',
          },
        ])
      );
    });

    await page.reload();

    await page.waitForSelector('[data-testid="pending-approvals-panel"]');
    await expect(page.getByTestId("pending-count")).toHaveText("1");
    await expect(page.getByTestId("pending-item-e2e_pending_plugin")).toBeVisible();

    // Avoid polluting later visual/theme snapshot tests.
    await page.evaluate(() => {
      localStorage.removeItem("chaosnexus-forge:e2e_mock_active");
      localStorage.removeItem("chaosnexus-forge:e2e_mock_live_plugins");
      localStorage.removeItem("chaosnexus-forge:e2e_mock_pending_plugins");
    });
  });
});
