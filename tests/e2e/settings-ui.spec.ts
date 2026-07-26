// chaosnexus-forge/tests/e2e/settings-ui.spec.ts
import { test, expect, type Page } from "@playwright/test";

/**
 * Settings UX: the theme and font-family pickers are themed custom dropdowns
 * (no native <select>, which renders white on dark themes under WebKitGTK), the
 * font dropdown previews each typeface, and a recoverable "ChaosNexus Anvil not
 * found" prompt lets the user set + persist the binary path and retry the launch.
 */

type SeededWindow = Window & {
  _chaosforge_state?: {
    workbench?: {
      theme: string;
      fontFamily: string;
    };
    engine?: {
      binarySetupNeeded: boolean;
    };
    appSettings?: {
      chaoswrenchBin: string;
    };
  };
};

async function bootApp(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForSelector("nav");
  await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.engine);
}

async function openAppearanceTab(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("open-settings-modal")));
  await page.click('button:has-text("Appearance")');
  await expect(page.getByTestId("settings-theme-select")).toBeVisible();
}

test.describe("Settings dropdowns + ChaosNexus Anvil prompt", () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
  });

  test("no native <select> elements remain (themed dropdowns only)", async ({ page }) => {
    await openAppearanceTab(page);
    await expect(page.locator("select")).toHaveCount(0);
  });

  test("menu-bar THEME shortcut deep-links straight to the Appearance tab", async ({ page }) => {
    // No menu navigation: the status-bar THEME label is itself the shortcut and
    // must open Settings already on Appearance (the theme picker is visible).
    await page.getByTestId("menubar-theme-shortcut").click();
    await expect(page.getByTestId("settings-theme-select")).toBeVisible();
    await expect(page.getByRole("button", { name: "Appearance", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  test("theme picker is a themed dropdown that applies the theme", async ({ page }) => {
    await openAppearanceTab(page);

    await page.getByTestId("settings-theme-select").click();
    const list = page.getByTestId("settings-theme-select-list");
    await expect(list).toBeVisible();

    await list.locator('[data-value="Standard Light"]').click();

    await expect(list).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme"))).toBe(
      "light"
    );
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.colorScheme))
      .toBe("light");
    const theme = await page.evaluate(
      () => (window as SeededWindow)._chaosforge_state!.workbench!.theme
    );
    expect(theme).toBe("Standard Light");
  });

  test("font-family picker previews and applies a typeface", async ({ page }) => {
    await openAppearanceTab(page);

    await page.getByTestId("settings-font-select").click();
    const list = page.getByTestId("settings-font-select-list");
    await expect(list).toBeVisible();

    // Each row renders in its own font so the user previews before applying.
    const jetbrains = list.locator('[data-value="\'JetBrains Mono\', monospace"]');
    await expect(jetbrains).toBeVisible();
    const previewFont = await jetbrains
      .locator("span")
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(previewFont.toLowerCase()).toContain("jetbrains");

    await jetbrains.click();
    await expect(list).toBeHidden();

    const fontFamily = await page.evaluate(
      () => (window as SeededWindow)._chaosforge_state!.workbench!.fontFamily
    );
    expect(fontFamily).toBe("'JetBrains Mono', monospace");
    const rootVar = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--ui-font-family")
    );
    expect(rootVar).toBe("'JetBrains Mono', monospace");
  });

  test("ChaosNexus Anvil-not-found prompt sets the path, persists it, and retries", async ({ page }) => {
    // Simulate the engine reporting a missing binary on launch.
    await page.evaluate(() => {
      (window as SeededWindow)._chaosforge_state!.engine!.binarySetupNeeded = true;
    });

    await expect(page.getByTestId("chaosnexus-anvil-setup-title")).toBeVisible();

    await page.getByTestId("chaosnexus-anvil-setup-input").fill("/opt/chaosnexus-anvil/anvil");
    await page.getByTestId("chaosnexus-anvil-setup-save").click();

    // Modal closes once the path is saved and the launch is retried.
    await expect(page.getByTestId("chaosnexus-anvil-setup-title")).toBeHidden();
    const stored = await page.evaluate(
      () => (window as SeededWindow)._chaosforge_state!.appSettings!.chaoswrenchBin
    );
    expect(stored).toBe("/opt/chaosnexus-anvil/anvil");
    const stillNeeded = await page.evaluate(
      () => (window as SeededWindow)._chaosforge_state!.engine!.binarySetupNeeded
    );
    expect(stillNeeded).toBe(false);
  });

  test("ChaosNexus Anvil prompt can be dismissed without saving", async ({ page }) => {
    await page.evaluate(() => {
      (window as SeededWindow)._chaosforge_state!.engine!.binarySetupNeeded = true;
    });
    await expect(page.getByTestId("chaosnexus-anvil-setup-title")).toBeVisible();
    await page.getByTestId("chaosnexus-anvil-setup-cancel").click();
    await expect(page.getByTestId("chaosnexus-anvil-setup-title")).toBeHidden();
  });
});
