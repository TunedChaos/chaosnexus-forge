<!-- chaosnexus-forge/src/lib/components/flow/NodeShell.svelte -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { Handle, Position, useNodeConnections } from "@xyflow/svelte";
  import type { PinRole } from "$lib/dual_editor/pin_roles";
  import { categoryVisual } from "$lib/dual_editor/node_visuals";
  import FlowNodeUngroupButton from "../FlowNodeUngroupButton.svelte";

  /**
   * Represents a pin (handle) on a node.
   */
  interface Pin {
    /** Unique identifier for the pin. */
    id: string;
    /** Human-readable label for the pin. */
    label: string;
    /** Color role (drives the `--pin-<role>` token); defaults to "generic". */
    role?: PinRole;
  }

  /**
   * Props for the NodeShell component.
   */
  interface Props {
    /** Unique identifier for the node. */
    id: string;
    /** Logic category driving the title-bar color + icon (node_visuals SSOT). */
    category: string;
    /** Title of the node. */
    title: string;
    /** Optional subtitle of the node. */
    subtitle?: string;
    /** Whether the node is currently selected. */
    selected?: boolean;
    /** Whether the node is highlighted due to an active trace. */
    traceHighlight?: boolean;
    /** Whether the node represents a stale binding. */
    stale?: boolean;
    /** Validation error surfaced from graph diagnostics. */
    graphError?: string;
    /** Left-side execution input pins (white triangles, above data inputs). */
    execInputs?: Pin[];
    /** Right-side execution output pins (white triangles, above data outputs). */
    execOutputs?: Pin[];
    /** Data input pins. */
    inputs?: Pin[];
    /** Data output pins. */
    outputs?: Pin[];
    /** Callback triggered when the node is double-clicked for editing. */
    onEdit?: (id: string) => void;
    /** Callback triggered when the node is ungrouped. */
    onUngroup?: (id: string) => void;
    /** Parent node identifier, if grouped. */
    parentId?: string;
    /** Content rendered inside the node body. */
    children?: Snippet;
  }

  let {
    id,
    category,
    title,
    subtitle = "",
    selected = false,
    traceHighlight = false,
    stale = false,
    graphError = "",
    execInputs = [],
    execOutputs = [],
    inputs = [],
    outputs = [],
    onEdit,
    onUngroup,
    parentId,
    children,
  }: Props = $props();

  const visual = $derived(categoryVisual(category));

  const hasPins = $derived(
    execInputs.length > 0 ||
      execOutputs.length > 0 ||
      inputs.length > 0 ||
      outputs.length > 0
  );

  // Vhai-style pins: a pin reads "empty" (ring only) until a wire connects
  // to it, then it fills with the accent color. Svelte Flow does not flag a
  // connected handle, so we resolve connectedness from the node's own
  // connections (id is auto-supplied from the node context) and key the lookup
  // by the relevant handle id (source -> sourceHandle, target -> targetHandle).
  const sourceConnections = useNodeConnections({ handleType: "source" });
  const targetConnections = useNodeConnections({ handleType: "target" });

  const connectedOutputs = $derived(
    new Set(sourceConnections.current.map((c) => c.sourceHandle).filter((h): h is string => !!h))
  );
  const connectedInputs = $derived(
    new Set(targetConnections.current.map((c) => c.targetHandle).filter((h): h is string => !!h))
  );

  function handleDblClick(e: MouseEvent) {
    e.stopPropagation();
    onEdit?.(id);
  }
</script>

<div
  data-testid="flow-node"
  class="relative min-w-[190px] max-w-[260px] theme-bg-main border font-mono rounded select-none transition-all duration-150 shadow-md group/card
    {traceHighlight
    ? 'border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]'
    : graphError
      ? 'border-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.35)]'
    : selected
    ? 'border-[var(--color-accent)] shadow-[0_0_10px_rgba(var(--color-accent),0.2)]'
    : 'theme-border hover:border-[var(--color-accent)]'}"
  ondblclick={handleDblClick}
  role="button"
  tabindex="0"
>
  <!-- Color-coded title bar (Vhai classic style). The radius lives here
       (not via container overflow) so the pins can extend past the edges. -->
  <div
    class="px-2.5 py-1.5 flex items-center justify-between gap-1 rounded-t-[3px]"
    style="background: {visual.colorToken}; color: #fff;"
    data-category={category}
  >
    <span class="flex items-center gap-1.5 min-w-0">
      {#if visual.icon}
        {@const Icon = visual.icon}
        <Icon class="shrink-0 w-3.5 h-3.5 opacity-95" aria-hidden="true" />
      {/if}
      <span class="flow-node-title font-bold uppercase tracking-wide truncate">{title}</span>
    </span>
    <FlowNodeUngroupButton
      visible={!!(parentId && onUngroup)}
      class="opacity-70 hover:opacity-100 [&_button]:text-white"
      onclick={(e) => {
        e.stopPropagation();
        onUngroup?.(id);
      }}
    />
  </div>

  <div class="px-2.5 py-2 space-y-1.5">
    {#if subtitle}
      <div class="flow-node-text theme-text-main font-bold truncate" title={subtitle}>{subtitle}</div>
    {/if}

    {#if stale}
      <div class="flow-node-mini font-bold text-red-400 uppercase">Stale binding</div>
    {/if}

    {#if graphError}
      <div
        class="flow-node-mini font-bold text-amber-400"
        data-testid="graph-error"
        title={graphError}
      >
        {graphError}
      </div>
    {/if}

    {#if children}
      <div class="nodrag">
        {@render children()}
      </div>
    {/if}

    {#if hasPins}
      <!-- Unreal-style boundary: exec pins (white triangles) sit above the typed
           data pins (colored circles); inputs on the left, outputs on the right. -->
      <div class="flex justify-between gap-3 pt-1">
        <div class="flex flex-col gap-2.5">
          {#each execInputs as pin (pin.id)}
            <div class="flex items-center h-4 relative">
              <Handle
                type="target"
                position={Position.Left}
                id={pin.id}
                data-testid="flow-exec-pin"
                data-pin-role="exec"
                data-connected={connectedInputs.has(pin.id)}
                class="bp-pin bp-exec-pin {connectedInputs.has(pin.id) ? 'bp-pin-filled' : ''}"
                style="left: -16px; top: 50%; transform: translateY(-50%); --pin-color: var(--pin-exec);"
              />
              <span class="flow-node-label theme-text-main font-bold ml-1 truncate max-w-[120px]">{pin.label}</span>
            </div>
          {/each}
          {#each inputs as pin (pin.id)}
            <div class="flex items-center h-4 relative">
              <Handle
                type="target"
                position={Position.Left}
                id={pin.id}
                data-testid="flow-pin"
                data-pin-role={pin.role ?? "generic"}
                data-connected={connectedInputs.has(pin.id)}
                class="bp-pin {connectedInputs.has(pin.id) ? 'bp-pin-filled' : ''}"
                style="left: -16px; top: 50%; transform: translateY(-50%); --pin-color: var(--pin-{pin.role ?? 'generic'});"
              />
              <span class="flow-node-label theme-text-muted ml-1 truncate max-w-[120px]">{pin.label}</span>
            </div>
          {/each}
        </div>
        <div class="flex flex-col gap-2.5 items-end">
          {#each execOutputs as pin (pin.id)}
            <div class="flex items-center justify-end h-4 relative">
              <span class="flow-node-label theme-text-main font-bold mr-1 truncate max-w-[120px]">{pin.label}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={pin.id}
                data-testid="flow-exec-pin"
                data-pin-role="exec"
                data-connected={connectedOutputs.has(pin.id)}
                class="bp-pin bp-exec-pin {connectedOutputs.has(pin.id) ? 'bp-pin-filled' : ''}"
                style="right: -16px; top: 50%; transform: translateY(-50%); --pin-color: var(--pin-exec);"
              />
            </div>
          {/each}
          {#each outputs as pin (pin.id)}
            <div class="flex items-center justify-end h-4 relative">
              <span class="flow-node-label theme-text-accent mr-1 truncate max-w-[120px]">{pin.label}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={pin.id}
                data-testid="flow-pin"
                data-pin-role={pin.role ?? "generic"}
                data-connected={connectedOutputs.has(pin.id)}
                class="bp-pin {connectedOutputs.has(pin.id) ? 'bp-pin-filled' : ''}"
                style="right: -16px; top: 50%; transform: translateY(-50%); --pin-color: var(--pin-{pin.role ?? 'generic'});"
              />
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  /*
   * Unreal-Engine-Vhai pin styling. Each pin carries a per-type color via
   * the inline `--pin-color` custom property (falling back to the accent). A pin
   * is a hollow colored ring while unconnected and fills solid once a wire lands
   * on it, so type (color) and connectedness (ring vs solid) read independently.
   * A transparent ::before extends the clickable radius well past the visible
   * 12px circle so the pins are easy to grab without enlarging the drawn dot.
   * z-index keeps the dot above the node's border now that the container no
   * longer clips its overflow.
   */
  :global(.svelte-flow__handle.bp-pin) {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    z-index: 1;
    background: var(--bg-main);
    border: 2px solid var(--pin-color, var(--color-accent));
    transition:
      background-color 0.12s ease,
      box-shadow 0.12s ease;
  }

  :global(.svelte-flow__handle.bp-pin)::before {
    content: "";
    position: absolute;
    inset: -7px;
    border-radius: 50%;
  }

  :global(.svelte-flow__handle.bp-pin.bp-pin-filled) {
    background: var(--pin-color, var(--color-accent));
  }

  :global(.svelte-flow__handle.bp-pin:hover) {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--pin-color, var(--color-accent)) 30%, transparent);
  }
  /*
   * Exec pins are Unreal-style right-pointing triangles (flow always reads
   * left-to-right). clip-path cannot render a partial border, so the triangle is
   * a solid near-white glyph: a thin outline while unconnected, fully opaque once
   * a wire lands. Width/height/border are reset from the circular `.bp-pin` base.
   */
  :global(.svelte-flow__handle.bp-pin.bp-exec-pin) {
    width: 13px;
    height: 15px;
    border: none;
    border-radius: 0;
    background: var(--pin-exec);
    clip-path: polygon(0 0, 100% 50%, 0 100%);
    opacity: 0.55;
  }

  :global(.svelte-flow__handle.bp-pin.bp-exec-pin.bp-pin-filled) {
    background: var(--pin-exec);
    opacity: 1;
  }

  :global(.svelte-flow__handle.bp-pin.bp-exec-pin:hover) {
    opacity: 1;
    box-shadow: none;
  }
</style>
