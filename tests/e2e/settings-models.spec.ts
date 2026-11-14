// chaosnexus-forge/tests/e2e/settings-models.spec.ts
/**
 * @description E2E for Settings Models tab (HF token + Tuned GGUF preset).
 */
import { test, expect, type Page } from "@playwright/test";

async function bootApp(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForSelector("nav");
}

test.describe("Settings Models tab", () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
  });

  test("opens Models tab with Tuned GGUF defaults", async ({ page }) => {
    await page.getByTestId("menubar-theme-shortcut").click();
    // Theme shortcut opens Appearance; switch to Models.
    await page.getByTestId("settings-tab-models").click();
    await expect(page.getByTestId("settings-models-panel")).toBeVisible();
    await expect(page.getByTestId("settings-hf-token")).toBeVisible();
    await expect(page.getByTestId("settings-model-preset")).toHaveValue("tuned-gguf");
    await expect(page.getByTestId("settings-crucible-model-id")).toHaveValue(
      "TunedChaos/ChaosNexus_Tuned_v1-GGUF",
    );
    await expect(page.getByTestId("settings-model-pull")).toBeVisible();
  });

  test("custom preset allows editing Hub ID", async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("open-settings-modal", { detail: { tab: "models" } }));
    });
    await expect(page.getByTestId("settings-models-panel")).toBeVisible();
    await page.getByTestId("settings-model-preset").selectOption("custom");
    await page.getByTestId("settings-crucible-model-id").fill("org/custom-gguf");
    await expect(page.getByTestId("settings-crucible-model-id")).toHaveValue("org/custom-gguf");
  });
});
