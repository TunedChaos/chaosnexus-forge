// chaosnexus-forge/tests/e2e/visual-undo-redo.spec.ts
import { test, expect, type Page } from "@playwright/test";

/**
 * Visual scripting Ctrl+S save and unified undo/redo. The editor history snapshots
 * both the Rhai source and the canvas sidecar, so undo/redo covers layout
 * operations (node moves, group creation) the same way the text editor undoes code.
 */

type SeededWindow = Window & {
  _chaosforge_state?: {
    workbench?: any;
    editorGraph?: {
      nodeActions: { handleNewGroup: () => void };
      getNodes: () => Array<{ id: string; type?: string; position?: { x: number; y: number }; data?: { label?: string } }>;
      patchNode: (id: string, patch: Record<string, unknown>) => void;
      undo: () => void;
      redo: () => void;
      save: () => void;
      canUndo: () => boolean;
      canRedo: () => boolean;
    };
  };
};

const PLUGIN = "terminal";
const FILE = "undo_demo.rhai";
const KEY = `${PLUGIN}:${FILE}`;
/** Comfortably exceeds the 350ms history capture debounce in DualEditor. */
const SETTLE = 600;

async function seed(page: Page): Promise<void> {
  await page.evaluate(
    ({ plugin, file, key }) => {
      const wb = (window as SeededWindow)._chaosforge_state!.workbench!;
      wb.projectPath = "/mock/workspace";
      wb.activePlugin = { name: plugin, files: [] };
      wb.nodeRegistry = [];
      wb.fileContents = {
        ...wb.fileContents,
        [key]: "// --- [NODE: alpha] ---\n\n// --- [NODE: beta] ---\n",
      };
      wb.canvasContents = {
        ...wb.canvasContents,
        [key]: {
          version: 2,
          nodes: [
            { id: "main_group", label: "Main Logic", x: 50, y: 50, type: "group", style: "width: 800px; height: 600px;" },
            { id: "alpha", label: "alpha", x: 120, y: 120, parentId: "main_group" },
            { id: "beta", label: "beta", x: 120, y: 280, parentId: "main_group" },
          ],
          edges: [],
        },
      };
      wb.openTab(plugin, file);
      wb.setTabViewMode(plugin, file, "visual");
    },
    { plugin: PLUGIN, file: FILE, key: KEY }
  );
  await page.waitForSelector('[data-testid="flow-group"]', { timeout: 10000 });
  await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
}

async function nodePosition(page: Page, id: string): Promise<{ x: number; y: number }> {
  return page.evaluate((nid) => {
    const n = (window as SeededWindow)._chaosforge_state!.editorGraph!.getNodes().find((x) => x.id === nid);
    return { x: n?.position?.x ?? 0, y: n?.position?.y ?? 0 };
  }, id);
}

async function modifiedFlags(page: Page): Promise<{ file: boolean; canvas: boolean }> {
  return page.evaluate((key) => {
    const wb = (window as SeededWindow)._chaosforge_state!.workbench!;
    return { file: !!wb.modifiedFiles?.[key], canvas: !!wb.modifiedCanvas?.[key] };
  }, KEY);
}

test.describe("Visual scripting save + undo/redo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav");
  });

  test("Ctrl+S in the canvas saves the file and clears the modified flags", async ({ page }) => {
    await seed(page);
    // Mark the tab dirty (both channels), as an edit would.
    await page.evaluate((key) => {
      const wb = (window as SeededWindow)._chaosforge_state!.workbench!;
      wb.modifiedFiles = { ...wb.modifiedFiles, [key]: true };
      wb.modifiedCanvas = { ...wb.modifiedCanvas, [key]: true };
    }, KEY);
    expect((await modifiedFlags(page)).file).toBe(true);

    // Dispatch Ctrl+S on the canvas surface (focus is on the visual pane).
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="visual-canvas-surface"]')!;
      el.dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true })
      );
    });
    await page.waitForTimeout(400);

    const flags = await modifiedFlags(page);
    expect(flags.file).toBe(false);
    expect(flags.canvas).toBe(false);
  });

  test("undo and redo restore a moved node's position", async ({ page }) => {
    await seed(page);
    await page.waitForTimeout(SETTLE); // let the baseline snapshot settle

    const before = await nodePosition(page, "alpha");
    await page.evaluate(
      ({ id, x, y }) => {
        (window as SeededWindow)._chaosforge_state!.editorGraph!.patchNode(id, {
          position: { x: x + 220, y: y + 30 },
        });
      },
      { id: "alpha", x: before.x, y: before.y }
    );
    await page.waitForTimeout(SETTLE); // capture the moved state

    const moved = await nodePosition(page, "alpha");
    expect(Math.abs(moved.x - before.x)).toBeGreaterThan(100);

    await page.evaluate(() => (window as SeededWindow)._chaosforge_state!.editorGraph!.undo());
    await page.waitForTimeout(SETTLE);
    const undone = await nodePosition(page, "alpha");
    expect(Math.abs(undone.x - before.x)).toBeLessThan(5);
    expect(Math.abs(undone.y - before.y)).toBeLessThan(5);

    await page.evaluate(() => (window as SeededWindow)._chaosforge_state!.editorGraph!.redo());
    await page.waitForTimeout(SETTLE);
    const redone = await nodePosition(page, "alpha");
    expect(Math.abs(redone.x - moved.x)).toBeLessThan(5);
    expect(Math.abs(redone.y - moved.y)).toBeLessThan(5);
  });

  test("toolbar Undo/Redo buttons enable after a change and undo a new group", async ({ page }) => {
    await seed(page);
    await page.waitForTimeout(SETTLE);

    const undoBtn = page.locator('[data-testid="visual-undo-btn"]');
    const redoBtn = page.locator('[data-testid="visual-redo-btn"]');
    await expect(undoBtn).toBeDisabled();
    await expect(redoBtn).toBeDisabled();

    // Create an empty group (prompt auto-accepted) and let it record to history.
    page.once("dialog", (d) => d.accept("Scratch Group"));
    await page.evaluate(() =>
      (window as SeededWindow)._chaosforge_state!.editorGraph!.nodeActions.handleNewGroup()
    );
    await page.waitForTimeout(SETTLE);

    const groupCount = async () =>
      page.evaluate(() =>
        (window as SeededWindow)._chaosforge_state!.editorGraph!.getNodes().filter((n) => n.type === "group").length
      );
    expect(await groupCount()).toBe(2); // main_group + new group
    await expect(undoBtn).toBeEnabled();

    await undoBtn.click();
    await page.waitForTimeout(SETTLE);
    expect(await groupCount()).toBe(1);
    await expect(redoBtn).toBeEnabled();

    await redoBtn.click();
    await page.waitForTimeout(SETTLE);
    expect(await groupCount()).toBe(2);
  });
});
