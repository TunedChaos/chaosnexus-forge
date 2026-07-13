/**
 * @file dual-editor-split.spec.ts
 * @module chaosnexus-forge/tests/e2e/dual-editor-split
 * @description Playwright end-to-end tests for the dual editor split resize functionality.
 */
import { test, expect } from "@playwright/test";

test.describe("Dual editor split resize", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav");

    await page.evaluate(async () => {
      const state = (window as any)._chaosforge_state;
      if (!state?.workbench) return;

      const wb = state.workbench;
      wb.projectPath = "/mock/workspace";
      wb.activePlugin = { name: "terminal", files: [] };
      wb.fileContents = wb.fileContents || {};
      wb.fileContents["terminal:terminal_tool.rhai"] =
        "// --- [NODE: main] ---\nfn main() {}\n";
      wb.openTab("terminal", "terminal_tool.rhai");
      const tab = wb.activeTab;
      if (tab) tab.viewMode = "split";
    });

    await page.waitForSelector('[data-testid="dual-editor-split-handle"]', { timeout: 10000 });
  });

  test("dragging the split handle resizes the code pane", async ({ page }) => {
    const handle = page.locator('[data-testid="dual-editor-split-handle"]');
    await expect(handle).toBeVisible();

    const codePane = page.locator('[data-testid="dual-editor-code-pane"]');
    await expect(codePane).toBeVisible();

    const before = await codePane.evaluate((el) => el.getBoundingClientRect().width);
    expect(before).toBeGreaterThan(0);

    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Cross into the flow pane (simulates real drag over Svelte Flow / Monaco)
    await page.mouse.move(startX + 200, startY, { steps: 20 });
    await page.mouse.up();

    await page.waitForTimeout(100);

    const after = await codePane.evaluate((el) => el.getBoundingClientRect().width);
    expect(after).toBeGreaterThan(before + 40);
  });

  test("dragging left shrinks the code pane", async ({ page }) => {
    const handle = page.locator('[data-testid="dual-editor-split-handle"]');
    const codePane = page.locator('[data-testid="dual-editor-code-pane"]');

    const before = await codePane.evaluate((el) => el.getBoundingClientRect().width);
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 150, startY, { steps: 15 });
    await page.mouse.up();

    await page.waitForTimeout(100);

    const after = await codePane.evaluate((el) => el.getBoundingClientRect().width);
    expect(after).toBeLessThan(before - 30);
  });

  test("resize survives a child pane that stops pointer propagation", async ({ page }) => {
    // Simulate Monaco / Svelte Flow swallowing pointer events: any element that
    // calls stopPropagation() must not break the drag (capture-phase listeners).
    await page.evaluate(() => {
      const pane = document.querySelector('[data-testid="dual-editor-code-pane"]');
      if (pane) {
        pane.addEventListener("pointermove", (e) => e.stopPropagation());
        pane.addEventListener("pointerup", (e) => e.stopPropagation());
      }
    });

    const handle = page.locator('[data-testid="dual-editor-split-handle"]');
    const codePane = page.locator('[data-testid="dual-editor-code-pane"]');

    const before = await codePane.evaluate((el) => el.getBoundingClientRect().width);
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;

    // Drag left, ending the gesture INSIDE the code pane that eats events.
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 200, startY, { steps: 20 });
    await page.mouse.up();

    await page.waitForTimeout(100);

    const after = await codePane.evaluate((el) => el.getBoundingClientRect().width);
    expect(after).toBeLessThan(before - 60);
  });

  test("resize is driven by mouse events, not only pointer events", async ({ page }) => {
    // WebKitGTK (the Tauri webview) does not reliably deliver Pointer Events
    // during drags, so the handle must also respond to Mouse Events. Verify the
    // mousedown handler is wired and a real mouse drag (CDP emits mouse events)
    // moves the divider. page.mouse.* drives genuine input the handler consumes.
    const handle = page.locator('[data-testid="dual-editor-split-handle"]');
    const codePane = page.locator('[data-testid="dual-editor-code-pane"]');

    const before = await codePane.evaluate((el) => el.getBoundingClientRect().width);
    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 150, startY, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(100);

    const after = await codePane.evaluate((el) => el.getBoundingClientRect().width);
    expect(after).toBeGreaterThan(before + 40);
  });
});
