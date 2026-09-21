<!-- chaosnexus-forge/src/lib/components/LiteralNode.svelte -->
<script lang="ts">
  import { useSvelteFlow } from "@xyflow/svelte";
  import { RETURN_HANDLE } from "$lib/graph";
  import { pinRoleFromDataType } from "$lib/dual_editor/pin_roles";
  import NodeShell from "./flow/NodeShell.svelte";

  /**
   * Props for the LiteralNode component.
   */
  interface Props {
    id: string;
    data: {
      label: string;
      value?: unknown;
      valueType?: string;
      onUngroup?: (id: string) => void;
      parentId?: string;
      traceHighlight?: boolean;
    };
    selected?: boolean;
  }

  let { id, data, selected = false }: Props = $props();

  const { updateNodeData } = useSvelteFlow();
  const valueType = $derived(data.valueType ?? "string");
  let jsonError = $state(false);

  function commit(value: unknown): void {
    updateNodeData(id, { ...data, value });
  }

  function onText(event: Event): void {
    commit((event.currentTarget as HTMLInputElement).value);
  }

  function onNumber(event: Event): void {
    const raw = (event.currentTarget as HTMLInputElement).value;
    const parsed = valueType === "int" ? parseInt(raw, 10) : parseFloat(raw);
    commit(Number.isNaN(parsed) ? 0 : parsed);
  }

  function onBool(event: Event): void {
    commit((event.currentTarget as HTMLInputElement).checked);
  }

  function onJson(event: Event): void {
    const raw = (event.currentTarget as HTMLTextAreaElement).value;
    try {
      commit(JSON.parse(raw));
      jsonError = false;
    } catch {
      jsonError = true;
    }
  }

  const stringValue = $derived(typeof data.value === "string" ? data.value : "");
  const numberValue = $derived(typeof data.value === "number" ? data.value : 0);
  const boolValue = $derived(data.value === true);
  const jsonValue = $derived(data.value === undefined ? "" : JSON.stringify(data.value, null, 2));
</script>

<NodeShell
  {id}
  category="literal"
  title="Literal"
  subtitle={valueType}
  {selected}
  traceHighlight={data.traceHighlight}
  outputs={[{ id: RETURN_HANDLE, label: "value", role: pinRoleFromDataType(valueType) }]}
  onUngroup={data.onUngroup}
  parentId={data.parentId}
>
  {#snippet children()}
    {#if valueType === "bool"}
      <label class="flex items-center gap-1.5 flow-node-text theme-text-main cursor-pointer">
        <input type="checkbox" checked={boolValue} onchange={onBool} class="accent-[var(--color-accent)]" />
        {boolValue ? "true" : "false"}
      </label>
    {:else if valueType === "int" || valueType === "float"}
      <input
        type="number"
        step={valueType === "int" ? "1" : "any"}
        value={numberValue}
        oninput={onNumber}
        class="w-full px-1.5 py-0.5 flow-node-text theme-bg-soft theme-text-main theme-border border rounded outline-none"
      />
    {:else if valueType === "json"}
      <textarea
        value={jsonValue}
        oninput={onJson}
        rows="2"
        spellcheck="false"
        class="w-full px-1.5 py-0.5 flow-node-text theme-bg-soft theme-text-main border rounded outline-none resize-y
          {jsonError ? 'border-red-500' : 'theme-border'}"
      ></textarea>
      {#if jsonError}
        <p class="flow-node-mini text-red-400">Invalid JSON</p>
      {/if}
    {:else}
      <input
        type="text"
        value={stringValue}
        oninput={onText}
        placeholder="constant"
        class="w-full px-1.5 py-0.5 flow-node-text theme-bg-soft theme-text-main theme-border border rounded outline-none"
      />
    {/if}
  {/snippet}
</NodeShell>
