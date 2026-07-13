<!-- chaosnexus-forge/src/lib/components/ModalShell.svelte -->
<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * Props for the ModalShell component.
   */
  interface Props {
    /** Whether the modal is currently visible */
    open?: boolean;
    /** CSS classes for the z-index of the modal wrapper */
    zClass?: string;
    /** CSS classes for the modal backdrop (background overlay) */
    backdropClass?: string;
    /** CSS classes for the modal panel containing the content */
    panelClass?: string;
    /** Callback triggered when the backdrop is clicked */
    onBackdropClick?: () => void;
    /** Content to render inside the modal */
    children: Snippet;
  }

  let {
    open = true,
    zClass = "z-50",
    backdropClass = "bg-black/75 backdrop-blur-xs",
    panelClass = "w-full max-w-sm theme-bg-main theme-border rounded overflow-hidden shadow-2xl p-5 space-y-4",
    onBackdropClick,
    children,
  }: Props = $props();
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="fixed inset-0 flex items-center justify-center p-4 {zClass} {backdropClass}"
    onclick={() => onBackdropClick?.()}
  >
    <div class={panelClass} onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      {@render children()}
    </div>
  </div>
{/if}
