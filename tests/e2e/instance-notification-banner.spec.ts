// chaosnexus-forge/tests/e2e/instance-notification-banner.spec.ts
/**
 * @description End-to-end test suite for the ChaosNexus Anvil instance notification banner.
 */
import { test, expect } from "@playwright/test";

test.describe("ChaosNexus Anvil instance banner", () => {
  test("appears on load and displays the seeded instance name", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav");

    await page.evaluate(() => {
      localStorage.setItem("chaosnexus-forge:e2e_mock_active", "true");
      localStorage.setItem(
        "chaosnexus-forge:e2e_mock_chaoswrench_instances",
        JSON.stringify([
          {
            pid: 12345,
            name: "ChaosNexus Tuned-1",
            parent: "unknown",
            port: 4242,
            token: "mock-token",
            timestamp: Date.now(),
          },
        ])
      );
    });

    await page.reload();

    await page.waitForSelector('[data-testid="chaosnexus-anvil-instance-banner"]');
    await expect(page.getByTestId("chaosnexus-anvil-instance-name")).toHaveText("ChaosNexus Tuned-1");

    // Avoid polluting later visual/theme snapshot tests.
    await page.evaluate(() => {
      localStorage.removeItem("chaosnexus-forge:e2e_mock_active");
      localStorage.removeItem("chaosnexus-forge:e2e_mock_chaoswrench_instances");
    });
  });
});

