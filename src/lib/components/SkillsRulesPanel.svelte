<!-- chaosnexus-forge/src/lib/components/SkillsRulesPanel.svelte -->
<script lang="ts">
  /**
   * Editors for dual-scope `.chaosnexus/rules` and `.chaosnexus/skills`.
   */
  import { invoke } from "@tauri-apps/api/core";
  import { workbench } from "$lib/state.svelte";

  type Scope = "user" | "project";
  type Kind = "rule" | "skill";

  interface Item {
    name: string;
    kind: Kind;
    scope: Scope;
    path: string;
    description: string;
  }

  let scope = $state<Scope>("project");
  let kind = $state<Kind>("rule");
  let items = $state<Item[]>([]);
  let selected = $state<Item | null>(null);
  let content = $state("");
  let draftName = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);

  async function refresh() {
    error = null;
    try {
      items = await invoke<Item[]>("skills_rules_list", {
        projectPath: workbench.projectPath || null,
        scope,
        kind,
      });
    } catch (e) {
      error = String(e);
    }
  }

  async function openItem(item: Item) {
    selected = item;
    draftName = item.name;
    try {
      content = await invoke<string>("skills_rules_read", { path: item.path });
    } catch (e) {
      error = String(e);
    }
  }

  function newDraft() {
    selected = null;
    draftName = "";
    content = kind === "rule" ? "# Rule\n\n" : "# Skill\n\n";
  }

  async function save() {
    if (!draftName.trim()) {
      error = "Name is required.";
      return;
    }
    if (scope === "project" && !workbench.projectPath) {
      error = "Open a project to save project-scoped items.";
      return;
    }
    busy = true;
    error = null;
    try {
      const item = await invoke<Item>("skills_rules_write", {
        projectPath: workbench.projectPath || null,
        scope,
        kind,
        name: draftName.trim(),
        content,
      });
      selected = item;
      await refresh();
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!selected) return;
    busy = true;
    try {
      await invoke("skills_rules_delete", { path: selected.path });
      selected = null;
      content = "";
      draftName = "";
      await refresh();
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }

  $effect(() => {
    void scope;
    void kind;
    void workbench.projectPath;
    void refresh();
  });
</script>

<div class="flex flex-col h-full min-h-0 theme-bg-sidebar theme-text-main font-mono text-xs" data-testid="skills-rules-panel">
  <div class="flex-none px-3 py-2 theme-border-b theme-bg-header flex items-center gap-2">
    <span class="font-bold uppercase tracking-wider">Skills / Rules</span>
    <select class="theme-bg-main theme-border rounded px-1" data-testid="skills-rules-scope" bind:value={scope}>
      <option value="user">User (~/.chaosnexus)</option>
      <option value="project">Project</option>
    </select>
    <select class="theme-bg-main theme-border rounded px-1" data-testid="skills-rules-kind" bind:value={kind}>
      <option value="rule">Rules</option>
      <option value="skill">Skills</option>
    </select>
    <button type="button" class="ml-auto px-2 py-0.5 rounded border theme-border" data-testid="skills-rules-new" onclick={newDraft}>New</button>
  </div>

  {#if error}
    <p class="px-3 py-1 text-red-400 text-[10px]">{error}</p>
  {/if}

  <div class="flex-1 min-h-0 flex">
    <div class="w-36 flex-none overflow-y-auto theme-border-r">
      {#each items as item (item.path)}
        <button
          type="button"
          class="w-full text-left px-2 py-1.5 truncate hover:theme-bg-accent-soft {selected?.path === item.path
            ? 'theme-bg-accent text-white'
            : ''}"
          data-testid="skills-rules-item"
          onclick={() => openItem(item)}
        >
          {item.name}
        </button>
      {:else}
        <p class="px-2 py-3 theme-text-muted italic text-[10px]">None yet.</p>
      {/each}
    </div>
    <div class="flex-1 min-w-0 flex flex-col p-2 gap-2">
      <input
        class="w-full px-2 py-1 rounded border theme-border theme-bg-main"
        placeholder="name"
        data-testid="skills-rules-name"
        bind:value={draftName}
      />
      <textarea
        class="flex-1 min-h-[120px] w-full px-2 py-1 rounded border theme-border theme-bg-main resize-none"
        data-testid="skills-rules-content"
        bind:value={content}
      ></textarea>
      <div class="flex gap-2">
        <button
          type="button"
          class="px-2 py-1 rounded border theme-border theme-bg-accent text-white disabled:opacity-50"
          disabled={busy}
          data-testid="skills-rules-save"
          onclick={() => save()}
        >
          Save
        </button>
        {#if selected}
          <button
            type="button"
            class="px-2 py-1 rounded border theme-border theme-text-muted hover:text-red-400"
            disabled={busy}
            data-testid="skills-rules-delete"
            onclick={() => remove()}
          >
            Delete
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>
