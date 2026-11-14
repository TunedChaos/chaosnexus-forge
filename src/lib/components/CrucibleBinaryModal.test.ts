// chaosnexus-forge/src/lib/components/CrucibleBinaryModal.test.ts
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import { appSettings } from "$lib/settings.svelte";
import CrucibleBinaryModal from "./CrucibleBinaryModal.svelte";

describe("CrucibleBinaryModal", () => {
  it("renders modal dialog when open is true", () => {
    const { getByTestId, getByText } = render(CrucibleBinaryModal, {
      props: {
        open: true,
        onClose: () => {},
        onSaveAndStart: async () => {},
      },
    });

    expect(getByText("Crucible LLM Binary Path")).toBeTruthy();
    expect(getByTestId("crucible-bin-input")).toBeTruthy();
    expect(getByTestId("crucible-browse-btn")).toBeTruthy();
  });

  it("disables submit button when path is empty", async () => {
    const { getByTestId } = render(CrucibleBinaryModal, {
      props: {
        open: true,
        onClose: () => {},
        onSaveAndStart: async () => {},
      },
    });

    const input = getByTestId("crucible-bin-input") as HTMLInputElement;
    const submitBtn = getByTestId("crucible-modal-submit") as HTMLButtonElement;

    await fireEvent.input(input, { target: { value: "" } });
    expect(submitBtn.disabled).toBe(true);
  });

  it("calls onSaveAndStart when Save & Start LLM is clicked", async () => {
    vi.spyOn(appSettings, "save").mockResolvedValue(true);
    const onSaveAndStart = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    const { getByTestId } = render(CrucibleBinaryModal, {
      props: {
        open: true,
        onClose,
        onSaveAndStart,
      },
    });

    const input = getByTestId("crucible-bin-input") as HTMLInputElement;
    const submitBtn = getByTestId("crucible-modal-submit") as HTMLButtonElement;

    await fireEvent.input(input, { target: { value: "/usr/local/bin/chaosnexus-crucible" } });
    expect(submitBtn.disabled).toBe(false);

    await fireEvent.click(submitBtn);

    expect(onSaveAndStart).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
