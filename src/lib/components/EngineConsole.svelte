<!-- chaosnexus-forge/src/lib/components/EngineConsole.svelte -->
<script lang="ts">
  import { tick } from "svelte";
  import { workbench } from "$lib/state.svelte";
  import { engine, type EngineStatus, type EngineLog } from "$lib/engine.svelte";
  import {
    formatLogLine,
    formatLogLines,
    consoleExportFilename,
    copyToClipboard,
    downloadText,
  } from "$lib/console_io";
  import TraceExplorer from "./TraceExplorer.svelte";
  import ConnectionModal from "./ConnectionModal.svelte";

  // The CVar Controller toggle is owned by the layout (it sizes the right
  // panel); the console merely surfaces the button next to the engine controls.
  /**
   * Component props for EngineConsole.
   * @property {boolean} [cvarsOpen] - Whether the CVar panel is currently visible.
   * @property {() => void} [onToggleCvars] - Callback to toggle the CVar panel visibility.
   */
  let {
    cvarsOpen = false,
    onToggleCvars,
  }: { cvarsOpen?: boolean; onToggleCvars?: () => void } = $props();

  let bottomTab = $state<"console" | "traces">("console");

  const hasLogs = $derived(engine.logs.length > 0);

  // Transient "copied" feedback. `null` = idle; "console" or a line index marks
  // which control flashed confirmation. Auto-reset keeps the UI from sticking.
  let copiedKey = $state<string | null>(null);
  let copiedTimer: ReturnType<typeof setTimeout> | null = null;
  
  let connectModalOpen = $state(false);

  function flashCopied(key: string): void {
    copiedKey = key;
    if (copiedTimer) clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => {
      copiedKey = null;
      copiedTimer = null;
    }, 1200);
  }

  async function copyLine(log: EngineLog, index: number): Promise<void> {
    if (await copyToClipboard(formatLogLine(log))) flashCopied(`line:${index}`);
  }

  async function copyConsole(): Promise<void> {
    if (!hasLogs) return;
    if (await copyToClipboard(formatLogLines(engine.logs))) flashCopied("console");
  }

  function exportConsole(): void {
    if (!hasLogs) return;
    downloadText(consoleExportFilename(), formatLogLines(engine.logs));
  }

  // Auto-scroll the console to the newest line unless the user has scrolled up.
  let scrollEl = $state<HTMLDivElement | null>(null);
  let pinnedToBottom = $state(true);

  function onScroll() {
    if (!scrollEl) return;
    const distanceFromBottom =
      scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
    pinnedToBottom = distanceFromBottom < 24;
  }

  // Re-pin to the bottom whenever a new log arrives while pinned.
  $effect(() => {
    // Reference length so the effect re-runs as logs stream in.
    void engine.logs.length;
    if (pinnedToBottom && scrollEl) {
      void tick().then(() => {
        if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
      });
    }
  });

  const isRunning = $derived(engine.status === "running");
  const isBusy = $derived(engine.status === "starting" || engine.status === "stopping");

  // Status badge presentation per lifecycle state.
  const statusMeta: Record<EngineStatus, { label: string; dot: string }> = {
    stopped: { label: "STOPPED", dot: "bg-zinc-500" },
    starting: { label: "STARTING", dot: "bg-yellow-500 animate-pulse" },
    running: { label: "RUNNING", dot: "bg-green-500" },
    stopping: { label: "STOPPING", dot: "bg-yellow-500 animate-pulse" },
    crashed: { label: "CRASHED", dot: "bg-red-500" },
    attached: { label: "ATTACHED", dot: "bg-blue-500" },
  };

  // Log-level text styling. `raw` and `info` use the default body color.
  function levelClass(level: string): string {
    switch (level.toLowerCase()) {
      case "error":
        return "text-red-400";
      case "warn":
      case "warning":
        return "text-yellow-400";
      case "debug":
        return "theme-text-muted";
      default:
        return "theme-text-main";
    }
  }

  function handleStart() {
    void engine.start(workbench.projectPath);
  }
</script>

<div class="h-full flex flex-col theme-bg-footer font-mono text-xs min-h-0">
  <!-- Header: title, lifecycle controls, status badge -->
  <div
    class="flex-none flex items-center justify-between px-3 py-1 border-b theme-border theme-text-accent uppercase tracking-widest font-bold"
  >
    <div class="flex items-center gap-2 normal-case tracking-normal">
      <button
        class="px-2 py-0.5 rounded border transition-colors {bottomTab === 'console'
          ? 'theme-bg-accent text-white theme-border-accent'
          : 'theme-border theme-bg-main hover:theme-bg-accent hover:text-white'}"
        aria-pressed={bottomTab === "console"}
        onclick={() => (bottomTab = "console")}
      >
        Console
      </button>
      <button
        class="px-2 py-0.5 rounded border transition-colors {bottomTab === 'traces'
          ? 'theme-bg-accent text-white theme-border-accent'
          : 'theme-border theme-bg-main hover:theme-bg-accent hover:text-white'}"
        aria-pressed={bottomTab === "traces"}
        onclick={() => (bottomTab = "traces")}
      >
        Traces
      </button>
    </div>

    <div class="flex items-center gap-1.5">
      <ConnectionModal bind:open={connectModalOpen} />
      <button
        class="px-2 py-0.5 rounded border theme-border theme-bg-main hover:theme-bg-accent hover:text-white transition-colors normal-case tracking-normal"
        title="Connect to a running ChaosNexus Anvil instance"
        onclick={() => (connectModalOpen = true)}
      >
        Connect...
      </button>
      <button
        class="px-2 py-0.5 rounded border theme-border theme-bg-main hover:theme-bg-accent hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors normal-case tracking-normal"
        title="Start the ChaosNexus Anvil engine for the connected workspace"
        disabled={isRunning || isBusy || !workbench.projectPath || engine.status === 'attached'}
        onclick={handleStart}
      >
        Start
      </button>
      <button
        class="px-2 py-0.5 rounded border theme-border theme-bg-main hover:theme-bg-accent hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors normal-case tracking-normal"
        title="Reload all plugins without restarting the engine"
        disabled={!isRunning}
        onclick={() => engine.reload()}
      >
        Reload Plugins
      </button>
      <button
        class="px-2 py-0.5 rounded border theme-border theme-bg-main hover:theme-bg-accent hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors normal-case tracking-normal"
        title="Stop the ChaosNexus Anvil engine"
        disabled={!isRunning && !isBusy}
        onclick={() => engine.stop()}
      >
        Stop
      </button>
      {#if bottomTab === "console"}
        <button
          class="px-2 py-0.5 rounded border theme-border theme-bg-main hover:theme-bg-accent hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors normal-case tracking-normal"
          title="Copy the entire console to the clipboard"
          disabled={!hasLogs}
          onclick={copyConsole}
        >
          {copiedKey === "console" ? "Copied" : "Copy"}
        </button>
        <button
          class="px-2 py-0.5 rounded border theme-border theme-bg-main hover:theme-bg-accent hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors normal-case tracking-normal"
          title="Export the console output to a .log file"
          disabled={!hasLogs}
          onclick={exportConsole}
        >
          Export
        </button>
      {/if}
      <button
        class="px-2 py-0.5 rounded border theme-border theme-bg-main hover:theme-bg-accent hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors normal-case tracking-normal"
        title="Clear the console output"
        disabled={bottomTab === "console" && !hasLogs}
        onclick={() => engine.clear()}
      >
        Clear
      </button>
      <button
        class="px-2 py-0.5 rounded border theme-border transition-colors normal-case tracking-normal {cvarsOpen
          ? 'theme-bg-accent text-white'
          : 'theme-bg-main hover:theme-bg-accent hover:text-white'}"
        title="Toggle the CVar Controller panel"
        aria-pressed={cvarsOpen}
        onclick={() => onToggleCvars?.()}
      >
        CVars
      </button>

      <span
        class="flex items-center gap-1.5 ml-1 px-1.5 py-0.5 rounded border theme-border theme-bg-main normal-case tracking-normal"
      >
        <span class="w-1.5 h-1.5 rounded-full {statusMeta[engine.status].dot}"></span>
        <span class="theme-text-muted">{statusMeta[engine.status].label}</span>
      </span>
    </div>
  </div>

  {#if bottomTab === "traces"}
    <TraceExplorer />
  {:else}
  <!-- Live log stream: selectable text so developers can highlight/copy/paste.
       Overrides the global `select-none` from the app shell. -->
  <div
    bind:this={scrollEl}
    onscroll={onScroll}
    class="flex-1 min-h-0 overflow-y-auto px-3 py-2 leading-tight space-y-0.5 select-text cursor-text"
  >
    {#if engine.logs.length === 0}
      <div class="theme-text-muted italic">
        {#if !workbench.projectPath}
          Connect a workspace, then press Start to launch the ChaosNexus Anvil engine.
        {:else if isRunning}
          Engine running. Waiting for plugin output...
        {:else}
          Engine stopped. Press Start to launch the ChaosNexus Anvil engine.
        {/if}
      </div>
    {:else}
      {#each engine.logs as log, index}
        <div class="group/line flex items-start gap-1.5 rounded px-1 -mx-1 hover:theme-bg-sidebar">
          <button
            type="button"
            class="flex-none w-11 shrink-0 mt-0.5 px-1 py-0 rounded border theme-border theme-bg-main hover:theme-bg-accent hover:text-white opacity-0 group-hover/line:opacity-100 focus:opacity-100 transition-opacity text-[10px] uppercase tracking-wide select-none"
            title="Copy this line"
            aria-label="Copy log line"
            onclick={() => copyLine(log, index)}
          >
            {copiedKey === `line:${index}` ? "Copied" : "Copy"}
          </button>
          <span class="flex-1 min-w-0 whitespace-pre-wrap break-words {levelClass(log.level)}">
            <span class="theme-text-muted">[{log.time}]</span>
            <span class="theme-text-muted">[{log.plugin}]</span>
            {log.message}
          </span>
        </div>
      {/each}
    {/if}
  </div>
  {/if}
</div>
