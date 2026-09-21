// chaosnexus-forge/tests/e2e/engine-console.spec.ts
/**
 * @description End-to-end tests for the ChaosNexus Anvil Engine Console and its log stream.
 */
import { test, expect, type Page } from "@playwright/test";
import type { EngineLog, EngineStatus } from "../../src/lib/engine.svelte";

type SeededWindow = Window & {
  _chaosforge_state?: {
    workbench?: {
      projectPath: string | null;
    };
    engine?: {
      status: EngineStatus;
      logs: EngineLog[];
      clear: () => void;
    };
  };
};

async function bootApp(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForSelector("nav");
  await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.engine);
}

test.describe("Engine Console", () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
  });

  test("disables Start button when no workspace is connected", async ({ page }) => {
    await page.evaluate(() => {
      const state = (window as SeededWindow)._chaosforge_state!;
      state.workbench!.projectPath = null;
      state.engine!.status = "stopped";
    });

    const startBtn = page.getByRole("button", { name: "Start", exact: true });
    await expect(startBtn).toBeDisabled();
    
    // Status should be STOPPED
    await expect(page.getByText("STOPPED", { exact: true })).toBeVisible();
    await expect(page.getByText("Connect a workspace, then press Start to launch the ChaosNexus Anvil engine.")).toBeVisible();
  });

  test("enables Start and disables Stop/Reload when workspace is connected but stopped", async ({ page }) => {
    await page.evaluate(() => {
      const state = (window as SeededWindow)._chaosforge_state!;
      state.workbench!.projectPath = "/mock/workspace";
      state.engine!.status = "stopped";
    });

    const startBtn = page.getByRole("button", { name: "Start", exact: true });
    const stopBtn = page.getByRole("button", { name: "Stop", exact: true });
    const reloadBtn = page.getByRole("button", { name: "Reload Plugins", exact: true });

    await expect(startBtn).toBeEnabled();
    await expect(stopBtn).toBeDisabled();
    await expect(reloadBtn).toBeDisabled();
    
    await expect(page.getByText("Engine stopped. Press Start to launch the ChaosNexus Anvil engine.")).toBeVisible();
  });

  test("enables Stop and Reload, disables Start when running", async ({ page }) => {
    await page.evaluate(() => {
      const state = (window as SeededWindow)._chaosforge_state!;
      state.workbench!.projectPath = "/mock/workspace";
      state.engine!.status = "running";
    });

    const startBtn = page.getByRole("button", { name: "Start", exact: true });
    const stopBtn = page.getByRole("button", { name: "Stop", exact: true });
    const reloadBtn = page.getByRole("button", { name: "Reload Plugins", exact: true });

    await expect(startBtn).toBeDisabled();
    await expect(stopBtn).toBeEnabled();
    await expect(reloadBtn).toBeEnabled();
    
    await expect(page.getByText("RUNNING", { exact: true })).toBeVisible();
    await expect(page.getByText("Engine running. Waiting for plugin output...")).toBeVisible();
  });

  test("renders log stream and allows clearing", async ({ page }) => {
    await page.evaluate(() => {
      const state = (window as SeededWindow)._chaosforge_state!;
      state.engine!.status = "running";
      state.engine!.logs = [
        { level: "info", plugin: "core", message: "System initialized", time: "10:00:00" },
        { level: "error", plugin: "db", message: "Connection failed", time: "10:00:01" }
      ];
    });

    // Check log output
    await expect(page.getByText("[10:00:00]")).toBeVisible();
    await expect(page.getByText("[core]")).toBeVisible();
    await expect(page.getByText("System initialized")).toBeVisible();

    await expect(page.getByText("[10:00:01]")).toBeVisible();
    await expect(page.getByText("[db]")).toBeVisible();
    await expect(page.getByText("Connection failed")).toBeVisible();

    // Clear logs
    const clearBtn = page.getByRole("button", { name: "Clear", exact: true });
    await expect(clearBtn).toBeEnabled();
    
    // Simulate engine.clear() since the mock might just clear its own state.
    // We just manually clear the mock state in Playwright, or click the button 
    // which triggers engine.clear(). If it's a Svelte class method it's already bound.
    await clearBtn.click();
    
    // If the mock `engine` doesn't actually clear the array, we must do it manually 
    // as it might be calling an unmocked backend or we just test the UI call.
    // In engine.svelte.ts: `clear() { this.logs = []; }`
    // Since it's pure frontend state, clicking the button SHOULD clear it immediately.
    await expect(page.getByText("Engine running. Waiting for plugin output...")).toBeVisible();
  });
});
