<!-- chaosnexus-forge/src/lib/components/dual_editor/DualEditorPendingBanner.svelte -->
<script lang="ts">
  import { workbench } from "$lib/state.svelte";
  import { pendingPlugins } from "$lib/pending.svelte";
</script>

{#if workbench.activeTab?.pluginName === "__PENDING__" && pendingPlugins.detail}
  <div
    data-testid="pending-review-modal"
    class="px-4 py-3 theme-bg-surface theme-border-b flex flex-col gap-3"
  >
    <div class="flex items-center justify-between">
      <div>
        <h2 class="font-bold theme-text-main text-sm flex items-center gap-2">
          <span
            class="px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30"
            >Review</span
          >
          {pendingPlugins.detail.summary.name}
        </h2>
        <p class="text-xs theme-text-muted mt-1">
          {pendingPlugins.detail.summary.description}
        </p>
      </div>
      <div class="flex gap-2">
        <button
          class="px-3 py-1.5 text-xs font-bold theme-text-muted hover:theme-text-main rounded border theme-border cursor-pointer flex items-center gap-1"
          disabled={pendingPlugins.acting}
          onclick={() => {
            pendingPlugins.isEditingEnabled = !pendingPlugins.isEditingEnabled;
          }}
        >
          {#if pendingPlugins.isEditingEnabled}
            <span class="i-lucide-lock text-xs"></span> Disable Editing
          {:else}
            <span class="i-lucide-unlock text-xs"></span> Enable Editing
          {/if}
        </button>
        {#if pendingPlugins.isEditingEnabled}
          <button
            class="px-3 py-1.5 text-xs font-bold theme-text-muted hover:theme-text-main rounded border theme-border cursor-pointer flex items-center gap-1"
            disabled={pendingPlugins.acting}
            onclick={async () => {
              // Convert text logic to visual canvas AST
              try {
                const { invoke } = await import("@tauri-apps/api/core");
                const res = await invoke<{ ast_canvas: string; rhai_source: string }>(
                  "chaoswrench_parse_rhai_ast",
                  { source: workbench.fileContents["__PENDING__:" + pendingPlugins.detail!.summary.name] ?? "" }
                );
                
                workbench.updateFileContent(
                  "__PENDING__",
                  pendingPlugins.detail!.summary.name,
                  res.rhai_source
                );
                
                if (res.ast_canvas) {
                  workbench.updateCanvasContent(
                    "__PENDING__",
                    pendingPlugins.detail!.summary.name,
                    JSON.parse(res.ast_canvas)
                  );
                }
              } catch (e) {
                console.error("Failed to convert to visual script:", e);
              }
            }}
          >
            <span class="i-lucide-workflow text-xs"></span> Convert to Visual Script
          </button>
        {/if}
        <button
          class="px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-400/10 rounded border border-red-400/30 cursor-pointer"
          disabled={pendingPlugins.acting}
          onclick={() => {
            pendingPlugins.reject(
              workbench.projectPath,
              pendingPlugins.activeName!,
              () => {
                workbench.closeTab("__PENDING__", workbench.activeTab!.filename);
              }
            );
          }}
        >
          Reject
        </button>
        <button
          class="px-3 py-1.5 text-xs font-bold theme-bg-accent-soft theme-text-accent rounded cursor-pointer"
          disabled={pendingPlugins.acting}
          data-testid="pending-review-approve"
          onclick={() => {
            pendingPlugins.approve(workbench.projectPath, () => {
              workbench.closeTab("__PENDING__", workbench.activeTab!.filename);
              void workbench.refreshWorkspace();
            });
          }}
        >
          Approve &amp; promote
        </button>
      </div>
    </div>
    <pre class="sr-only" data-testid="pending-rhai-source">
      {pendingPlugins.detail.rhai_source}
    </pre>
    <div>
      <h3
        class="text-[10px] font-bold uppercase tracking-wider theme-text-muted mb-1.5"
      >
        Requested capabilities
      </h3>
      <div class="flex flex-wrap gap-2">
        {#each pendingPlugins.detail?.summary.requested_capabilities ?? [] as cap}
          <label
            class="flex items-center gap-1 text-xs cursor-pointer theme-bg-sidebar px-2 py-0.5 rounded border theme-border"
          >
            <input
              type="checkbox"
              data-testid={`pending-cap-${cap}`}
              checked={pendingPlugins.granted.includes(cap)}
              onchange={() => pendingPlugins.toggleCapability(cap)}
            />
            {cap}
          </label>
        {/each}
      </div>
    </div>
    {#if pendingPlugins.granted.includes("env")}
      <div>
        <label
          class="text-[10px] font-bold uppercase tracking-wider theme-text-muted"
          for="banner-env"
        >
          Env allowlist (comma-separated)
        </label>
        <input
          id="banner-env"
          class="w-full mt-1 px-2 py-1 theme-bg-sidebar theme-border border rounded font-mono text-xs"
          bind:value={pendingPlugins.envAllowlist}
          placeholder="SHELL, PATH"
        />
      </div>
    {/if}
  </div>
{/if}
