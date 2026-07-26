<!-- chaosnexus-forge/src/lib/components/ExecEdge.svelte -->
<script lang="ts">
  import { BaseEdge } from "@xyflow/svelte";
  import { routeEdge, type FlowNodeLike } from "$lib/dual_editor/edge_routing";

  /**
   * Props for the ExecEdge component.
   */
  interface Props {
    /** Unique identifier for the edge. */
    id: string;
    /** Source node identifier. */
    source: string;
    /** Target node identifier. */
    target: string;
    /** X coordinate of the source handle. */
    sourceX: number;
    /** Y coordinate of the source handle. */
    sourceY: number;
    /** X coordinate of the target handle. */
    targetX: number;
    /** Y coordinate of the target handle. */
    targetY: number;
    /** CSS style properties for the edge path. */
    style?: string;
    /** SVG marker-end attribute (e.g. arrow url). */
    markerEnd?: string;
    /** Optional metadata associated with the edge. */
    data?: {
      /** Nodes used to route the edge. */
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

  let path = $derived(
    routeEdge(sourceX, sourceY, targetX, targetY, data?.nodes ?? [], {
      source,
      target,
    })
  );
</script>

<BaseEdge
  {id}
  path={path}
  class="cf-edge cf-exec-edge"
  style={style}
  interactionWidth={22}
  markerEnd={markerEnd || "url(#exec-arrow)"}
/>

<style>
  :global(.svelte-flow__edge.cf-edge.cf-exec-edge .svelte-flow__edge-path) {
    stroke: var(--cf-edge-color, var(--pin-exec));
    stroke-width: var(--cf-edge-w, 3px);
    fill: none;
    transition:
      stroke-width 0.12s ease,
      filter 0.12s ease;
  }

  :global(.svelte-flow__edge.cf-edge.cf-exec-edge:hover .svelte-flow__edge-path),
  :global(.svelte-flow__edge.cf-edge.cf-exec-edge.selected .svelte-flow__edge-path) {
    stroke-width: calc(var(--cf-edge-w, 3px) + 2px);
    filter: drop-shadow(0 0 4px var(--cf-edge-color, var(--pin-exec)));
  }
</style>
