// chaosnexus-forge/tests/e2e/unsaved-discard.spec.ts
import { test, expect, type Page } from "@playwright/test";

/**
 * Regression guard: choosing "Don't Save" in the graceful-exit prompt must throw
 * out a file's in-memory edits so it is genuinely no longer modified, even when
 * the subsequent window close is intercepted or no-ops (remote-UI/dev shell).
 *
 * Previously the "dont_save" branch of `attemptGracefulExit` only returned true
 * and relied on the process terminating, leaving a stale "cached modified state"
 * (dirty flag + edited content) behind whenever the app stayed open.
 */
const KEY = "terminal:dirty_demo.rhai";
const ORIGINAL = "// original on-disk content\n";
const EDITED = "// original on-disk content\n// unsaved edit\n";

type SeededWindow = Window & {
  _chaosforge_state?: { workbench?: any };
  __exitResult?: boolean;
};

/** Seeds a single dirty file (content + canvas both modified) without a backend. */
async function seedDirtyFile(page: Page): Promise<void> {
  await page.evaluate(
    ({ key, original, edited }) => {
      const wb = (window as SeededWindow)._chaosforge_state?.workbench;
      if (!wb) return;

      wb.projectPath = "/mock/workspace";
      wb.originalContents = { ...wb.originalContents, [key]: original };
      wb.fileContents = { ...wb.fileContents, [key]: edited };
      wb.modifiedFiles = { ...wb.modifiedFiles, [key]: true };

      // Also exercise the canvas dirty channel + its original snapshot.
      wb.originalCanvasContents = { ...wb.originalCanvasContents, [key]: "" };
      wb.modifiedCanvas = { ...wb.modifiedCanvas, [key]: true };
    },
    { key: KEY, original: ORIGINAL, edited: EDITED }
  );
}

test.describe("Unsaved changes discard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav");
  });

  test("\"Don't Save\" reverts content and clears the modified state", async ({ page }) => {
    await seedDirtyFile(page);

    // Kick off the graceful-exit flow; the prompt resolves on the modal click.
    await page.evaluate(() => {
      const wb = (window as SeededWindow)._chaosforge_state!.workbench!;
      (window as SeededWindow).__exitResult = undefined;
      void wb.attemptGracefulExit().then((r: boolean) => {
        (window as SeededWindow).__exitResult = r;
      });
    });

    const dontSave = page.getByTestId("unsaved-dont-save-btn");
    await expect(dontSave).toBeVisible();
    await dontSave.click();

    await page.waitForFunction(() => (window as SeededWindow).__exitResult !== undefined);

    const result = await page.evaluate(({ key }) => {
      const wb = (window as SeededWindow)._chaosforge_state!.workbench!;
      return {
        exit: (window as SeededWindow).__exitResult,
        modifiedFile: wb.modifiedFiles[key] === true,
        modifiedCanvas: wb.modifiedCanvas[key] === true,
        content: wb.fileContents[key],
        original: wb.originalContents[key],
        promptCleared: wb.unsavedPrompt === null,
      };
    }, { key: KEY });

    expect(result.exit).toBe(true);
    expect(result.promptCleared).toBe(true);
    // The crux: edits are thrown out and nothing reads as modified anymore.
    expect(result.modifiedFile).toBe(false);
    expect(result.modifiedCanvas).toBe(false);
    expect(result.content).toBe(result.original);
  });
});
