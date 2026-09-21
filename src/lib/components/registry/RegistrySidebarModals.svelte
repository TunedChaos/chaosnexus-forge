<!-- chaosnexus-forge/src/lib/components/registry/RegistrySidebarModals.svelte -->
<script lang="ts">
  import ModalShell from "../ModalShell.svelte";

  /**
   * Properties for the RegistrySidebarModals component.
   */
  interface Props {
    showCreateModal?: boolean;
    newName?: string;
    newDesc?: string;
    createError?: string;
    isCreating?: boolean;
    handleCreatePlugin: () => void | Promise<void>;

    showNewFileModal?: boolean;
    newFileName?: string;
    createFileError?: string;
    contextMenuDirPath?: string;
    handleCreateFile: () => void | Promise<void>;

    showRenameModal?: boolean;
    renameFileName?: string;
    renameError?: string;
    handleRenameFile: () => void | Promise<void>;

    showDeleteModal?: boolean;
    deleteError?: string;
    handleDeleteFile: () => void | Promise<void>;
    contextMenuFilePath?: string;
  }

  let {
    showCreateModal = $bindable(false),
    newName = $bindable(""),
    newDesc = $bindable(""),
    createError = $bindable(""),
    isCreating = false,
    handleCreatePlugin,

    showNewFileModal = $bindable(false),
    newFileName = $bindable(""),
    createFileError = $bindable(""),
    contextMenuDirPath = "",
    handleCreateFile,

    showRenameModal = $bindable(false),
    renameFileName = $bindable(""),
    renameError = $bindable(""),
    handleRenameFile,

    showDeleteModal = $bindable(false),
    deleteError = $bindable(""),
    handleDeleteFile,
    contextMenuFilePath = "",
  }: Props = $props();
</script>

<!-- New Plugin Dialog Overlay -->
<ModalShell open={showCreateModal} zClass="z-50">
  <h3
    class="text-sm font-bold uppercase tracking-wider theme-text-accent theme-border-b pb-2 flex items-center space-x-1.5"
  >
    <span class="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
    <span>Scaffold New Rhai Plugin</span>
  </h3>

  <div class="space-y-3 text-left">
    <!-- Name Input -->
    <div class="space-y-1">
      <label for="new-plugin-name" class="text-xs uppercase theme-text-muted font-bold block"
        >Plugin Name</label
      >
      <input
        id="new-plugin-name"
        type="text"
        bind:value={newName}
        placeholder="e.g. database_core"
        class="w-full px-2.5 py-1.5 theme-bg-sidebar theme-border rounded focus:outline-none focus:theme-border-accent text-sm"
      />
    </div>

    <!-- Description Input -->
    <div class="space-y-1">
      <label for="new-plugin-desc" class="text-xs uppercase theme-text-muted font-bold block"
        >Description</label
      >
      <textarea
        id="new-plugin-desc"
        bind:value={newDesc}
        placeholder="Expose autonomous tools to..."
        rows="3"
        class="w-full px-2.5 py-1.5 theme-bg-sidebar theme-border rounded focus:outline-none focus:theme-border-accent text-sm resize-none"
      ></textarea>
    </div>

    {#if createError}
      <div
        class="text-xs theme-text-accent theme-bg-accent-soft theme-border-accent px-2 py-1 rounded"
      >
        Error: {createError}
      </div>
    {/if}
  </div>

  <div class="flex justify-end space-x-2 pt-2 theme-border-t">
    <button
      onclick={() => {
        showCreateModal = false;
        createError = "";
      }}
      class="px-3 py-1.5 text-xs theme-bg-sidebar hover:theme-bg-header theme-text-muted hover:theme-text-main theme-border rounded transition-colors cursor-pointer"
    >
      Cancel
    </button>
    <button
      onclick={handleCreatePlugin}
      disabled={isCreating}
      class="px-4 py-1.5 text-xs font-bold uppercase theme-bg-accent-soft hover:bg-opacity-80 theme-text-accent theme-border-accent rounded transition-colors cursor-pointer"
    >
      {isCreating ? "Scaffolding..." : "Create"}
    </button>
  </div>
</ModalShell>

<!-- New File Modal -->
<ModalShell open={showNewFileModal} zClass="z-[60]">
  <h3 class="text-sm font-bold uppercase tracking-wider theme-text-accent theme-border-b pb-2">
    Create New File
  </h3>

  <div class="space-y-3 text-left">
    <div class="space-y-1">
      <label for="new-file-name" class="text-xs uppercase theme-text-muted font-bold block"
        >Filename (with extension)</label
      >
      <input
        id="new-file-name"
        type="text"
        bind:value={newFileName}
        placeholder="e.g. logic.rhai"
        class="w-full px-2.5 py-1.5 theme-bg-sidebar theme-border rounded focus:outline-none focus:theme-border-accent text-sm"
        onkeydown={(e) => {
          if (e.key === "Enter") handleCreateFile();
          if (e.key === "Escape") {
            showNewFileModal = false;
            newFileName = "";
          }
        }}
      />
    </div>
    <p class="text-xs theme-text-muted">Target Directory: {contextMenuDirPath || "Root"}</p>

    {#if createFileError}
      <div
        class="text-xs theme-text-accent theme-bg-accent-soft theme-border-accent px-2 py-1 rounded"
      >
        Error: {createFileError}
      </div>
    {/if}
  </div>

  <div class="flex justify-end space-x-2 pt-2 theme-border-t">
    <button
      onclick={() => {
        showNewFileModal = false;
        newFileName = "";
      }}
      class="px-3 py-1.5 text-xs theme-bg-sidebar hover:theme-bg-header theme-text-muted hover:theme-text-main theme-border rounded transition-colors cursor-pointer"
    >
      Cancel
    </button>
    <button
      onclick={handleCreateFile}
      class="px-4 py-1.5 text-xs font-bold uppercase theme-bg-accent-soft hover:bg-opacity-80 theme-text-accent theme-border-accent rounded transition-colors cursor-pointer"
    >
      Create
    </button>
  </div>
</ModalShell>

<!-- Rename Modal -->
<ModalShell open={showRenameModal} zClass="z-[60]">
  <h3 class="text-sm font-bold uppercase tracking-wider theme-text-accent theme-border-b pb-2">
    Rename File
  </h3>

  <div class="space-y-3 text-left">
    <div class="space-y-1">
      <label for="rename-file-name" class="text-xs uppercase theme-text-muted font-bold block"
        >New Filename</label
      >
      <input
        id="rename-file-name"
        type="text"
        bind:value={renameFileName}
        class="w-full px-2.5 py-1.5 theme-bg-sidebar theme-border rounded focus:outline-none focus:theme-border-accent text-sm"
        onkeydown={(e) => {
          if (e.key === "Enter") handleRenameFile();
          if (e.key === "Escape") {
            showRenameModal = false;
            renameFileName = "";
          }
        }}
      />
    </div>

    {#if renameError}
      <div
        class="text-xs theme-text-accent theme-bg-accent-soft theme-border-accent px-2 py-1 rounded"
      >
        Error: {renameError}
      </div>
    {/if}
  </div>

  <div class="flex justify-end space-x-2 pt-2 theme-border-t">
    <button
      onclick={() => {
        showRenameModal = false;
        renameFileName = "";
      }}
      class="px-3 py-1.5 text-xs theme-bg-sidebar hover:theme-bg-header theme-text-muted hover:theme-text-main theme-border rounded transition-colors cursor-pointer"
    >
      Cancel
    </button>
    <button
      onclick={handleRenameFile}
      class="px-4 py-1.5 text-xs font-bold uppercase theme-bg-accent-soft hover:bg-opacity-80 theme-text-accent theme-border-accent rounded transition-colors cursor-pointer"
    >
      Rename
    </button>
  </div>
</ModalShell>

<!-- Delete Modal -->
<ModalShell
  open={showDeleteModal}
  zClass="z-[60]"
  panelClass="w-full max-w-sm theme-bg-main theme-border border-red-500/50 rounded overflow-hidden shadow-2xl p-5 space-y-4"
>
  <h3
    class="text-sm font-bold uppercase tracking-wider text-red-500 theme-border-b border-red-500/20 pb-2"
  >
    Delete File
  </h3>

  <div class="space-y-3 text-left">
    <p class="text-sm theme-text-main">
      Are you sure you want to permanently delete <strong>{contextMenuFilePath}</strong>?
    </p>
    <p class="text-xs text-red-400">This action cannot be undone and bypasses the recycle bin.</p>

    {#if deleteError}
      <div class="text-xs text-white bg-red-600 px-2 py-1 rounded">
        Error: {deleteError}
      </div>
    {/if}
  </div>

  <div class="flex justify-end space-x-2 pt-2 theme-border-t border-red-500/20">
    <button
      onclick={() => (showDeleteModal = false)}
      class="px-3 py-1.5 text-xs theme-bg-sidebar hover:theme-bg-header theme-text-muted hover:theme-text-main theme-border rounded transition-colors cursor-pointer"
    >
      Cancel
    </button>
    <button
      onclick={handleDeleteFile}
      class="px-4 py-1.5 text-xs font-bold uppercase bg-red-500 hover:bg-red-600 text-white rounded transition-colors cursor-pointer"
    >
      Delete
    </button>
  </div>
</ModalShell>
