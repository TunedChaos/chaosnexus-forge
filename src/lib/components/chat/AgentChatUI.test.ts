// chaosnexus-forge/src/lib/components/chat/AgentChatUI.test.ts
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import AgentChatUI from "./AgentChatUI.svelte";

describe("AgentChatUI", () => {
  it("renders agent chat panel and provider selector", () => {
    const { container, getByText } = render(AgentChatUI);
    expect(getByText("Agent Chat")).toBeTruthy();
    expect(container.querySelector("select")).toBeTruthy();
  });

  it("handles prompt submission in fallback mode", async () => {
    const { container, getByPlaceholderText } = render(AgentChatUI);
    const textarea = getByPlaceholderText("Ask the agent to review or approve changes...") as HTMLTextAreaElement;
    
    await fireEvent.input(textarea, { target: { value: "File system parsing test" } });
    const sendButton = container.querySelector("button[aria-label='Send Message']") as HTMLButtonElement;
    await fireEvent.click(sendButton);

    expect(container.textContent).toContain("File system parsed successfully");
  });
});
