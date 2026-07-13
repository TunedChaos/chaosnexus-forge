<!-- chaosnexus-forge/src/lib/components/IteratorNode.svelte -->
<script lang="ts">
  import { RETURN_HANDLE } from "$lib/graph";
  import NodeShell from "./flow/NodeShell.svelte";

  /**
   * Props for the IteratorNode component.
   */
  interface Props {
    id: string;
    data: {
      label: string;
      onUngroup?: (id: string) => void;
      parentId?: string;
      traceHighlight?: boolean;
    };
    selected?: boolean;
  }

  let { id, data, selected = false }: Props = $props();
</script>

<NodeShell
  {id}
  category="flow"
  title="Iterator"
  subtitle="array fan-out"
  {selected}
  traceHighlight={data.traceHighlight}
  inputs={[{ id: "items", label: "items", role: "array" }]}
  outputs={[
    { id: "item", label: "item", role: "generic" },
    { id: RETURN_HANDLE, label: "return", role: "generic" },
  ]}
  onUngroup={data.onUngroup}
  parentId={data.parentId}
/>
