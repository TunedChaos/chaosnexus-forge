// chaosnexus-forge/src/lib/dual_editor/markdown_render.test.ts
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown_render";

describe("renderMarkdown", () => {
  it("returns empty string for blank input", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("   ")).toBe("");
  });

  it("renders headings and bold text", () => {
    const html = renderMarkdown("# Title\n\n**bold**");
    expect(html).toContain("<h1>");
    expect(html).toContain("Title");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("strips unsafe script tags from markdown HTML", () => {
    const html = renderMarkdown('<script>alert("xss")</script>\n\nSafe text');
    expect(html).not.toContain("<script");
    expect(html).toContain("Safe text");
  });

  it("renders GFM tables", () => {
    const html = renderMarkdown("| A | B |\n| --- | --- |\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>");
  });
});
