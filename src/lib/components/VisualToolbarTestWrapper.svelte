<!-- chaosnexus-forge/src/lib/components/VisualToolbarTestWrapper.svelte -->
<script lang="ts">
  import { SvelteFlowProvider } from "@xyflow/svelte";
  import VisualToolbar from "./VisualToolbar.svelte";

  interface Props {
    onNewGroup?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    canUndo?: boolean;
    canRedo?: boolean;
    onAddNode?: (anchor?: DOMRect) => void;
    onRegenerate?: () => void;
    canRegenerate?: boolean;
    regenerateTooltip?: string;
  }

  let {
    onNewGroup = () => {},
    onUndo = () => {},
    onRedo = () => {},
    canUndo = false,
    canRedo = false,
    onAddNode = () => {},
    onRegenerate = () => {},
    canRegenerate = true,
    regenerateTooltip = "",
  }: Props = $props();
</script>

<SvelteFlowProvider>
  <VisualToolbar
    {onNewGroup}
    {onUndo}
    {onRedo}
    {canUndo}
    {canRedo}
    {onAddNode}
    {onRegenerate}
    {canRegenerate}
    {regenerateTooltip}
  />
</SvelteFlowProvider>
