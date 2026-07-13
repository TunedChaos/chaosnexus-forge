// chaosnexus-forge/src/lib/dual_editor/markdown_render.ts
//
// Sanitized markdown-to-HTML rendering for the live preview pane.
// Plugin documentation may be untrusted, so output always passes DOMPurify.

import DOMPurify from "dompurify";
import { marked } from "marked";

/** GFM: tables, task lists, strikethrough, autolinks, line breaks. */
marked.setOptions({
  gfm: true,
  breaks: true,
});

/**
 * Renders markdown source to sanitized HTML for preview display.
 * Returns an empty string during SSR or when input is empty.
 */
export function renderMarkdown(src: string): string {
  if (!src.trim()) return "";
  if (typeof window === "undefined") return "";

  const raw = marked.parse(src, { async: false }) as string;
  return DOMPurify.sanitize(raw);
}
