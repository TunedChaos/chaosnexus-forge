// chaosnexus-forge/tests/e2e/mcp-registry.spec.ts
/**
 * @description End-to-end tests for the MCP Mesh Registry and connection management.
 */
import { test, expect, type Page } from "@playwright/test";

type SeededWindow = Window & {
  _chaosforge_state?: {
    workbench?: {
      projectPath: string | null;
    };
    mcp?: {
      connections: any[];
      health: Record<string, any>;
      toolsByConn: Record<string, any[]>;
      paletteTools: (conn: any) => any[];
    };
  };
};

async function bootApp(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForSelector("nav");
  await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.mcp);
}

test.describe("MCP Mesh Registry", () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
    // Open Mesh tab
    await page.getByRole("button", { name: "Mesh", exact: true }).click();
  });

  test("shows disconnected message when workspace is not connected", async ({ page }) => {
    await page.evaluate(() => {
      const state = (window as SeededWindow)._chaosforge_state!;
      state.workbench!.projectPath = null;
    });

    await expect(page.getByText("Connect a workspace to manage MCP connections.")).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Add Connection" })).toBeHidden();
  });

  test("add connection form validates inputs and submits", async ({ page }) => {
    await page.evaluate(() => {
      const state = (window as SeededWindow)._chaosforge_state!;
      state.workbench!.projectPath = "/mock/workspace";
      state.mcp!.connections = [];
    });

    const addBtn = page.getByRole("button", { name: "+ Add Connection" });
    await addBtn.click();

    // Verify form renders
    const idInput = page.getByPlaceholder("id (e.g. github)");
    const cmdInput = page.getByPlaceholder("command (e.g. npx)");
    const saveBtn = page.getByRole("button", { name: "Save Connection" });

    // Submit empty - requires ID
    await saveBtn.click();
    await expect(page.getByText("Connection id is required.")).toBeVisible();

    // Submit invalid ID
    await idInput.fill("invalid id spaces");
    await saveBtn.click();
    await expect(page.getByText("Id may only contain letters, numbers, '_' and '-'.")).toBeVisible();

    // Submit missing command
    await idInput.fill("valid_id");
    await saveBtn.click();
    await expect(page.getByText("Launch command is required.")).toBeVisible();

    // Submit valid
    await cmdInput.fill("npx");
    await page.getByPlaceholder("args (space-separated)").fill("-y @server/test");
    await saveBtn.click();

    // Svelte mock returns the array containing the new connection
    await expect(page.getByText("valid_id")).toBeVisible();
    await expect(page.getByText("npx -y @server/test")).toBeVisible();
    
    // Form should close on success
    await expect(idInput).toBeHidden();
  });

  test("renders health states, scope, tools, and error messages", async ({ page }) => {
    await page.evaluate(() => {
      const state = (window as SeededWindow)._chaosforge_state!;
      state.workbench!.projectPath = "/mock/workspace";
      state.mcp!.connections = [
        {
          id: "conn1",
          label: "Offline Server",
          command: "node",
          args: ["index.js"],
          scope: "read-write"
        }
      ];
      state.mcp!.health = {
        "conn1": { state: "offline", message: "Failed to connect", tools: [] }
      };
      state.mcp!.toolsByConn = {};
    });

    await expect(page.getByText("Offline Server")).toBeVisible();
    await expect(page.getByText("Read-Write")).toBeVisible();
    await expect(page.getByText("Failed to connect")).toBeVisible();
    
    // Check buttons
    await expect(page.getByRole("button", { name: "Test" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Remove" })).toBeEnabled();
    
    // Test testing state
    await page.evaluate(() => {
      const state = (window as SeededWindow)._chaosforge_state!;
      state.mcp!.health["conn1"].state = "testing";
    });
    // Test button should be disabled while testing
    await expect(page.getByRole("button", { name: "Test" })).toBeDisabled();

    // Test tools rendering
    await page.evaluate(() => {
      const state = (window as SeededWindow)._chaosforge_state!;
      state.mcp!.health["conn1"].state = "online";
      state.mcp!.health["conn1"].message = "";
      state.mcp!.toolsByConn["conn1"] = [
        { name: "test_tool", description: "A mock tool", input_schema: {} }
      ];
    });
    
    await expect(page.getByText("test_tool")).toBeVisible();
    await expect(page.getByRole("button", { name: "Test" })).toBeEnabled();
  });
});
