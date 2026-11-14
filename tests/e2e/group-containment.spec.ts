// chaosnexus-forge/tests/e2e/group-containment.spec.ts
import { test, expect, type Page } from "@playwright/test";

type SeededWindow = Window & {
  _chaosforge_state?: {
    workbench?: any;
    editorGraph?: {
      nodeActions: {
        handleNodeDragStop: (nodeId: string, groupId: string | null) => void;
        handleNodesDragStop: (nodeIds: string[], groupId: string | null) => void;
        handleAddToGroup: (nodeId: string, groupId: string) => void;
        handleGroupResize: (groupId: string) => void;
        setGroupHighlight: (groupId: string | null) => void;
        handleDeleteGroup: (groupId: string) => void;
      };
      getNodes: () => Node[];
      patchNode: (id: string, patch: Record<string, unknown>) => void;
      resolveDropTargetAtPoint: (nodeId: string, cursorFlow: { x: number; y: number }) => string | null;
    };
  };
};

/** Reads a live group node's parsed {width,height} from the editor graph hook. */
async function groupSize(
  page: Page,
  groupId: string
): Promise<{ width: number; height: number }> {
  return page.evaluate((id) => {
    const nodes = (window as SeededWindow)._chaosforge_state!.editorGraph!.getNodes() as unknown as Array<{
      id: string;
      style?: string;
    }>;
    const style = nodes.find((n) => n.id === id)?.style ?? "";
    const w = style.match(/width:\s*([-\d.]+)px/);
    const h = style.match(/height:\s*([-\d.]+)px/);
    return {
      width: w ? parseFloat(w[1]) : 0,
      height: h ? parseFloat(h[1]) : 0,
    };
  }, groupId);
}

/** Reads a live group node's recorded manual size (undefined when auto-fit). */
async function groupManualSize(
  page: Page,
  groupId: string
): Promise<{ manualWidth?: number; manualHeight?: number }> {
  return page.evaluate((id) => {
    const nodes = (window as SeededWindow)._chaosforge_state!.editorGraph!.getNodes() as unknown as Array<{
      id: string;
      data?: { manualWidth?: number; manualHeight?: number };
    }>;
    const data = nodes.find((n) => n.id === id)?.data ?? {};
    return { manualWidth: data.manualWidth, manualHeight: data.manualHeight };
  }, groupId);
}

/** Reads a live node's parent-relative {x,y} position from the editor graph hook. */
async function nodePosition(
  page: Page,
  nodeId: string
): Promise<{ x: number; y: number }> {
  return page.evaluate((id) => {
    const nodes = (window as SeededWindow)._chaosforge_state!.editorGraph!.getNodes() as unknown as Array<{
      id: string;
      position?: { x: number; y: number };
    }>;
    const pos = nodes.find((n) => n.id === id)?.position;
    return { x: pos?.x ?? 0, y: pos?.y ?? 0 };
  }, nodeId);
}

const PLUGIN = "terminal";
const FILE = "group_demo.rhai";
const KEY = `${PLUGIN}:${FILE}`;

/** Seeds a Rhai tab with nested groups and two anchored nodes for containment tests. */
async function seedGroupGraph(page: Page): Promise<void> {
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
            {
              id: "main_group",
              label: "Main Logic",
              x: 50,
              y: 50,
              type: "group",
              style: "width: 800px; height: 600px;",
            },
            {
              id: "inner_group",
              label: "Inner Segment",
              x: 420,
              y: 100,
              type: "group",
              parentId: "main_group",
              style: "width: 300px; height: 200px;",
            },
            {
              id: "alpha",
              label: "alpha",
              x: 100,
              y: 120,
              parentId: "main_group",
            },
            {
              id: "beta",
              label: "beta",
              x: 60,
              y: 70,
              parentId: "inner_group",
            },
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
}

async function canvasNode(page: Page, nodeId: string) {
  return page.evaluate(
    ({ key, id }) => {
      const wb = (window as SeededWindow)._chaosforge_state!.workbench!;
      const meta = wb.canvasContents[key];
      return meta?.nodes?.find((n: { id: string }) => n.id === id) ?? null;
    },
    { key: KEY, id: nodeId }
  );
}

async function openNodeContextMenu(
  page: Page,
  nodeId: string,
  at?: { clientX: number; clientY: number }
): Promise<void> {
  await page.evaluate(
    ({ id, at }) => {
      const el = document.querySelector(`.svelte-flow__node[data-id="${id}"]`);
      if (!el) throw new Error(`node not found: ${id}`);
      const rect = el.getBoundingClientRect();
      el.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          clientX: at?.clientX ?? rect.left + 8,
          clientY: at?.clientY ?? rect.top + 8,
          button: 2,
        })
      );
    },
    { id: nodeId, at }
  );
  await page.waitForSelector('[role="menu"]', { timeout: 5000 });
}

async function openGroupContextMenu(page: Page, groupId: string): Promise<void> {
  await openNodeContextMenu(page, groupId);
}

/** Seeds a tab with two sibling groups (g1, g2) inside main for drop-into tests. */
async function seedSiblingGroups(page: Page): Promise<void> {
  await page.evaluate(
    ({ plugin, file, key }) => {
      const wb = (window as SeededWindow)._chaosforge_state!.workbench!;
      wb.projectPath = "/mock/workspace";
      wb.activePlugin = { name: plugin, files: [] };
      wb.nodeRegistry = [];
      wb.fileContents = { ...wb.fileContents, [key]: "// --- [NODE: alpha] ---\n" };
      wb.canvasContents = {
        ...wb.canvasContents,
        [key]: {
          version: 2,
          nodes: [
            { id: "main_group", label: "Main Logic", x: 50, y: 50, type: "group", style: "width: 900px; height: 600px;" },
            { id: "g1", label: "Group One", x: 60, y: 60, type: "group", parentId: "main_group", style: "width: 240px; height: 170px;" },
            { id: "g2", label: "Group Two", x: 480, y: 300, type: "group", parentId: "main_group", style: "width: 300px; height: 220px;" },
            { id: "alpha", label: "alpha", x: 30, y: 60, parentId: "g1" },
          ],
          edges: [],
        },
      };
      wb.openTab(plugin, file);
      wb.setTabViewMode(plugin, file, "visual");
    },
    { plugin: PLUGIN, file: FILE, key: KEY }
  );
  await page.waitForSelector('[data-group-id="g2"]', { timeout: 10000 });
}

test.describe("Group containment UX", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("nav");
  });

  test("sanitizes corrupted -Infinity group width on load", async ({ page }) => {
    await page.evaluate(
      ({ plugin, file, key }) => {
        const wb = (window as SeededWindow)._chaosforge_state!.workbench!;
        wb.projectPath = "/mock/workspace";
        wb.activePlugin = { name: plugin, files: [] };
        wb.fileContents = { ...wb.fileContents, [key]: "// --- [NODE: alpha] ---\n" };
        wb.canvasContents = {
          ...wb.canvasContents,
          [key]: {
            version: 2,
            nodes: [
              {
                id: "main_group",
                label: "Main Logic",
                x: 50,
                y: 50,
                type: "group",
                style: "width: 800px; height: 600px;",
              },
              {
                id: "bad_group",
                label: "Broken",
                x: 100,
                y: 100,
                type: "group",
                parentId: "main_group",
                style: "width: -Infinitypx; height: 50px;",
              },
              { id: "alpha", label: "alpha", x: 120, y: 120, parentId: "bad_group" },
            ],
            edges: [],
          },
        };
        wb.openTab(plugin, file);
        wb.setTabViewMode(plugin, file, "visual");
      },
      { plugin: PLUGIN, file: FILE, key: KEY }
    );

    await page.waitForSelector('[data-group-id="bad_group"]', { timeout: 10000 });
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    const style = await page.evaluate(() => {
      const nodes = (window as SeededWindow)._chaosforge_state!.editorGraph!.getNodes() as unknown as Array<{
        id: string;
        style?: string;
      }>;
      return nodes.find((n) => n.id === "bad_group")?.style ?? "";
    });
    // The corrupted -Infinity width must heal to a finite size no smaller than
    // the structural minimum (it may grow further to fit the contained node).
    const width = parseFloat(style.match(/width:\s*([-\d.]+)px/)?.[1] ?? "NaN");
    expect(Number.isFinite(width)).toBe(true);
    expect(width).toBeGreaterThanOrEqual(220);
  });

  test("preserves nested group parentId in the sidecar after load", async ({ page }) => {
    await seedGroupGraph(page);
    await page.waitForTimeout(300);
    const inner = await canvasNode(page, "inner_group");
    expect(inner?.parentId).toBe("main_group");
  });

  test("Add to group menu moves a node into the chosen group", async ({ page }) => {
    await seedGroupGraph(page);
    await openNodeContextMenu(page, "alpha");
    await page.locator('[data-testid="ctx-add-to-group"]').click();
    await page.locator('[data-testid="ctx-group-option"][data-group-id="inner_group"]').click();

    await page.waitForTimeout(400);
    const alpha = await canvasNode(page, "alpha");
    expect(alpha?.parentId).toBe("inner_group");
  });

  test("hovering Add to group highlights the target group", async ({ page }) => {
    await seedGroupGraph(page);
    await openNodeContextMenu(page, "alpha");
    await page.locator('[data-testid="ctx-add-to-group"]').click();
    const option = page.locator('[data-testid="ctx-group-option"][data-group-id="inner_group"]');
    await expect(option).toBeVisible();
    await option.hover();
    await expect(
      page.locator('[data-group-id="inner_group"][data-group-highlight="true"]')
    ).toBeVisible();
  });

  test("dragging a node out of its group clears parentId", async ({ page }) => {
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);

    const groupId = await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      return graph.resolveDropTargetAtPoint("beta", { x: 900, y: 700 });
    });
    expect(groupId).toBeNull();

    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.nodeActions.handleNodeDragStop("beta", null);
    });

    await page.waitForTimeout(400);
    const betaMeta = await canvasNode(page, "beta");
    expect(betaMeta?.parentId).toBeUndefined();
  });

  test("cursor outside inner group but inside main re-parents to main_group", async ({
    page,
  }) => {
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);

    const target = await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      // Flow point inside main (50..850) but left of inner's abs left edge (~470).
      return graph.resolveDropTargetAtPoint("beta", { x: 200, y: 300 });
    });
    expect(target).toBe("main_group");

    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.nodeActions.handleNodeDragStop("beta", "main_group");
    });
    await page.waitForTimeout(400);

    const betaMeta = await canvasNode(page, "beta");
    expect(betaMeta?.parentId).toBe("main_group");
  });

  test("multi-select drop places every dragged node into the target group", async ({ page }) => {
    // Issue: "If multiple things ARE selected and being moved, they should all be
    // placed into a group if they are dropped there." alpha is in main_group and
    // beta is in inner_group; dropping both onto inner_group moves both in.
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.waitForTimeout(300);

    expect((await canvasNode(page, "alpha"))?.parentId).toBe("main_group");
    expect((await canvasNode(page, "beta"))?.parentId).toBe("inner_group");

    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.nodeActions.handleNodesDragStop(["alpha", "beta"], "inner_group");
    });
    await page.waitForTimeout(400);

    expect((await canvasNode(page, "alpha"))?.parentId).toBe("inner_group");
    expect((await canvasNode(page, "beta"))?.parentId).toBe("inner_group");
  });

  test("multi-select drop outside all groups detaches every dragged node", async ({ page }) => {
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.nodeActions.handleNodesDragStop(["alpha", "beta"], null);
    });
    await page.waitForTimeout(400);

    expect((await canvasNode(page, "alpha"))?.parentId).toBeUndefined();
    expect((await canvasNode(page, "beta"))?.parentId).toBeUndefined();
  });

  test("a membership change resets the target group's manual size to auto-fit", async ({
    page,
  }) => {
    // Confirmed rule: manual size persists across reloads but yields to snug
    // auto-fit whenever the contents change. Enlarge inner_group, then pull its
    // member out: the manual override must clear so it re-snugs.
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.patchNode("inner_group", { width: 560, height: 420 });
      graph.nodeActions.handleGroupResize("inner_group");
    });
    await page.waitForTimeout(400);

    const manualBefore = await groupManualSize(page, "inner_group");
    expect(manualBefore.manualWidth).toBe(560);
    const enlarged = await groupSize(page, "inner_group");

    // Move beta out: inner_group loses its only member and must re-snug.
    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.nodeActions.handleNodeDragStop("beta", null);
    });
    await page.waitForTimeout(400);

    const manualAfter = await groupManualSize(page, "inner_group");
    expect(manualAfter.manualWidth).toBeUndefined();
    expect(manualAfter.manualHeight).toBeUndefined();
    const shrunk = await groupSize(page, "inner_group");
    expect(shrunk.width).toBeLessThan(enlarged.width);
  });

  test("a member entering a manually-sized group resets it to auto-fit", async ({ page }) => {
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.waitForTimeout(300);

    // Enlarge inner_group manually.
    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.patchNode("inner_group", { width: 560, height: 420 });
      graph.nodeActions.handleGroupResize("inner_group");
    });
    await page.waitForTimeout(400);
    expect((await groupManualSize(page, "inner_group")).manualWidth).toBe(560);

    // Add alpha into it: membership changed, manual override clears.
    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.nodeActions.handleAddToGroup("alpha", "inner_group");
    });
    await page.waitForTimeout(400);

    expect((await groupManualSize(page, "inner_group")).manualWidth).toBeUndefined();
  });

  test("highlighting a drop group mid-drag never resizes or moves it (mid-drag lock)", async ({
    page,
  }) => {
    // Mid-drag lock: while a drag is in flight only the highlight changes - group
    // geometry must not recompute until drop. setGroupHighlight is the mid-drag
    // path, so toggling it must leave every group's size and position untouched.
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.waitForTimeout(300);

    const sizeBefore = await groupSize(page, "inner_group");
    const posBefore = await nodePosition(page, "inner_group");
    const mainBefore = await groupSize(page, "main_group");

    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.nodeActions.setGroupHighlight("inner_group");
    });
    await page.waitForTimeout(150);

    expect(await groupSize(page, "inner_group")).toEqual(sizeBefore);
    expect(await nodePosition(page, "inner_group")).toEqual(posBefore);
    expect(await groupSize(page, "main_group")).toEqual(mainBefore);

    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.nodeActions.setGroupHighlight(null);
    });
  });

  test("keeps parent groups ordered before their children after re-parenting", async ({ page }) => {
    // Svelte Flow positions a child relative to whichever parent precedes it in
    // the nodes array. If a re-parented child lands before its parent, its
    // rendered position and drag math drift (the "strange positions when
    // panning/zooming and dragging" report). Re-parenting must keep parent-first
    // order intact.
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);

    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.nodeActions.handleAddToGroup("alpha", "inner_group");
    });
    await page.waitForTimeout(400);

    const order = await page.evaluate(() => {
      const nodes = (window as SeededWindow)._chaosforge_state!.editorGraph!.getNodes() as unknown as Array<{
        id: string;
      }>;
      return nodes.map((n) => n.id);
    });

    const idx = (id: string) => order.indexOf(id);
    expect(idx("main_group")).toBeGreaterThanOrEqual(0);
    expect(idx("main_group")).toBeLessThan(idx("inner_group"));
    expect(idx("inner_group")).toBeLessThan(idx("alpha"));
    expect(idx("inner_group")).toBeLessThan(idx("beta"));
  });

  test("a group re-fits (shrinks) toward the floor when its only member leaves", async ({
    page,
  }) => {
    // Snug auto-fit: removing the last member collapses the group to its
    // header-fit floor instead of keeping (and compounding) a stale large size.
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.waitForTimeout(300);

    const before = await groupSize(page, "inner_group");

    // Pull the only member out of inner_group.
    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.nodeActions.handleNodeDragStop("beta", null);
    });
    await page.waitForTimeout(400);

    const after = await groupSize(page, "inner_group");
    // It re-fit no larger than before, and never below the structural floor.
    expect(after.width).toBeLessThanOrEqual(before.width);
    expect(after.width).toBeGreaterThanOrEqual(220);
    expect(after.height).toBeGreaterThanOrEqual(140);
  });

  test("manual resize grows a group and persists the new size", async ({ page }) => {
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.waitForTimeout(300);

    // Simulate a NodeResizer commit: the plugin writes width/height first, then
    // handleGroupResize mirrors it into style + runs the grow-only recompute.
    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.patchNode("inner_group", { width: 560, height: 420 });
      graph.nodeActions.handleGroupResize("inner_group");
    });
    await page.waitForTimeout(400);

    const size = await groupSize(page, "inner_group");
    expect(size.width).toBe(560);
    expect(size.height).toBe(420);

    // And it round-trips to the sidecar.
    const meta = await canvasNode(page, "inner_group");
    expect(meta?.style).toMatch(/width:\s*560px/);
  });

  test("the dashed group border hugs the wrapper box after a resize", async ({ page }) => {
    // Regression: xyflow's default group padding inset CustomGroupNode's body
    // while its min-size forced it to the full node size, painting the dashed
    // border ~11px outside the wrapper on the bottom-right after a resize. The
    // body's border-box must coincide with the wrapper's box at every size.
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.waitForTimeout(300);

    const boxes = async (id: string) =>
      page.evaluate((gid) => {
        const wrap = document.querySelector(`.svelte-flow__node[data-id="${gid}"]`);
        const body = document.querySelector(`[data-group-id="${gid}"]`);
        const r = (el: Element | null) => {
          if (!el) return null;
          const b = el.getBoundingClientRect();
          return {
            left: Math.round(b.left),
            top: Math.round(b.top),
            right: Math.round(b.right),
            bottom: Math.round(b.bottom),
          };
        };
        return { wrapper: r(wrap), body: r(body) };
      }, id);

    const assertHugs = (
      m: { wrapper: { left: number; top: number; right: number; bottom: number } | null; body: { left: number; top: number; right: number; bottom: number } | null }
    ) => {
      expect(m.wrapper).not.toBeNull();
      expect(m.body).not.toBeNull();
      // Allow a 1px rounding tolerance on every edge.
      expect(Math.abs(m.body!.left - m.wrapper!.left)).toBeLessThanOrEqual(1);
      expect(Math.abs(m.body!.top - m.wrapper!.top)).toBeLessThanOrEqual(1);
      expect(Math.abs(m.body!.right - m.wrapper!.right)).toBeLessThanOrEqual(1);
      expect(Math.abs(m.body!.bottom - m.wrapper!.bottom)).toBeLessThanOrEqual(1);
    };

    assertHugs(await boxes("inner_group"));

    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.patchNode("inner_group", { width: 480, height: 360 });
      graph.nodeActions.handleGroupResize("inner_group");
    });
    await page.waitForTimeout(400);

    assertHugs(await boxes("inner_group"));
    // main_group keeps its own primary wrapper border but must not gap either.
    assertHugs(await boxes("main_group"));
  });

  test("manual resize can shrink back down after a prior enlarge", async ({ page }) => {
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.waitForTimeout(300);

    const snugSize = await groupSize(page, "inner_group");

    // Enlarge past the content floor (simulates a NodeResizer commit).
    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.patchNode("inner_group", { width: 560, height: 420 });
      graph.nodeActions.handleGroupResize("inner_group");
    });
    await page.waitForTimeout(400);

    const enlarged = await groupSize(page, "inner_group");
    expect(enlarged.width).toBe(560);
    expect(enlarged.height).toBe(420);

    // Shrink back to the snug content floor; handleGroupResize must drop manual.
    const floor = await page.evaluate(() => {
      const nodes = (window as SeededWindow)._chaosforge_state!.editorGraph!.getNodes() as unknown as Array<{
        id: string;
        data?: { minWidth?: number; minHeight?: number };
      }>;
      const g = nodes.find((n) => n.id === "inner_group");
      return { minWidth: g?.data?.minWidth ?? 0, minHeight: g?.data?.minHeight ?? 0 };
    });

    await page.evaluate(
      ({ w, h }) => {
        const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
        graph.patchNode("inner_group", { width: w, height: h });
        graph.nodeActions.handleGroupResize("inner_group");
      },
      { w: floor.minWidth, h: floor.minHeight }
    );
    await page.waitForTimeout(400);

    const afterShrink = await groupSize(page, "inner_group");
    expect(afterShrink.width).toBeLessThan(enlarged.width);
    expect(afterShrink.height).toBeLessThan(enlarged.height);
    expect(afterShrink.width).toBeGreaterThanOrEqual(snugSize.width - 40);
    expect(afterShrink.height).toBeGreaterThanOrEqual(snugSize.height - 40);
  });

  test("resize handles stay visible after a resize commit (worked-then-stopped)", async ({
    page,
  }) => {
    // Regression: the handles "kind of worked for a moment, then stopped". A
    // resize commit re-runs the parse effect, which rebuilt nodes from the parser
    // and dropped the live `selected` flag. NodeResizer gates its handles on
    // `selected`, so they vanished after the first resize. The parse re-commit
    // must preserve transient selection so the handles persist.
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.waitForTimeout(300);

    // Select the group (click a clear body spot away from the header/child).
    const box = await page.locator('[data-group-id="inner_group"]').boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width - 16, box!.y + box!.height - 16);
    await page.waitForTimeout(150);

    const handles = page.locator(
      '.svelte-flow__node[data-id="inner_group"] .svelte-flow__resize-control'
    );
    expect(await handles.count()).toBeGreaterThan(0);

    // Commit a resize the way NodeResizer does (write size, then notify).
    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.patchNode("inner_group", { width: 480, height: 360 });
      graph.nodeActions.handleGroupResize("inner_group");
    });
    await page.waitForTimeout(400);

    // The group is still selected, so its resize handles are still in the DOM.
    const stillSelected = await page.evaluate(() => {
      const nodes = (window as SeededWindow)._chaosforge_state!.editorGraph!.getNodes() as unknown as Array<{
        id: string;
        selected?: boolean;
      }>;
      return nodes.find((n) => n.id === "inner_group")?.selected === true;
    });
    expect(stillSelected).toBe(true);
    expect(await handles.count()).toBeGreaterThan(0);
  });

  test("all four resize edges/corners are grabbable, not covered by the group body", async ({
    page,
  }) => {
    // Regression for "worked for a moment, then stopped": the group's own body
    // div renders after <NodeResizer> in the same stacking context, so without a
    // z-index lift it painted over the right/bottom edge controls - only the
    // top/left handles were grabbable. Every control's hit-test must resolve to a
    // resize-control of the selected group (its own body must never win).
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.waitForTimeout(300);

    for (const gid of ["inner_group", "main_group"]) {
      const box = await page.locator(`[data-group-id="${gid}"]`).boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.click(box!.x + box!.width - 16, box!.y + box!.height - 16);
      await page.waitForTimeout(150);

      const occluded = await page.evaluate((id) => {
        const nodeEl = document.querySelector(`.svelte-flow__node[data-id="${id}"]`);
        const controls = nodeEl
          ? Array.from(nodeEl.querySelectorAll(".svelte-flow__resize-control"))
          : [];
        return controls
          .map((c) => {
            const r = (c as HTMLElement).getBoundingClientRect();
            const top = document.elementFromPoint(
              r.left + r.width / 2,
              r.top + r.height / 2
            ) as HTMLElement | null;
            // Grabbable when the topmost element at the control's center is itself
            // a resize control (this group's own body div must not cover it).
            return top?.classList.contains("svelte-flow__resize-control")
              ? null
              : ((c as HTMLElement).className.match(/\b(top|right|bottom|left)\b/g) ?? []).join(
                  " "
                );
          })
          .filter((x): x is string => x !== null);
      }, gid);

      // Expect all eight controls present and none occluded by the body.
      expect(occluded, `${gid} occluded controls`).toEqual([]);
    }
  });

  test("manual resize cannot shrink a group below its content floor", async ({ page }) => {
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.waitForTimeout(300);

    // Attempt to collapse the group far below its members.
    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.patchNode("inner_group", { width: 40, height: 40 });
      graph.nodeActions.handleGroupResize("inner_group");
    });
    await page.waitForTimeout(400);

    // Read the live content floor AFTER the recompute (it derives from the
    // child's measured size, which can jitter between reads). The clamp must hold
    // against that current floor, and the 40px collapse must not have taken hold.
    const floor = await page.evaluate(() => {
      const nodes = (window as SeededWindow)._chaosforge_state!.editorGraph!.getNodes() as unknown as Array<{
        id: string;
        data?: { minWidth?: number; minHeight?: number };
      }>;
      const g = nodes.find((n) => n.id === "inner_group");
      return { minWidth: g?.data?.minWidth ?? 0, minHeight: g?.data?.minHeight ?? 0 };
    });

    const size = await groupSize(page, "inner_group");
    expect(size.width).toBeGreaterThanOrEqual(floor.minWidth);
    expect(size.height).toBeGreaterThanOrEqual(floor.minHeight);
    // The attempted 40px collapse never took hold: it stays at the content floor.
    expect(size.width).toBeGreaterThanOrEqual(220);
    expect(size.height).toBeGreaterThanOrEqual(140);
  });

  test("a group can be dragged out of its parent group to the root", async ({ page }) => {
    // Issue: clicking & dragging must let a GROUP (not just a node) be removed
    // from any group. inner_group starts inside main_group; a null drop detaches.
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    expect((await canvasNode(page, "inner_group"))?.parentId).toBe("main_group");

    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.nodeActions.handleNodeDragStop("inner_group", null);
    });
    await page.waitForTimeout(400);
    expect((await canvasNode(page, "inner_group"))?.parentId).toBeUndefined();

    // And it can be nested back into a group the same way.
    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.nodeActions.handleNodeDragStop("inner_group", "main_group");
    });
    await page.waitForTimeout(400);
    expect((await canvasNode(page, "inner_group"))?.parentId).toBe("main_group");
  });

  test("body-dragging a group moves it without resizing it", async ({ page }) => {
    // Issue 1: a click+drag on the group body must MOVE the group, never resize
    // it. Resizing is exclusive to the selection-only NodeResizer handles.
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.waitForTimeout(300);

    const sizeBefore = await groupSize(page, "inner_group");
    const posBefore = await nodePosition(page, "inner_group");

    // Grab a clear body spot (lower-right interior, clear of the header title and
    // the child node) so we drag the group itself, not a child or resize handle.
    const box = await page
      .locator('[data-group-id="inner_group"]')
      .boundingBox();
    expect(box).not.toBeNull();
    const startX = box!.x + box!.width - 18;
    const startY = box!.y + box!.height - 18;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 60, startY + 50, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const sizeAfter = await groupSize(page, "inner_group");
    const posAfter = await nodePosition(page, "inner_group");

    // The group MOVED (a body drag is a move)...
    const moved =
      Math.abs(posAfter.x - posBefore.x) > 1 || Math.abs(posAfter.y - posBefore.y) > 1;
    expect(moved).toBe(true);

    // ...and was NOT resized. A resize-handle drag would have changed a dimension
    // by ~the 60/50px drag distance; grow-only re-measurement noise stays small,
    // so a sub-40px delta proves the resize handles were never engaged.
    expect(Math.abs(sizeAfter.width - sizeBefore.width)).toBeLessThan(40);
    expect(Math.abs(sizeAfter.height - sizeBefore.height)).toBeLessThan(40);
  });

  test("header drag moves a group without entering rename mode", async ({ page }) => {
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.waitForTimeout(300);

    const title = page.locator('[data-group-id="inner_group"] [data-testid="flow-group-title"]');
    await expect(title).toBeVisible();
    const titleBox = await title.boundingBox();
    expect(titleBox).not.toBeNull();

    const posBefore = await nodePosition(page, "inner_group");
    const startX = titleBox!.x + titleBox!.width / 2;
    const startY = titleBox!.y + titleBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 55, startY + 45, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    const posAfter = await nodePosition(page, "inner_group");
    const moved =
      Math.abs(posAfter.x - posBefore.x) > 1 || Math.abs(posAfter.y - posBefore.y) > 1;
    expect(moved).toBe(true);
    await expect(page.locator('[data-group-id="inner_group"] input')).toHaveCount(0);
  });

  test("pointer-dragging a group header outside main detaches it from main_group", async ({
    page,
  }) => {
    // Real pointer drag (not handleNodeDragStop): cursor lands outside every group
    // so inner_group becomes a root-level group.
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.waitForTimeout(300);
    expect((await canvasNode(page, "inner_group"))?.parentId).toBe("main_group");

    const header = page.locator('[data-group-id="inner_group"] [data-testid="flow-group-header"]');
    const headerBox = await header.boundingBox();
    expect(headerBox).not.toBeNull();

    const startX = headerBox!.x + headerBox!.width / 2;
    const startY = headerBox!.y + headerBox!.height / 2;

    // Drag far enough left that the group's absolute center exits main_group's bounds.
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 700, startY, { steps: 24 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    const detached = await canvasNode(page, "inner_group");
    expect(detached?.parentId).toBeUndefined();
  });

  test("header-dragging a group over a sibling group nests it under that sibling", async ({
    page,
  }) => {
    // Regression: drop membership for a dragged group used the group's geometric
    // center, so releasing its header over another group did not nest it. The
    // cursor (the held header) is now authoritative, so a group drops into the
    // group it is released over.
    await seedSiblingGroups(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.waitForTimeout(300);
    expect((await canvasNode(page, "g1"))?.parentId).toBe("main_group");

    const g1Header = page.locator('[data-group-id="g1"] [data-testid="flow-group-header"]');
    const g2 = page.locator('[data-group-id="g2"]');
    const hBox = await g1Header.boundingBox();
    const tBox = await g2.boundingBox();
    expect(hBox).not.toBeNull();
    expect(tBox).not.toBeNull();

    const startX = hBox!.x + hBox!.width / 2;
    const startY = hBox!.y + hBox!.height / 2;
    // Release the header well inside g2's box.
    const targetX = tBox!.x + tBox!.width / 2;
    const targetY = tBox!.y + tBox!.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(targetX, targetY, { steps: 24 });
    await page.mouse.up();
    await page.waitForTimeout(500);

    expect((await canvasNode(page, "g1"))?.parentId).toBe("g2");
  });

  test("New Group with no selection creates an empty group inside Main Logic", async ({
    page,
  }) => {
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.waitForTimeout(300);

    // The handler names the group via window.prompt; accept with a known label.
    page.once("dialog", (dialog) => dialog.accept("Empty Segment"));
    await page.locator('[data-testid="visual-new-group-btn"]').click();
    await page.waitForTimeout(400);

    const created = await page.evaluate(() => {
      const nodes = (window as SeededWindow)._chaosforge_state!.editorGraph!.getNodes() as unknown as Array<{
        id: string;
        type?: string;
        parentId?: string;
        data?: { label?: string };
      }>;
      const group = nodes.find((n) => n.type === "group" && n.data?.label === "Empty Segment");
      if (!group) return null;
      const childCount = nodes.filter((n) => n.parentId === group.id).length;
      return { id: group.id, parentId: group.parentId, childCount };
    });

    expect(created).not.toBeNull();
    expect(created!.parentId).toBe("main_group");
    expect(created!.childCount).toBe(0);
  });

  test("right-clicking a nested group opens detach and move-to-group actions", async ({
    page,
  }) => {
    await seedGroupGraph(page);
    await openGroupContextMenu(page, "inner_group");
    await expect(page.locator('[data-testid="ctx-rename-group"]')).toBeVisible();
    await expect(page.locator('[data-testid="ctx-detach-group"]')).toBeVisible();
    await expect(page.locator('[data-testid="ctx-delete-group"]')).toBeVisible();
  });

  test("editable group title shows a double-click rename tooltip", async ({ page }) => {
    await seedGroupGraph(page);
    const innerTitle = page.locator(
      '[data-group-id="inner_group"] [data-testid="flow-group-title"]'
    );
    await expect(innerTitle).toHaveAttribute("title", "Double click to rename");
    const mainTitle = page.locator('[data-group-id="main_group"] [data-testid="flow-group-header"] span');
    await expect(mainTitle).not.toHaveAttribute("title", "Double click to rename");
  });

  test("Rename from the group context menu focuses the title input and commits", async ({
    page,
  }) => {
    await seedGroupGraph(page);
    await openGroupContextMenu(page, "inner_group");
    await page.locator('[data-testid="ctx-rename-group"]').click();

    const input = page.locator('[data-group-id="inner_group"] input');
    await expect(input).toBeVisible();
    await expect(input).toBeFocused();
    await input.fill("Renamed Segment");
    await input.press("Enter");
    await page.waitForTimeout(300);

    const meta = await canvasNode(page, "inner_group");
    expect(meta?.label).toBe("Renamed Segment");
  });

  test("handleDeleteGroup removes a group and every descendant (API)", async ({ page }) => {
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.evaluate(() => {
      (window as SeededWindow)._chaosforge_state!.editorGraph!.nodeActions.handleDeleteGroup(
        "inner_group"
      );
    });
    await page.waitForTimeout(400);
    const ids = await page.evaluate(() =>
      (window as SeededWindow)._chaosforge_state!.editorGraph!.getNodes().map(
        (n) => (n as unknown as { id: string }).id
      )
    );
    expect(ids).not.toContain("inner_group");
    expect(ids).not.toContain("beta");
    expect(ids).toContain("alpha");
  });

  test("delete group warns and cascades removal of contained nodes", async ({ page }) => {
    await seedGroupGraph(page);
    await openGroupContextMenu(page, "inner_group");
    await page.locator('[data-testid="ctx-delete-group"]').click();
    await expect(page.locator('[data-testid="delete-group-confirm-btn"]')).toBeVisible();
    await expect(page.getByText("1 contained item")).toBeVisible();
    await page.locator('[data-testid="delete-group-confirm-btn"]').click();
    await page.waitForTimeout(600);

    const ids = await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      return graph.getNodes().map((n) => (n as unknown as { id: string }).id);
    });
    expect(ids).not.toContain("inner_group");
    expect(ids).not.toContain("beta");
    expect(ids).toContain("alpha");
    expect(await canvasNode(page, "inner_group")).toBeNull();
  });

  test("an emptied group cannot shrink below the header-fit floor", async ({ page }) => {
    // Issue 3: with no members, the minimum must still keep the title visible.
    await seedGroupGraph(page);
    await page.waitForFunction(() => !!(window as SeededWindow)._chaosforge_state?.editorGraph);
    await page.waitForTimeout(300);

    // Empty the group by pulling its only member to the root.
    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.nodeActions.handleNodeDragStop("beta", null);
    });
    await page.waitForTimeout(300);

    // Try to collapse the now-empty group to nothing.
    await page.evaluate(() => {
      const graph = (window as SeededWindow)._chaosforge_state!.editorGraph!;
      graph.patchNode("inner_group", { width: 30, height: 30 });
      graph.nodeActions.handleGroupResize("inner_group");
    });
    await page.waitForTimeout(400);

    const size = await groupSize(page, "inner_group");
    expect(size.width).toBeGreaterThanOrEqual(220);
    expect(size.height).toBeGreaterThanOrEqual(140);

    // The header stays rendered and visible at the minimum size.
    const header = page.locator(
      '[data-group-id="inner_group"] [data-testid="flow-group-header"]'
    );
    await expect(header).toBeVisible();
    const headerBox = await header.boundingBox();
    expect(headerBox!.height).toBeGreaterThan(0);
  });

  test("Add to group submenu flies out to the side without overlapping the menu", async ({
    page,
  }) => {
    // Issue 6: the submenu must open to the available-space side, not overlay the
    // parent menu. Default (room on the right) → opens right, no overlap.
    await seedGroupGraph(page);
    await openNodeContextMenu(page, "alpha", { clientX: 120, clientY: 160 });
    await page.locator('[data-testid="ctx-add-to-group"]').click();

    const submenu = page.locator('[data-testid="ctx-group-submenu"]');
    await expect(submenu).toBeVisible();
    await expect(submenu).toHaveAttribute("data-side", "right");

    const parentBox = await page.locator('[role="menu"]').boundingBox();
    const subBox = await submenu.boundingBox();
    const viewport = page.viewportSize()!;

    // No horizontal overlap with the parent menu, and fully on-screen.
    expect(subBox!.x).toBeGreaterThanOrEqual(parentBox!.x + parentBox!.width - 1);
    expect(subBox!.x).toBeGreaterThanOrEqual(0);
    expect(subBox!.x + subBox!.width).toBeLessThanOrEqual(viewport.width + 1);
  });

  test("Add to group submenu flips to the left near the right viewport edge", async ({
    page,
  }) => {
    await seedGroupGraph(page);
    const viewport = page.viewportSize()!;
    // Open the node menu hard against the right edge so a right-flyout has no room.
    await openNodeContextMenu(page, "alpha", {
      clientX: viewport.width - 20,
      clientY: 160,
    });
    await page.locator('[data-testid="ctx-add-to-group"]').click();

    const submenu = page.locator('[data-testid="ctx-group-submenu"]');
    await expect(submenu).toBeVisible();
    await expect(submenu).toHaveAttribute("data-side", "left");

    const subBox = await submenu.boundingBox();
    expect(subBox!.x).toBeGreaterThanOrEqual(0);
    expect(subBox!.x + subBox!.width).toBeLessThanOrEqual(viewport.width + 1);
  });
});
