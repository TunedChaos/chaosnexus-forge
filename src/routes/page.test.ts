import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import Page from "./+page.svelte";

describe("Index Page", () => {
  it("renders the dual editor container", () => {
    const { container } = render(Page);
    expect(container.querySelector(".h-full.w-full")).toBeTruthy();
  });
});
