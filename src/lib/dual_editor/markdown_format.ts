// chaosnexus-forge/src/lib/dual_editor/markdown_format.ts
//
// Monaco selection transforms for markdown formatting toolbar and shortcuts.

/** Minimal Monaco editor surface used by formatting helpers. */
export interface MonacoEditorLike {
  getSelection(): MonacoSelectionLike | null;
  getModel(): MonacoModelLike | null;
  executeEdits(source: string, edits: MonacoEditLike[]): void;
  setSelection(selection: MonacoSelectionLike): void;
  focus(): void;
}

interface MonacoSelectionLike {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  isEmpty(): boolean;
}

interface MonacoModelLike {
  getValueInRange(range: MonacoRangeLike): string;
  getLineContent(lineNumber: number): string;
  getLineCount(): number;
}

interface MonacoRangeLike {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

interface MonacoEditLike {
  range: MonacoRangeLike;
  text: string;
}

function getSelectionOrCaret(editor: MonacoEditorLike): {
  selection: MonacoSelectionLike;
  model: MonacoModelLike;
} | null {
  const selection = editor.getSelection();
  const model = editor.getModel();
  if (!selection || !model) return null;
  return { selection, model };
}

function applyEdit(
  editor: MonacoEditorLike,
  range: MonacoRangeLike,
  text: string,
  newSelection?: MonacoSelectionLike
) {
  editor.executeEdits("chaosnexus-forge-markdown", [{ range, text }]);
  if (newSelection) {
    editor.setSelection(newSelection);
  }
  editor.focus();
}

/** Wrap the current selection (or placeholder text) with inline markdown delimiters. */
export function wrapInline(editor: MonacoEditorLike, before: string, after: string, placeholder = "text") {
  const ctx = getSelectionOrCaret(editor);
  if (!ctx) return;

  const { selection, model } = ctx;
  const selected = selection.isEmpty()
    ? placeholder
    : model.getValueInRange(selection);
  const text = `${before}${selected}${after}`;

  applyEdit(editor, selection, text, {
    startLineNumber: selection.startLineNumber,
    startColumn: selection.startColumn + before.length,
    endLineNumber: selection.endLineNumber,
    endColumn: selection.isEmpty()
      ? selection.startColumn + before.length + placeholder.length
      : selection.endColumn + before.length,
    isEmpty: () => false,
  });
}

/** Toggle or apply a prefix on each selected line (headings, lists, blockquotes). */
export function toggleLinePrefix(editor: MonacoEditorLike, prefix: string, numbered = false) {
  const ctx = getSelectionOrCaret(editor);
  if (!ctx) return;

  const { selection, model } = ctx;
  const startLine = selection.startLineNumber;
  const endLine = selection.endLineNumber;
  const lines: string[] = [];
  let listIndex = 1;

  for (let line = startLine; line <= endLine; line++) {
    const content = model.getLineContent(line);
    const trimmed = content.trimStart();
    const indent = content.slice(0, content.length - trimmed.length);

    if (numbered) {
      const numberedMatch = trimmed.match(/^\d+\.\s+/);
      if (numberedMatch) {
        lines.push(`${indent}${trimmed.slice(numberedMatch[0].length)}`);
      } else {
        lines.push(`${indent}${listIndex}. ${trimmed}`);
        listIndex++;
      }
      continue;
    }

    if (trimmed.startsWith(prefix)) {
      lines.push(`${indent}${trimmed.slice(prefix.length)}`);
    } else {
      lines.push(`${indent}${prefix}${trimmed}`);
    }
  }

  const range: MonacoRangeLike = {
    startLineNumber: startLine,
    startColumn: 1,
    endLineNumber: endLine,
    endColumn: model.getLineContent(endLine).length + 1,
  };

  applyEdit(editor, range, lines.join("\n"), {
    startLineNumber: startLine,
    startColumn: 1,
    endLineNumber: endLine,
    endColumn: lines[lines.length - 1].length + 1,
    isEmpty: () => false,
  });
}

/** Insert a markdown link around the selection or placeholder label. */
export function insertLink(editor: MonacoEditorLike) {
  const ctx = getSelectionOrCaret(editor);
  if (!ctx) return;

  const { selection, model } = ctx;
  const label = selection.isEmpty() ? "link text" : model.getValueInRange(selection);
  const text = `[${label}](url)`;

  applyEdit(editor, selection, text, {
    startLineNumber: selection.startLineNumber,
    startColumn: selection.startColumn + label.length + 3,
    endLineNumber: selection.endLineNumber,
    endColumn: selection.isEmpty()
      ? selection.startColumn + label.length + 6
      : selection.endColumn + 6,
    isEmpty: () => false,
  });
}

/** Insert a multi-line block (fenced code, horizontal rule, table skeleton). */
export function insertBlock(editor: MonacoEditorLike, block: string) {
  const ctx = getSelectionOrCaret(editor);
  if (!ctx) return;

  const { selection, model } = ctx;
  const line = model.getLineContent(selection.startLineNumber);
  const needsLeadingNewline = line.length > 0 && selection.startColumn > 1;
  const needsTrailingNewline = selection.endLineNumber < model.getLineCount();
  const prefix = needsLeadingNewline ? "\n" : "";
  const suffix = needsTrailingNewline ? "\n" : "";
  const text = `${prefix}${block}${suffix}`;

  applyEdit(editor, selection, text);
}

/** Apply the link format to the current selection. */
export function formatLink(editor: MonacoEditorLike) {
  insertLink(editor);
}

/** Apply bold formatting to the current selection. */
export function formatBold(editor: MonacoEditorLike) {
  wrapInline(editor, "**", "**", "bold");
}

/** Apply italic formatting to the current selection. */
export function formatItalic(editor: MonacoEditorLike) {
  wrapInline(editor, "*", "*", "italic");
}

/** Apply inline code formatting to the current selection. */
export function formatInlineCode(editor: MonacoEditorLike) {
  wrapInline(editor, "`", "`", "code");
}

/** Toggle heading formatting on the selected lines for the given level. */
export function formatHeading(editor: MonacoEditorLike, level: 1 | 2 | 3) {
  toggleLinePrefix(editor, "#".repeat(level) + " ");
}

/** Toggle a bullet list prefix on the selected lines. */
export function formatBulletList(editor: MonacoEditorLike) {
  toggleLinePrefix(editor, "- ");
}

/** Toggle a numbered list prefix on the selected lines. */
export function formatNumberedList(editor: MonacoEditorLike) {
  toggleLinePrefix(editor, "", true);
}

/** Toggle blockquote formatting on the selected lines. */
export function formatBlockquote(editor: MonacoEditorLike) {
  toggleLinePrefix(editor, "> ");
}

/** Insert a fenced code block snippet. */
export function formatCodeBlock(editor: MonacoEditorLike) {
  insertBlock(editor, "```\ncode\n```");
}

/** Insert a horizontal rule snippet. */
export function formatHorizontalRule(editor: MonacoEditorLike) {
  insertBlock(editor, "\n---\n");
}

/** Insert a basic Markdown table snippet. */
export function formatTable(editor: MonacoEditorLike) {
  insertBlock(
    editor,
    "| Column 1 | Column 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |"
  );
}
