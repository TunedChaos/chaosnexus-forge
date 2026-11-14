// chaosnexus-forge/tests/e2e/settings-engine.spec.ts
/**
 * E2E: Settings Engine tab fields + save under MOCK_TAURI.
 */
import { test, expect, type Page } from "@playwright/test";

async function bootApp(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForSelector("nav");
  await page.waitForFunction(() => !!(window as any)._chaosforge_state?.appSettings);
}

test.describe("Settings Engine tab", () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
  });

  test("edits Anvil/Crucible fields and persists via Save", async ({ page }) => {
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("open-settings-modal", { detail: { tab: "engine" } }),
      );
    });

    await expect(page.getByTestId("settings-tab-engine")).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.getByTestId("settings-anvil-bin").fill("/mock/bin/anvil");
    await page.getByTestId("settings-valkey-url").fill("redis://127.0.0.1:6379");
    await page.getByTestId("settings-debug-log").fill("/tmp/anvil-debug.log");
    await page.getByTestId("settings-crucible-bin").fill("/mock/bin/crucible");
    await page.getByTestId("settings-crucible-port").fill("9090");
    await page.getByTestId("settings-crucible-backend").fill("stub");

    await page.getByTestId("settings-save").click();
    await expect(page.getByText("Settings saved.")).toBeVisible();

    const persisted = await page.evaluate(() => {
      const s = (window as any)._chaosforge_state.appSettings;
      return {
        anvil: s.chaoswrenchBin,
        valkey: s.valkeyUrl,
        debug: s.debugLog,
        crucible: s.crucibleBin,
        port: s.cruciblePort,
        backend: s.crucibleBackend,
      };
    });
    expect(persisted).toEqual({
      anvil: "/mock/bin/anvil",
      valkey: "redis://127.0.0.1:6379",
      debug: "/tmp/anvil-debug.log",
      crucible: "/mock/bin/crucible",
      port: "9090",
      backend: "stub",
    });
  });
});
