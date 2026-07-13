<!-- chaosnexus-forge/src/lib/components/dual_editor/MarkdownToolbar.svelte -->
<script lang="ts">
  import type { MonacoEditorLike } from "$lib/dual_editor/markdown_format";
  import {
    formatBold,
    formatItalic,
    formatInlineCode,
    formatHeading,
    formatBulletList,
    formatNumberedList,
    formatBlockquote,
    formatLink,
    formatCodeBlock,
    formatTable,
    formatHorizontalRule,
  } from "$lib/dual_editor/markdown_format";
  import IconBold from "~icons/lucide/bold";
  import IconItalic from "~icons/lucide/italic";
  import IconCode from "~icons/lucide/code";
  import IconHeading1 from "~icons/lucide/heading-1";
  import IconHeading2 from "~icons/lucide/heading-2";
  import IconHeading3 from "~icons/lucide/heading-3";
  import IconList from "~icons/lucide/list";
  import IconListOrdered from "~icons/lucide/list-ordered";
  import IconQuote from "~icons/lucide/quote";
  import IconLink from "~icons/lucide/link";
  import IconTable from "~icons/lucide/table";
  import IconMinus from "~icons/lucide/minus";
  import IconPanelRightClose from "~icons/lucide/panel-right-close";
  import IconPanelRightOpen from "~icons/lucide/panel-right-open";

  /**
   * Component properties for the markdown toolbar.
   */
  interface Props {
    monacoInstance?: MonacoEditorLike | null;
    viewMode?: string;
    onSetViewMode?: (mode: "split" | "code" | "visual" | "preview") => void;
  }

  let { monacoInstance = null, viewMode = "split", onSetViewMode }: Props = $props();

  function run(action: (editor: MonacoEditorLike) => void) {
    if (!monacoInstance) return;
    action(monacoInstance);
  }

  const iconBtnClass =
    "p-1 rounded hover:theme-bg-surface theme-text-muted hover:theme-text-main transition-colors cursor-pointer border border-transparent hover:theme-border disabled:opacity-30";
</script>

<div
  class="px-4 py-1.5 h-10 theme-bg-header theme-border-b flex items-center justify-between z-10 w-full shrink-0"
>
  <div class="flex items-center space-x-1.5 overflow-x-auto">
    <span class="text-xs theme-text-muted font-bold uppercase tracking-wider mr-2 shrink-0"
      >Markdown</span
    >

    <button
      type="button"
      class={iconBtnClass}
      title="Bold (Ctrl+B)"
      disabled={!monacoInstance}
      onclick={() => run(formatBold)}
    >
      <IconBold class="w-4 h-4" />
    </button>
    <button
      type="button"
      class={iconBtnClass}
      title="Italic (Ctrl+I)"
      disabled={!monacoInstance}
      onclick={() => run(formatItalic)}
    >
      <IconItalic class="w-4 h-4" />
    </button>
    <button
      type="button"
      class={iconBtnClass}
      title="Inline code"
      disabled={!monacoInstance}
      onclick={() => run(formatInlineCode)}
    >
      <IconCode class="w-4 h-4" />
    </button>

    <div class="h-4 w-px theme-bg-border mx-1 shrink-0"></div>

    <button
      type="button"
      class={iconBtnClass}
      title="Heading 1"
      disabled={!monacoInstance}
      onclick={() => run((e) => formatHeading(e, 1))}
    >
      <IconHeading1 class="w-4 h-4" />
    </button>
    <button
      type="button"
      class={iconBtnClass}
      title="Heading 2"
      disabled={!monacoInstance}
      onclick={() => run((e) => formatHeading(e, 2))}
    >
      <IconHeading2 class="w-4 h-4" />
    </button>
    <button
      type="button"
      class={iconBtnClass}
      title="Heading 3"
      disabled={!monacoInstance}
      onclick={() => run((e) => formatHeading(e, 3))}
    >
      <IconHeading3 class="w-4 h-4" />
    </button>

    <div class="h-4 w-px theme-bg-border mx-1 shrink-0"></div>

    <button
      type="button"
      class={iconBtnClass}
      title="Bullet list"
      disabled={!monacoInstance}
      onclick={() => run(formatBulletList)}
    >
      <IconList class="w-4 h-4" />
    </button>
    <button
      type="button"
      class={iconBtnClass}
      title="Numbered list"
      disabled={!monacoInstance}
      onclick={() => run(formatNumberedList)}
    >
      <IconListOrdered class="w-4 h-4" />
    </button>
    <button
      type="button"
      class={iconBtnClass}
      title="Blockquote"
      disabled={!monacoInstance}
      onclick={() => run(formatBlockquote)}
    >
      <IconQuote class="w-4 h-4" />
    </button>
    <button
      type="button"
      class={iconBtnClass}
      title="Link (Ctrl+K)"
      disabled={!monacoInstance}
      onclick={() => run(formatLink)}
    >
      <IconLink class="w-4 h-4" />
    </button>
    <button
      type="button"
      class={iconBtnClass}
      title="Code block"
      disabled={!monacoInstance}
      onclick={() => run(formatCodeBlock)}
    >
      <IconCode class="w-4 h-4" />
    </button>
    <button
      type="button"
      class={iconBtnClass}
      title="Table"
      disabled={!monacoInstance}
      onclick={() => run(formatTable)}
    >
      <IconTable class="w-4 h-4" />
    </button>
    <button
      type="button"
      class={iconBtnClass}
      title="Horizontal rule"
      disabled={!monacoInstance}
      onclick={() => run(formatHorizontalRule)}
    >
      <IconMinus class="w-4 h-4" />
    </button>
  </div>

  {#if onSetViewMode}
    <button
      data-testid="editor-view-toggle"
      onclick={() => onSetViewMode(viewMode === "split" ? "code" : "split")}
      class="p-1 rounded hover:theme-bg-surface text-zinc-400 hover:text-white transition-colors cursor-pointer border border-transparent hover:theme-border shrink-0 ml-2"
      title={viewMode === "split" ? "Expand Code View" : "Restore Split View"}
    >
      {#if viewMode === "split"}
        <IconPanelRightClose class="w-4 h-4" />
      {:else}
        <IconPanelRightOpen class="w-4 h-4" />
      {/if}
    </button>
  {/if}
</div>
