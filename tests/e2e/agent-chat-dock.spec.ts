// chaosnexus-forge/tests/e2e/agent-chat-dock.spec.ts
/**
 * @description E2E coverage for dockable Agent Chat, Anvil MCP panel, and Skills/Rules UI.
 */
import { test, expect, type Page } from "@playwright/test";

type SeededWindow = Window & {
  _chaosforge_state?: {
    agentChat?: {
      open: boolean;
      enabled: boolean;
      mode: "docked" | "float";
      toggleOpen: () => void;
      undock: () => void;
      redock: () => void;
      setEnabled: (v: boolean) => void;
      save: () => void;
    };
  };
};

async function bootApp(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForSelector("nav");
  await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.agentChat);
}

test.describe("Agent Chat dock + ecosystem panels", () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
  });

  test("docks agent chat by default and can close/reopen via chrome state", async ({ page }) => {
    await expect(page.getByTestId("agent-chat-dock")).toBeVisible();
    await expect(page.getByTestId("agent-chat-ui")).toBeVisible();

    await page.getByTestId("agent-chat-close").click();
    await expect(page.getByTestId("agent-chat-dock")).toBeHidden();

    await page.evaluate(() => {
      const chat = (window as SeededWindow)._chaosforge_state!.agentChat!;
      chat.open = true;
      chat.save();
    });
    await expect(page.getByTestId("agent-chat-dock")).toBeVisible();
  });

  test("can undock to float and redock", async ({ page }) => {
    await expect(page.getByTestId("agent-chat-dock")).toBeVisible();
    await page.getByTestId("agent-chat-undock").click();
    await expect(page.getByTestId("agent-chat-float")).toBeVisible();
    await expect(page.getByTestId("agent-chat-dock")).toBeHidden();

    await page.getByTestId("agent-chat-redock").click();
    await expect(page.getByTestId("agent-chat-dock")).toBeVisible();
    await expect(page.getByTestId("agent-chat-float")).toBeHidden();
  });

  test("can disable agent chat entirely", async ({ page }) => {
    await page.evaluate(() => {
      (window as SeededWindow)._chaosforge_state!.agentChat!.setEnabled(false);
    });
    await expect(page.getByTestId("agent-chat-dock")).toBeHidden();
    await expect(page.getByTestId("agent-chat-float")).toBeHidden();

    await page.evaluate(() => {
      const chat = (window as SeededWindow)._chaosforge_state!.agentChat!;
      chat.setEnabled(true);
      chat.open = true;
      chat.mode = "docked";
      chat.save();
    });
    await expect(page.getByTestId("agent-chat-dock")).toBeVisible();
  });

  test("Anvil MCP and Skills sidebar tabs render panels", async ({ page }) => {
    await page.getByTestId("sidebar-tab-anvil-mcp").click();
    await expect(page.getByTestId("anvil-mcp-panel")).toBeVisible();

    await page.getByTestId("sidebar-tab-skills").click();
    await expect(page.getByTestId("skills-rules-panel")).toBeVisible();
    await expect(page.getByTestId("skills-rules-scope")).toBeVisible();
  });

  test("browser chat fallback still responds without Tauri", async ({ page }) => {
    await page.getByTestId("agent-chat-input").fill("hello from e2e");
    await page.getByTestId("agent-chat-send").click();
    await expect(page.getByTestId("agent-chat-log")).toContainText("Agent received");
  });
});
