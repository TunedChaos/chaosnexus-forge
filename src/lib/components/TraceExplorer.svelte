<!-- chaosnexus-forge/src/lib/components/TraceExplorer.svelte -->
<script lang="ts">
  // Gantt-style MCP execution trace timeline (Phase 5). Groups spans by
  // trace_id, renders hop latency bars, and lets the user click a failed hop
  // to highlight the originating canvas node via engine.highlightedNodeLabel.
  import { engine, type EngineTraceSpan } from "$lib/engine.svelte";

  type TraceChain = { traceId: string; spans: EngineTraceSpan[] };

  const chains = $derived.by((): TraceChain[] => {
    const map = new Map<string, EngineTraceSpan[]>();
    for (const span of engine.traces) {
      const list = map.get(span.trace_id) ?? [];
      list.push(span);
      map.set(span.trace_id, list);
    }
    return [...map.entries()].map(([traceId, spans]) => ({
      traceId,
      spans: spans.sort((a, b) => a.started_at_ms - b.started_at_ms),
    }));
  });

  function chainWindow(spans: EngineTraceSpan[]): { origin: number; total: number } {
    const origin = Math.min(...spans.map((s) => s.started_at_ms));
    const end = Math.max(...spans.map((s) => s.started_at_ms + s.latency_ms));
    return { origin, total: Math.max(end - origin, 1) };
  }

  function barStyle(span: EngineTraceSpan, origin: number, total: number) {
    const left = ((span.started_at_ms - origin) / total) * 100;
    const width = Math.max((span.latency_ms / total) * 100, 1.5);
    return `left: ${left}%; width: ${width}%`;
  }

  function selectSpan(span: EngineTraceSpan) {
    engine.selectTraceSpan(span.span_id);
  }

  function shortId(id: string): string {
    return id.length > 8 ? `${id.slice(0, 8)}…` : id;
  }
</script>

<div class="h-full flex flex-col theme-bg-footer font-mono text-xs min-h-0">
  <div
    class="flex-none flex items-center justify-between px-3 py-1 border-b theme-border theme-text-accent uppercase tracking-widest font-bold"
  >
    <span>Trace Explorer</span>
    <div class="flex items-center gap-1.5 normal-case tracking-normal font-normal">
      <button
        class="px-2 py-0.5 rounded border theme-border theme-bg-main hover:theme-bg-accent hover:text-white disabled:opacity-40 transition-colors"
        title="Refresh trace snapshot from the engine"
        disabled={engine.status !== "running"}
        onclick={() => engine.listTraces()}
      >
        Refresh
      </button>
      {#if engine.selectedTraceSpanId}
        <button
          class="px-2 py-0.5 rounded border theme-border theme-bg-main hover:theme-bg-accent hover:text-white transition-colors"
          title="Clear canvas node highlight"
          onclick={() => engine.clearTraceSelection()}
        >
          Clear highlight
        </button>
      {/if}
    </div>
  </div>

  <div class="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-4">
    {#if engine.traces.length === 0}
      <div class="theme-text-muted italic">
        {#if engine.status === "running"}
          No MCP traces yet. Proxy tool calls will appear here with hop counts and latency.
        {:else}
          Start the engine to collect MCP execution traces.
        {/if}
      </div>
    {:else}
      {#each chains as chain (chain.traceId)}
        {@const window = chainWindow(chain.spans)}
        <section class="border theme-border rounded theme-bg-main p-2 space-y-2">
          <div class="flex items-center justify-between gap-2">
            <span class="theme-text-muted">
              trace <span class="theme-text-main font-bold">{shortId(chain.traceId)}</span>
            </span>
            <span class="theme-text-muted">{chain.spans.length} hop(s)</span>
          </div>

          <div class="space-y-1.5">
            {#each chain.spans as span (span.span_id)}
              {@const failed = !!span.error}
              {@const selected = engine.selectedTraceSpanId === span.span_id}
              <button
                type="button"
                class="w-full text-left rounded border px-2 py-1.5 transition-colors cursor-pointer
                  {failed ? 'border-red-500/60' : 'theme-border'}
                  {selected ? 'theme-bg-accent-soft ring-1 ring-[var(--color-accent)]' : 'theme-bg-sidebar hover:theme-bg-accent-soft'}"
                onclick={() => selectSpan(span)}
              >
                <div class="flex items-center justify-between gap-2 mb-1">
                  <span class="font-bold {failed ? 'text-red-400' : 'theme-text-main'}">
                    {span.name}
                    {#if span.node_label && span.node_label !== span.name}
                      <span class="theme-text-muted font-normal">({span.node_label})</span>
                    {/if}
                  </span>
                  <span class="theme-text-muted shrink-0">
                    hop {span.hop} · {span.latency_ms}ms · {span.kind}
                  </span>
                </div>
                <div class="relative h-2 rounded theme-bg-footer overflow-hidden">
                  <div
                    class="absolute top-0 bottom-0 rounded {failed ? 'bg-red-500/70' : 'bg-[var(--color-accent)]/70'}"
                    style={barStyle(span, window.origin, window.total)}
                    role="presentation"
                  ></div>
                </div>
                {#if span.error}
                  <div class="text-red-400 mt-1 break-all">{span.error}</div>
                {/if}
              </button>
            {/each}
          </div>
        </section>
      {/each}
    {/if}
  </div>
</div>
