<!-- chaosnexus-forge/src/lib/components/FlowNodeUngroupButton.svelte -->
<script lang="ts">
  /**
   * Props for the FlowNodeUngroupButton component.
   */
  interface Props {
    /** Whether the button is visible */
    visible?: boolean;
    /** Optional CSS classes to apply to the button */
    class?: string;
    /** Callback triggered when the button is clicked */
    onclick: (e: MouseEvent) => void;
  }

  let { visible = true, class: className = "", onclick }: Props = $props();
</script>

{#if visible}
  <button
    {onclick}
    class="p-0.5 theme-text-muted hover:theme-text-accent rounded hover:theme-bg-sidebar cursor-pointer {className}"
    title="Ungroup"
  >
    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  </button>
{/if}
