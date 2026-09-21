<!-- chaosnexus-forge/src/lib/components/VhaiNode.svelte -->
<script lang="ts">
  import NodeShell from "./flow/NodeShell.svelte";
  import { catalogByKind, catalogPinsToDescriptors } from "$lib/dual_editor/node_catalog";
  import { pinRoleFromDataType, type PinRole } from "$lib/dual_editor/pin_roles";
  import type { CanvasPinDescriptor } from "$lib/dual_editor/canvas_schema";

  /**
   * Props for the VhaiNode component.
   */
  interface Props {
    /** Unique identifier for the node. */
    id: string;
    /** Custom node data payload injected by Svelte Flow. */
    data: {
      /** Display label. */
      label?: string;
      /** Kind of node (e.g., 'literal', 'script'). */
      kind?: string;
      /** Function name for function nodes. */
      fn?: string;
      /** Value for literal nodes. */
      value?: unknown;
      /** Type of the value. */
      valueType?: string;
      /** Script body for script/expression nodes. */
      scriptBody?: string;
      /** Operator ID for operator nodes. */
      operatorId?: string;
      /** Variable name for variable nodes. */
      varName?: string;
      /** Event ID for event nodes. */
      eventId?: string;
      /** Whether the node binding is stale. */
      stale?: boolean;
      /** Graph diagnostic error message. */
      graphError?: string;
      /** Whether this node is highlighted in an execution trace. */
      traceHighlight?: boolean;
      /** Callback when the node is ungrouped. */
      onUngroup?: (id: string) => void;
      /** Callback when the node is double-clicked for editing. */
      onEdit?: (id: string) => void;
      /** Parent node identifier. */
      parentId?: string;
      /** Per-node pin descriptors (override the catalog defaults when present). */
      pins?: CanvasPinDescriptor[];
    };
    /** Whether the node is currently selected. */
    selected?: boolean;
  }

  let { id, data, selected = false }: Props = $props();

  let catalog = $derived(catalogByKind(data.kind ?? ""));
  let title = $derived(catalog?.title ?? data.label ?? "Node");
  // Each catalog category renders its own color + icon (node_visuals SSOT); the
  // legacy escape/anchor hue is the fallback for nodes not in the catalog.
  let category = $derived(catalog?.category ?? "escape");

  // Prefer the node's persisted pin descriptors so per-node type overrides (e.g.
  // a Script block whose `return` is an array) color their pins; the catalog is
  // the fallback for nodes spawned without explicit pins.
  let pinSource = $derived<CanvasPinDescriptor[]>(
    data.pins ?? (catalog ? catalogPinsToDescriptors(catalog.pins) : [])
  );

  function mapPins(direction: "input" | "output", pinKind: "exec" | "data") {
    return pinSource
      .filter((p) => p.direction === direction && p.pinKind === pinKind)
      .map((p) => ({
        id: p.id,
        label: p.label,
        role: (pinKind === "exec" ? "exec" : pinRoleFromDataType(p.dataType)) as PinRole,
      }));
  }

  let execInputs = $derived(mapPins("input", "exec"));
  let execOutputs = $derived(mapPins("output", "exec"));
  let dataInputs = $derived(mapPins("input", "data"));
  let dataOutputs = $derived(mapPins("output", "data"));

  let subtitle = $derived.by(() => {
    if (data.fn) return data.fn;
    if (data.eventId) return data.eventId;
    if (data.varName) return `$${data.varName}`;
    if (data.operatorId) return data.operatorId;
    if (data.kind === "literal" && data.valueType) return String(data.valueType);
    return "";
  });
</script>

<NodeShell
  {id}
  {category}
  {title}
  {subtitle}
  {selected}
  traceHighlight={data.traceHighlight}
  stale={data.stale}
  graphError={data.graphError}
  {execInputs}
  {execOutputs}
  inputs={dataInputs}
  outputs={dataOutputs}
  onEdit={data.onEdit}
  onUngroup={data.onUngroup}
  parentId={data.parentId}
>
  {#if data.kind === "literal"}
    <div class="flow-node-mini theme-text-muted truncate" data-testid="literal-value">
      {JSON.stringify(data.value ?? "")}
    </div>
  {:else if data.kind === "script" || data.kind === "expression"}
    <pre
      class="flow-node-mini theme-text-muted whitespace-pre-wrap max-h-16 overflow-hidden"
      data-testid="script-body-preview"
    >{(data.scriptBody ?? "").slice(0, 120)}</pre>
  {/if}
</NodeShell>
