// chaosnexus-forge/tests/e2e/skills-rules-panel.spec.ts
/**
 * E2E: Skills/Rules sidebar CRUD under MOCK_TAURI.
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

test.describe("Skills/Rules panel", () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
  });

  test("creates, lists, and deletes a project rule", async ({ page }) => {
    await page.getByTestId("sidebar-tab-skills").click();
    await expect(page.getByTestId("skills-rules-panel")).toBeVisible();

    await page.getByTestId("skills-rules-scope").selectOption("project");
    await page.getByTestId("skills-rules-kind").selectOption("rule");
    await page.getByTestId("skills-rules-new").click();
    await page.getByTestId("skills-rules-name").fill("e2e-rule");
    await page.getByTestId("skills-rules-content").fill("# Rule\n\nDeny shell outside sandbox.");
    await page.getByTestId("skills-rules-save").click();

    await expect(page.getByTestId("skills-rules-item")).toHaveCount(1);
    await expect(page.getByTestId("skills-rules-item").first()).toContainText("e2e-rule");
    await expect(page.getByTestId("skills-rules-content")).toHaveValue(
      /Deny shell outside sandbox/,
    );
    await expect(page.getByTestId("skills-rules-delete")).toBeVisible();

    // Re-open from the list to exercise skills_rules_read.
    await page.getByTestId("skills-rules-new").click();
    await expect(page.getByTestId("skills-rules-content")).toHaveValue(/# Rule/);
    await page.getByTestId("skills-rules-item").first().click();
    await expect(page.getByTestId("skills-rules-content")).toHaveValue(
      /Deny shell outside sandbox/,
    );

    await page.getByTestId("skills-rules-delete").click();
    await expect(page.getByTestId("skills-rules-item")).toHaveCount(0);
  });
});
