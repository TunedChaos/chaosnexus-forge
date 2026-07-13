// chaosnexus-forge/tests/e2e/cvar-controller.spec.ts
/**
 * @description End-to-end tests for the ChaosNexus Anvil Engine CVar Controller UI.
 */
import { test, expect, type Page } from "@playwright/test";
import type { EngineCvar, EngineStatus } from "../../src/lib/engine.svelte";

type SeededWindow = Window & {
  _chaosforge_state?: {
    engine?: {
      status: EngineStatus;
      cvars: EngineCvar[];
    };
  };
};

async function bootApp(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForSelector("nav");
  await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.engine);
}

test.describe("CVar Controller UI", () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
  });

  test("can be toggled open and closed from the console", async ({ page }) => {
    const toggleBtn = page.getByRole("button", { name: "CVars", exact: true });
    
    // Initially closed
    await expect(page.getByText("CVar Controller")).toBeHidden();
    
    // Open
    await toggleBtn.click();
    await expect(page.getByText("CVar Controller")).toBeVisible();
    
    // Close via toggle
    await toggleBtn.click();
    await expect(page.getByText("CVar Controller")).toBeHidden();
    
    // Open again, close via X button
    await toggleBtn.click();
    await page.getByRole("button", { name: "Close the CVar Controller" }).click();
    await expect(page.getByText("CVar Controller")).toBeHidden();
  });

  test("renders cvars when engine is running", async ({ page }) => {
    await page.getByRole("button", { name: "CVars", exact: true }).click();
    
    // Not running message
    await expect(page.getByText("Start the engine to inspect and edit CVars.")).toBeVisible();

    // Set to running with some cvars
    await page.evaluate(() => {
      const state = (window as SeededWindow)._chaosforge_state!.engine!;
      state.status = "running";
      state.cvars = [
        { plugin_name: "test_plugin", name: "test_cvar", value: "42", description: "A test cvar" }
      ];
    });

    await expect(page.getByText("test_cvar")).toBeVisible();
    await expect(page.getByText("test_plugin")).toBeVisible();
    await expect(page.getByText("A test cvar")).toBeVisible();
    await expect(page.locator('input[type="text"]').last()).toHaveValue("42");
  });

  test("filters cvars by name, description, or plugin", async ({ page }) => {
    await page.evaluate(() => {
      const state = (window as SeededWindow)._chaosforge_state!.engine!;
      state.status = "running";
      state.cvars = [
        { plugin_name: "core", name: "sv_gravity", value: "800", description: "World gravity" },
        { plugin_name: "network", name: "net_rate", value: "60", description: "Tick rate" }
      ];
    });
    
    await page.getByRole("button", { name: "CVars", exact: true }).click();
    await expect(page.getByText("sv_gravity")).toBeVisible();
    await expect(page.getByText("net_rate")).toBeVisible();

    const searchInput = page.getByPlaceholder("Filter CVars...");
    
    // Filter by name
    await searchInput.fill("gravity");
    await expect(page.getByText("sv_gravity")).toBeVisible();
    await expect(page.getByText("net_rate")).toBeHidden();

    // Filter by description
    await searchInput.fill("Tick");
    await expect(page.getByText("net_rate")).toBeVisible();
    await expect(page.getByText("sv_gravity")).toBeHidden();

    // Filter by plugin
    await searchInput.fill("core");
    await expect(page.getByText("sv_gravity")).toBeVisible();
    await expect(page.getByText("net_rate")).toBeHidden();
  });

  test("retains draft values while editing and clears them when engine confirms", async ({ page }) => {
    await page.evaluate(() => {
      const state = (window as SeededWindow)._chaosforge_state!.engine!;
      state.status = "running";
      state.cvars = [
        { plugin_name: "core", name: "test_cvar", value: "100", description: "" }
      ];
    });
    
    await page.getByRole("button", { name: "CVars", exact: true }).click();
    
    const input = page.locator('input[type="text"]').last();
    await expect(input).toHaveValue("100");

    // Edit the input
    await input.fill("200");
    await expect(input).toHaveValue("200");

    // Trigger blur to commit
    await input.blur();
    
    // The UI should retain "200" as a draft because the engine hasn't confirmed it yet.
    await expect(input).toHaveValue("200");

    // Simulate engine confirming the change
    await page.evaluate(() => {
      const state = (window as SeededWindow)._chaosforge_state!.engine!;
      state.cvars = [
        { plugin_name: "core", name: "test_cvar", value: "200", description: "" }
      ];
    });

    // The draft should clear and the snapshot value should render (still 200).
    await expect(input).toHaveValue("200");
  });

  test("save to launch config button is enabled only when running with cvars", async ({ page }) => {
    await page.getByRole("button", { name: "CVars", exact: true }).click();
    const saveBtn = page.getByRole("button", { name: "Save to launch config" });
    
    await expect(saveBtn).toBeDisabled();

    // Running but 0 cvars
    await page.evaluate(() => {
      const state = (window as SeededWindow)._chaosforge_state!.engine!;
      state.status = "running";
      state.cvars = [];
    });
    await expect(saveBtn).toBeDisabled();

    // Running with cvars
    await page.evaluate(() => {
      const state = (window as SeededWindow)._chaosforge_state!.engine!;
      state.cvars = [
        { plugin_name: "core", name: "test_cvar", value: "100", description: "" }
      ];
    });
    await expect(saveBtn).toBeEnabled();
  });
});
