// chaosnexus-forge/tests/e2e/session-restore.spec.ts
import { test, expect, type Page } from "@playwright/test";

/**
 * VS Code-style session restore: open tabs, the focused tab, and per-tab view
 * modes are persisted to localStorage and replayed on the next launch so the
 * app reopens exactly where it left off.
 *
 * The browser Tauri mock exposes a single `mock_plugin` from `scan_plugins`, so
 * tabs are seeded against it; `read_plugin_file` resolves (mock) without error.
 */
const PLUGIN = "mock_plugin";
const TAB_A = "alpha.toml";
const TAB_B = "beta.toml";

type SeededWindow = Window & {
  _chaosforge_state?: { workbench?: any };
};

/** Waits until the startup workspace probe has connected (projectPath set). */
async function waitForWorkspace(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const wb = (window as SeededWindow)._chaosforge_state?.workbench;
    return !!wb && typeof wb.projectPath === "string" && wb.projectPath.length > 0;
  });
}

/** Opens two tabs and sets a non-default view mode on the focused one. */
async function openTwoTabs(page: Page): Promise<void> {
  await page.evaluate(
    async ({ plugin, a, b }) => {
      const wb = (window as SeededWindow)._chaosforge_state!.workbench!;
      await wb.openTab(plugin, a);
      await wb.openTab(plugin, b);
      wb.setTabViewMode(plugin, b, "code");
    },
    { plugin: PLUGIN, a: TAB_A, b: TAB_B }
  );
}

test.describe("Editor session restore", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav");
    await waitForWorkspace(page);
  });

  test("persists open tabs, active tab, and view mode to localStorage", async ({ page }) => {
    await openTwoTabs(page);

    const session = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("chaosnexus-forge:session") || "null")
    );

    expect(session).not.toBeNull();
    expect(session.openTabs.map((t: { filename: string }) => t.filename)).toEqual([TAB_A, TAB_B]);
    expect(session.activeTab).toBe(`${PLUGIN}:${TAB_B}`);
    const beta = session.openTabs.find((t: { filename: string }) => t.filename === TAB_B);
    expect(beta.viewMode).toBe("code");
  });

  test("reopens the previous session after a reload", async ({ page }) => {
    await openTwoTabs(page);

    // Reload simulates relaunching the app: the constructor reconnects the saved
    // workspace and replays the persisted session.
    await page.reload();
    await page.waitForSelector("nav");
    await page.waitForFunction(() => {
      const wb = (window as SeededWindow)._chaosforge_state?.workbench;
      return !!wb && wb.openTabs.length >= 2;
    });

    const restored = await page.evaluate(
      ({ tabB }) => {
        const wb = (window as SeededWindow)._chaosforge_state!.workbench!;
        return {
          tabs: wb.openTabs.map((t: { pluginName: string; filename: string }) =>
            `${t.pluginName}:${t.filename}`
          ),
          active: wb.activeTab
            ? `${wb.activeTab.pluginName}:${wb.activeTab.filename}`
            : null,
          betaView: wb.openTabs.find((t: { filename: string }) => t.filename === tabB)?.viewMode,
        };
      },
      { tabB: TAB_B }
    );

    expect(restored.tabs).toEqual([`${PLUGIN}:${TAB_A}`, `${PLUGIN}:${TAB_B}`]);
    expect(restored.active).toBe(`${PLUGIN}:${TAB_B}`);
    expect(restored.betaView).toBe("code");
  });

  test("does not restore tabs for a different workspace", async ({ page }) => {
    await openTwoTabs(page);

    // Tamper the stored snapshot to reference a stale, non-matching workspace.
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("chaosnexus-forge:session") || "{}");
      raw.projectPath = "/some/other/workspace";
      localStorage.setItem("chaosnexus-forge:session", JSON.stringify(raw));
    });

    const restoredCount = await page.evaluate(async () => {
      const wb = (window as SeededWindow)._chaosforge_state!.workbench!;
      wb.openTabs = [];
      wb.activeTab = null;
      await wb.restoreLastSession();
      return wb.openTabs.length;
    });

    expect(restoredCount).toBe(0);
  });
});
