<!-- chaosnexus-forge/src/lib/components/PendingApprovalsPanel.svelte -->
<script lang="ts">
  import { pendingPlugins } from "$lib/pending.svelte";
  import { workbench } from "$lib/state.svelte";
  import { onMount } from "svelte";

  /**
   * Props for the PendingApprovalsPanel component.
   */
  interface Props {
    projectPath: string;
    onWorkspaceRefresh?: () => void;
  }

  let { projectPath, onWorkspaceRefresh }: Props = $props();

  onMount(() => {
    void pendingPlugins.refresh(projectPath);
  });

  $effect(() => {
    if (projectPath) void pendingPlugins.refresh(projectPath);
  });

  function refreshAfterAction(): void {
    onWorkspaceRefresh?.();
  }
</script>

{#if pendingPlugins.items.length > 0 || pendingPlugins.activeName || pendingPlugins.error}
  <div class="px-2 py-2 theme-border-b theme-bg-sidebar" data-testid="pending-approvals-panel">
    <div class="flex items-center justify-between mb-2">
      <span class="text-xs font-bold uppercase tracking-wider theme-text-accent">
        Pending Approvals
        {#if pendingPlugins.items.length > 0}
          <span
            class="ml-1 px-1.5 py-0.5 rounded theme-bg-accent-soft theme-text-accent"
            data-testid="pending-count"
          >
            {pendingPlugins.items.length}
          </span>
        {/if}
      </span>
      <button
        type="button"
        class="text-xs theme-text-muted hover:theme-text-main cursor-pointer"
        data-testid="pending-refresh"
        onclick={() => pendingPlugins.refresh(projectPath)}
      >
        Refresh
      </button>
    </div>

    {#if pendingPlugins.error}
      <p class="text-xs text-red-400 mb-2" data-testid="pending-error">{pendingPlugins.error}</p>
    {/if}

    <ul class="space-y-1 max-h-32 overflow-y-auto">
      {#each pendingPlugins.items as item (item.name)}
        <li class="flex items-center gap-2 text-xs">
          <button
            type="button"
            class="flex-1 text-left truncate theme-text-main hover:theme-text-accent cursor-pointer font-mono"
            data-testid="pending-item-{item.name}"
            onclick={async () => {
              await pendingPlugins.openReview(projectPath, item.name);
              workbench.openTab("__PENDING__", item.name);
            }}
          >
            {item.name}
          </button>
          <button
            type="button"
            class="px-1.5 py-0.5 theme-text-muted hover:text-red-400 cursor-pointer"
            data-testid="pending-reject-{item.name}"
            title="Reject"
            onclick={() => pendingPlugins.reject(projectPath, item.name, refreshAfterAction)}
          >
            ✕
          </button>
        </li>
      {/each}
    </ul>
  </div>
{/if}


