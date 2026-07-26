<!-- chaosnexus-forge/src/lib/components/menu/MenuDropdownButton.svelte -->
<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * Component props for the menu dropdown button.
   */
  let {
    onclick,
    disabled = false,
    shortcut = null,
    children,
  }: {
    /** Callback triggered when the button is clicked. */
    onclick: () => void;
    /** Indicates whether the button is disabled. */
    disabled?: boolean;
    /** Optional keyboard shortcut text displayed alongside the item. */
    shortcut?: string | null;
    /** Svelte Snippet containing the text or elements inside the button. */
    children: Snippet;
  } = $props();
</script>

<button
  class="px-4 py-1.5 text-left theme-menu-btn flex justify-between disabled:opacity-40 disabled:cursor-not-allowed w-full items-center"
  {disabled}
  {onclick}
>
  <span class="whitespace-nowrap">
    {@render children()}
  </span>
  {#if shortcut}
    <span class="theme-text-muted text-[10px] ml-4">{shortcut}</span>
  {/if}
</button>
