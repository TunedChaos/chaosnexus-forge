<!-- chaosnexus-forge/src/lib/components/ConfirmDeleteModal.svelte -->
<script lang="ts">
  import ModalShell from "./ModalShell.svelte";

  /**
   * Props for the ConfirmDeleteModal component.
   */
  interface Props {
    /** Whether the modal is open. */
    open: boolean;
    /** Heading, e.g. `Delete group "Logic"?` or `Delete 3 selected items?`. */
    title: string;
    /** Body copy describing exactly what (including cascaded contents) is removed. */
    message: string;
    /** Confirm button label (defaults to a generic "Delete"). */
    confirmLabel?: string;
    /** Callback triggered when the confirm button is clicked. */
    onConfirm: () => void;
    /** Callback triggered when the cancel button or backdrop is clicked. */
    onCancel: () => void;
  }

  let { open, title, message, confirmLabel = "Delete", onConfirm, onCancel }: Props = $props();
</script>

{#if open}
  <ModalShell
    zClass="z-[100]"
    backdropClass="bg-black/60 backdrop-blur-sm"
    panelClass="theme-bg-sidebar border theme-border-accent w-[480px] shadow-2xl rounded shadow-black/80 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-0 space-y-0 font-sans"
  >
    <div class="p-5 flex space-x-4">
      <div class="flex-shrink-0 text-red-500 mt-1" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
          <path d="M12 9v4"></path>
          <path d="M12 17h.01"></path>
        </svg>
      </div>

      <div class="flex-1 min-w-0">
        <h2 data-testid="delete-modal-title" class="text-lg font-semibold theme-text-main leading-snug mb-2">
          {title}
        </h2>
        <p class="text-sm theme-text-muted leading-relaxed">
          {message}
        </p>
      </div>
    </div>

    <div class="px-5 py-4 theme-bg-main theme-border-t flex justify-end space-x-2">
      <button
        type="button"
        data-testid="delete-group-cancel-btn"
        class="px-4 py-1.5 text-sm theme-text-main bg-zinc-700/50 hover:bg-zinc-700 transition-colors border border-transparent rounded cursor-pointer"
        onclick={onCancel}
      >
        Cancel
      </button>
      <button
        type="button"
        data-testid="delete-group-confirm-btn"
        class="px-5 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-500 border border-red-500 rounded shadow-sm transition-all cursor-pointer"
        onclick={onConfirm}
      >
        {confirmLabel}
      </button>
    </div>
  </ModalShell>
{/if}
