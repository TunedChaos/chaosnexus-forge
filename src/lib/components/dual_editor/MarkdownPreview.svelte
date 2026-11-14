<!-- chaosnexus-forge/src/lib/components/dual_editor/MarkdownPreview.svelte -->
<script lang="ts">
  import { renderMarkdown } from "$lib/dual_editor/markdown_render";

  /** The markdown content to preview. */
  let { content = "" } = $props<{ content?: string }>();

  let html = $derived(renderMarkdown(content));
</script>

<div class="markdown-preview h-full w-full overflow-auto p-6 theme-bg-main">
  {#if html}
    {@html html}
  {:else}
    <p class="theme-text-muted font-mono italic">Nothing to preview yet.</p>
  {/if}
</div>
