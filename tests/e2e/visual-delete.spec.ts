// chaosnexus-forge/tests/e2e/visual-delete.spec.ts
import { test, expect, type Page } from "@playwright/test";

/**
 * Delete-key behavior for the visual scripting canvas:
 *  - a selected leaf node deletes immediately (no modal),
 *  - an empty group deletes immediately (no modal),
 *  - a group with contents warns + cascades through a confirmation modal,
 *  - a multi-selection deletes every item (confirming once when any group has
 *    contents),
 *  - the "Main Logic" group can never be deleted.
 *
 * xyflow's built-in delete is disabled (deleteKey={null}); deletion is owned by
 * the canvas keydown handler -> requestDelete, exercised here via real
 * KeyboardEvents dispatched on the canvas surface.
 */

type SeededWindow = Window & {
  _chaosforge_state?: {
    workbench?: any;
    editorGraph?: {
      getNodes: () => Array<{ id: string; type?: string; selected?: boolean }>;
      patchNode: (id: string, patch: Record<string, unknown>) => void;
      requestDelete: (ids: string[]) => void;
      deleteSelection: () => void;
    };
  };
};

const PLUGIN = "terminal";
const FILE = "delete_demo.rhai";
const KEY = `${PLUGIN}:${FILE}`;

/**
 * Seeds a tab with Main Logic containing: an empty group, a group with one
 * anchored child, and a standalone anchored node.
 */
async function seedDeleteGraph(page: Page): Promise<void> {
  await page.evaluate(
    ({ plugin, file, key }) => {
      const wb = (window as SeededWindow)._chaosforge_state!.workbench!;
      wb.projectPath = "/mock/workspace";
      wb.activePlugin = { name: plugin, files: [] };
      wb.nodeRegistry = [];
      wb.fileContents = {
        ...wb.fileContents,
        [key]: "// --- [NODE: solo] ---\n\n// --- [NODE: child] ---\n",
      };
      wb.canvasContents = {
        ...wb.canvasContents,
        [key]: {
          version: 2,
          nodes: [
            { id: "main_group", label: "Main Logic", x: 40, y: 40, type: "group", style: "width: 900px; height: 640px;" },
            { id: "empty_group", label: "Empty Group", x: 40, y: 40, type: "group", parentId: "main_group", style: "width: 220px; height: 140px;" },
            { id: "full_group", label: "Full Group", x: 320, y: 40, type: "group", parentId: "main_group", style: "width: 260px; height: 200px;" },
            { id: "child", label: "child", x: 30, y: 60, parentId: "full_group" },
            { id: "solo", label: "solo", x: 320, y: 320, parentId: "main_group" },
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

async function nodeIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as SeededWindow)._chaosforge_state!.editorGraph!.getNodes().map((n) => n.id)
  );
}

async function activeContent(page: Page): Promise<string> {
  return page.evaluate((key) => {
    const wb = (window as SeededWindow)._chaosforge_state!.workbench!;
    return (wb.fileContents?.[key] as string) ?? "";
  }, KEY);
}

/** Marks the given ids selected (mirrors clicking/rubber-banding on the canvas). */
async function select(page: Page, ids: string[]): Promise<void> {
  await page.evaluate((selIds) => {
    const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
    for (const n of graph.getNodes()) graph.patchNode(n.id, { selected: selIds.includes(n.id) });
  }, ids);
}

/** Dispatches a real Delete/Backspace keydown on the focused canvas surface. */
async function pressDelete(page: Page, key: "Delete" | "Backspace" = "Delete"): Promise<void> {
  await page.evaluate((k) => {
    const el = document.querySelector('[data-testid="visual-canvas-surface"]');
    el?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  }, key);
}

const modal = (page: Page) => page.locator('[data-testid="delete-group-confirm-btn"]');

test.describe("Visual scripting delete key", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav");
  });

  test("deletes a selected leaf node immediately and strips its Rhai anchor", async ({ page }) => {
    await seedDeleteGraph(page);
    await select(page, ["solo"]);
    await pressDelete(page);
    await page.waitForTimeout(200);

    await expect(modal(page)).toHaveCount(0);
    expect(await nodeIds(page)).not.toContain("solo");
    expect(await activeContent(page)).not.toContain("[NODE: solo]");
    // Untouched siblings remain.
    expect(await nodeIds(page)).toEqual(expect.arrayContaining(["main_group", "full_group", "child"]));
  });

  test("Backspace also deletes the selection", async ({ page }) => {
    await seedDeleteGraph(page);
    await select(page, ["solo"]);
    await pressDelete(page, "Backspace");
    await page.waitForTimeout(200);
    expect(await nodeIds(page)).not.toContain("solo");
  });

  test("deletes an empty group immediately with no confirmation", async ({ page }) => {
    await seedDeleteGraph(page);
    await select(page, ["empty_group"]);
    await pressDelete(page);
    await page.waitForTimeout(200);

    await expect(modal(page)).toHaveCount(0);
    expect(await nodeIds(page)).not.toContain("empty_group");
  });

  test("warns and cascades when deleting a group with contents", async ({ page }) => {
    await seedDeleteGraph(page);
    await select(page, ["full_group"]);
    await pressDelete(page);

    await expect(modal(page)).toBeVisible();
    await expect(page.locator('[data-testid="delete-modal-title"]')).toContainText("Full Group");
    await expect(page.getByText("1 contained item")).toBeVisible();

    await modal(page).click();
    await page.waitForTimeout(300);

    const ids = await nodeIds(page);
    expect(ids).not.toContain("full_group");
    expect(ids).not.toContain("child");
    expect(await activeContent(page)).not.toContain("[NODE: child]");
    // Solo + main survive.
    expect(ids).toEqual(expect.arrayContaining(["main_group", "solo"]));
  });

  test("cancel in the modal keeps the group and its contents", async ({ page }) => {
    await seedDeleteGraph(page);
    await select(page, ["full_group"]);
    await pressDelete(page);

    await expect(modal(page)).toBeVisible();
    await page.locator('[data-testid="delete-group-cancel-btn"]').click();
    await page.waitForTimeout(200);

    const ids = await nodeIds(page);
    expect(ids).toContain("full_group");
    expect(ids).toContain("child");
  });

  test("multi-selection deletes every item, confirming once for a contained group", async ({ page }) => {
    await seedDeleteGraph(page);
    await select(page, ["solo", "full_group"]);
    await pressDelete(page);

    await expect(modal(page)).toBeVisible();
    await expect(page.locator('[data-testid="delete-modal-title"]')).toContainText("2 selected items");

    await modal(page).click();
    await page.waitForTimeout(300);

    const ids = await nodeIds(page);
    expect(ids).not.toContain("solo");
    expect(ids).not.toContain("full_group");
    expect(ids).not.toContain("child");
    expect(ids).toContain("main_group");
  });

  test("multi-selection of only empty groups / nodes deletes with no modal", async ({ page }) => {
    await seedDeleteGraph(page);
    await select(page, ["solo", "empty_group"]);
    await pressDelete(page);
    await page.waitForTimeout(200);

    await expect(modal(page)).toHaveCount(0);
    const ids = await nodeIds(page);
    expect(ids).not.toContain("solo");
    expect(ids).not.toContain("empty_group");
  });

  test("the Main Logic group can never be deleted", async ({ page }) => {
    await seedDeleteGraph(page);
    // Even mixed with a deletable node, main_group is spared.
    await select(page, ["main_group", "solo"]);
    await pressDelete(page);
    await page.waitForTimeout(200);

    const ids = await nodeIds(page);
    expect(ids).toContain("main_group");
    expect(ids).not.toContain("solo");

    // Selecting only main_group is a no-op (no modal, nothing removed).
    await select(page, ["main_group"]);
    await pressDelete(page);
    await page.waitForTimeout(150);
    await expect(modal(page)).toHaveCount(0);
    expect(await nodeIds(page)).toContain("main_group");
  });
});
