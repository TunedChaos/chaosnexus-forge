// chaosnexus-forge/src/lib/components/VisualToolbar.test.ts
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import VisualToolbarTestWrapper from "./VisualToolbarTestWrapper.svelte";

describe("VisualToolbar", () => {
  it("renders the Regenerate button when enabled", () => {
    const onRegenerate = vi.fn();
    const { getByTestId } = render(VisualToolbarTestWrapper, {
      props: {
        onRegenerate,
        canRegenerate: true,
      },
    });

    const btn = getByTestId("visual-regenerate-btn") as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(false);
    expect(btn.title).toContain("Regenerate visual canvas");
  });

  it("disables the Regenerate button and sets error tooltip when syntax is invalid", () => {
    const { getByTestId } = render(VisualToolbarTestWrapper, {
      props: {
        canRegenerate: false,
        regenerateTooltip: "Cannot regenerate: Unclosed code block (1 missing '}')",
      },
    });

    const btn = getByTestId("visual-regenerate-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.title).toBe("Cannot regenerate: Unclosed code block (1 missing '}')");
  });

  it("triggers onRegenerate when clicked", async () => {
    const onRegenerate = vi.fn();
    const { getByTestId } = render(VisualToolbarTestWrapper, {
      props: {
        onRegenerate,
        canRegenerate: true,
      },
    });

    const btn = getByTestId("visual-regenerate-btn");
    await fireEvent.click(btn);
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });
});
