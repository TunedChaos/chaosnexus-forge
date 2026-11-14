// chaosnexus-forge/src/routes/page.test.ts
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/svelte";

vi.mock("$lib/dual_editor/monaco_host", () => ({
  createMonacoHost: vi.fn(),
  bindEditorActionShortcuts: vi.fn()
}));

vi.mock("$lib/dual_editor/monaco_loader", () => ({
  loadMonaco: vi.fn().mockResolvedValue({}),
  warmMonaco: vi.fn().mockResolvedValue(undefined),
  scheduleMonacoWarmup: vi.fn()
}));

import Page from "./+page.svelte";

describe("Index Page", () => {
  it("renders the dual editor container", () => {
    const { container } = render(Page);
    expect(container.querySelector(".h-full.w-full")).toBeTruthy();
  });
});
