<!-- chaosnexus-forge/src/lib/components/CodeNativeNode.svelte -->
<script lang="ts">
  import { RETURN_HANDLE } from "$lib/graph";
  import { engineSchema } from "$lib/schema.svelte";
  import { pinRoleFromDataType } from "$lib/dual_editor/pin_roles";
  import NodeShell from "./flow/NodeShell.svelte";

  /**
   * Props for the CodeNativeNode component.
   */
  interface Props {
    id: string;
    data: {
      label: string;
      onOpenSettings: (id: string, label: string) => void;
      onUngroup?: (id: string) => void;
      parentId?: string;
      traceHighlight?: boolean;
      graphError?: string;
      fn?: string;
      params?: string[];
      stale?: boolean;
    };
    selected?: boolean;
  }

  let { id, data, selected = false }: Props = $props();

  let schemaFn = $derived(data.fn ? engineSchema.byName(data.fn) : undefined);
  let assemblyPins = $derived(
    (schemaFn?.params.length ?? 0) > 0 || (Array.isArray(data.params) && data.params.length > 0)
  );
  let inputs = $derived(
    schemaFn?.params.map((p) => ({
      id: p.name,
      label: p.name,
      role: pinRoleFromDataType(p.type),
    })) ?? (data.params ?? []).map((p) => ({ id: p, label: p, role: "generic" as const }))
  );
  let outputs = $derived(
    assemblyPins ? [{ id: RETURN_HANDLE, label: "return", role: "generic" as const }] : []
  );
</script>

<NodeShell
  {id}
  category={schemaFn ? "native" : "function"}
  title="Function"
  subtitle={data.fn && data.fn !== data.label ? `${data.label} → ${data.fn}()` : data.label}
  {selected}
  traceHighlight={data.traceHighlight}
  stale={data.stale}
  graphError={data.graphError}
  {inputs}
  {outputs}
  onEdit={() => data.onOpenSettings(id, data.label)}
  onUngroup={data.onUngroup}
  parentId={data.parentId}
/>
