<script lang="ts">
  /**
   * The UnsavedChangesModal component provides a prompt for users to save or discard unsaved changes when closing tabs or exiting.
   */
  import { workbench } from "$lib/state.svelte";
  import ModalShell from "./ModalShell.svelte";

  function handleSave() {
    workbench.unsavedPrompt?.resolve("save");
  }

  function handleDontSave() {
    workbench.unsavedPrompt?.resolve("dont_save");
  }

  function handleCancel() {
    workbench.unsavedPrompt?.resolve("cancel");
  }

  // Prevent closing when clicking outside to match native dialog behavior
</script>

{#if workbench.unsavedPrompt}
  <ModalShell
    zClass="z-[100]"
    backdropClass="bg-black/60 backdrop-blur-sm"
    panelClass="theme-bg-sidebar border theme-border-accent w-[450px] shadow-2xl rounded shadow-black/80 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-0 space-y-0 font-sans"
  >
    <div class="p-5 flex space-x-4">
      <!-- Warning Icon -->
      <div class="flex-shrink-0 text-yellow-500 mt-1">
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
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
          ></path>
          <path d="M12 9v4"></path>
          <path d="M12 17h.01"></path>
        </svg>
      </div>

      <div class="flex-1 min-w-0">
        {#if workbench.unsavedPrompt.files.length === 1}
          <h2 class="text-lg font-semibold theme-text-main leading-snug mb-3">
            Do you want to save the changes you made to {workbench.unsavedPrompt.files[0].filename}?
          </h2>
        {:else}
          <h2 class="text-lg font-semibold theme-text-main leading-snug mb-3">
            Do you want to save the changes to the following {workbench.unsavedPrompt.files.length} files?
          </h2>
          <div
            class="max-h-[150px] overflow-y-auto mb-3 theme-bg-main border theme-border-muted p-2 rounded"
          >
            <ul class="list-none space-y-1">
              {#each workbench.unsavedPrompt.files as file}
                <li
                  class="text-sm font-mono text-zinc-300 truncate"
                  title="{file.pluginName}/{file.filename}"
                >
                  {file.pluginName}/{file.filename}
                </li>
              {/each}
            </ul>
          </div>
        {/if}
        <p class="text-sm theme-text-muted">Your changes will be lost if you don't save them.</p>
      </div>
    </div>

    <div class="px-5 py-3 theme-bg-main border-t theme-border-muted flex justify-between">
      <!-- Left aligned -->
      <button
        data-testid="unsaved-dont-save-btn"
        class="px-4 py-1.5 text-sm theme-text-main bg-zinc-700/50 hover:bg-zinc-700 transition-colors border border-transparent rounded cursor-pointer"
        onclick={handleDontSave}
      >
        Don't Save
      </button>

      <!-- Right aligned -->
      <div class="flex space-x-2">
        <button
          data-testid="unsaved-cancel-btn"
          class="px-4 py-1.5 text-sm theme-text-main bg-zinc-700/50 hover:bg-zinc-700 transition-colors border border-transparent rounded cursor-pointer"
          onclick={handleCancel}
        >
          Cancel
        </button>
        <button
          data-testid="unsaved-save-btn"
          class="px-5 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 border border-blue-500 rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 focus:ring-offset-zinc-900 transition-all cursor-pointer"
          onclick={handleSave}
        >
          Save
        </button>
      </div>
    </div>
  </ModalShell>
{/if}
