<!-- chaosnexus-forge/src/lib/components/BranchNode.svelte -->
<script lang="ts">
  import NodeShell from "./flow/NodeShell.svelte";

  /**
   * Props for the BranchNode component.
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
  category="control"
  title="Branch"
  subtitle="condition router"
  {selected}
  traceHighlight={data.traceHighlight}
  inputs={[
    { id: "condition", label: "condition", role: "bool" },
    { id: "payload", label: "payload", role: "generic" },
  ]}
  outputs={[
    { id: "true", label: "true", role: "control" },
    { id: "false", label: "false", role: "control" },
  ]}
  onUngroup={data.onUngroup}
  parentId={data.parentId}
/>
