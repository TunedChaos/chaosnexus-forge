<!-- chaosnexus-forge/src/lib/components/TacticalEdge.svelte -->
<script lang="ts">
  import { BaseEdge } from "@xyflow/svelte";
  import { routeEdge, type FlowNodeLike } from "$lib/dual_editor/edge_routing";

  /**
   * Properties for the TacticalEdge component.
   */
  interface Props {
    /** Unique identifier for the edge. */
    id: string;
    /** Unique identifier for the source node. */
    source: string;
    /** Unique identifier for the target node. */
    target: string;
    /** The X coordinate of the source node connection point. */
    sourceX: number;
    /** The Y coordinate of the source node connection point. */
    sourceY: number;
    /** The X coordinate of the target node connection point. */
    targetX: number;
    /** The Y coordinate of the target node connection point. */
    targetY: number;
    /** Optional inline CSS styles applied to the edge. */
    style?: string;
    /** Optional marker identifier for the end of the edge (e.g., arrow head). */
    markerEnd?: string;
    /** Additional data payload for the edge, containing nodes for routing. */
    data?: {
      /** Collection of flow nodes used for edge routing calculation. */
      nodes: FlowNodeLike[];
    };
  }

  let {
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    style = "",
    markerEnd = "",
    data,
  }: Props = $props();

  let pathD = $derived(
    routeEdge(sourceX, sourceY, targetX, targetY, data?.nodes ?? [], {
      source,
      target,
    })
  );
</script>

<BaseEdge
  {id}
  path={pathD}
  class="cf-edge cf-data-edge"
  {style}
  {markerEnd}
  interactionWidth={22}
/>

<style>
  :global(.svelte-flow__edge.cf-edge.cf-data-edge .svelte-flow__edge-path) {
    stroke: var(--cf-edge-color, var(--pin-generic));
    stroke-width: var(--cf-edge-w, 3px);
    fill: none;
    transition:
      stroke-width 0.12s ease,
      filter 0.12s ease;
  }

  :global(.svelte-flow__edge.cf-edge.cf-data-edge:hover .svelte-flow__edge-path),
  :global(.svelte-flow__edge.cf-edge.cf-data-edge.selected .svelte-flow__edge-path) {
    stroke-width: calc(var(--cf-edge-w, 3px) + 2px);
    filter: drop-shadow(0 0 4px var(--cf-edge-color, var(--pin-generic)));
  }
</style>
