<!-- chaosnexus-forge/src/lib/components/RhaiNode.svelte -->
<script lang="ts">
  import type { NodeDef } from "$lib/types";
  import { pinRoleFromDataType } from "$lib/dual_editor/pin_roles";
  import NodeShell from "./flow/NodeShell.svelte";

  /**
   * Props for the RhaiNode component.
   */
  interface Props {
    id: string;
    data: {
      label: string;
      def?: NodeDef;
      onOpenSettings: (id: string, label: string) => void;
      onUngroup?: (id: string) => void;
      parentId?: string;
      traceHighlight?: boolean;
    };
    selected?: boolean;
  }

  let { id, data, selected = false }: Props = $props();

  // Preserve each pin's engine type so the shell can color it: data pins map by
  // their `data_type`, execution pins read as the control role.
  let inputs = $derived(
    (data.def?.inputs ?? [{ id: "in", label: "In", pin_type: "Data" as const }]).map((p) => ({
      id: p.id,
      label: p.label,
      role: p.pin_type === "Execution" ? ("control" as const) : pinRoleFromDataType(p.data_type),
    }))
  );
  let outputs = $derived(
    (data.def?.outputs ?? [{ id: "out", label: "Out", pin_type: "Data" as const }]).map((p) => ({
      id: p.id,
      label: p.label,
      role: p.pin_type === "Execution" ? ("control" as const) : pinRoleFromDataType(p.data_type),
    }))
  );
</script>

<NodeShell
  {id}
  category="escape"
  title={data.def?.label ?? "Rhai"}
  subtitle={data.label}
  {selected}
  traceHighlight={data.traceHighlight}
  {inputs}
  {outputs}
  onEdit={() => data.onOpenSettings(id, data.label)}
  onUngroup={data.onUngroup}
  parentId={data.parentId}
/>
