<!-- chaosnexus-forge/src/lib/components/DualEditor.svelte -->
<script lang="ts">
  import { untrack } from "svelte";
  import type { Node, Edge } from "@xyflow/svelte";
  import { workbench } from "$lib/state.svelte";
  import { engine } from "$lib/engine.svelte";
  import { pendingPlugins } from "$lib/pending.svelte";
  import EditorActionBar from "./dual_editor/EditorActionBar.svelte";
  import EditorPaneHeader from "./dual_editor/EditorPaneHeader.svelte";
  import MacroDrawer from "./MacroDrawer.svelte";
  import Splitter from "./Splitter.svelte";
  import { isDisplayOnlyCanvas } from "$lib/dual_editor/canvas_schema";
  import DualEditorFlowPane from "./dual_editor/DualEditorFlowPane.svelte";
  import DualEditorPendingBanner from "./dual_editor/DualEditorPendingBanner.svelte";
  import DualEditorWelcomePane from "./dual_editor/DualEditorWelcomePane.svelte";
  import ConfirmDeleteModal from "./ConfirmDeleteModal.svelte";
  import DualEditorMarkdownPane from "./dual_editor/DualEditorMarkdownPane.svelte";
  import MarkdownToolbar from "./dual_editor/MarkdownToolbar.svelte";
  import {
    createMonacoHost,
    bindEditorActionShortcuts,
  } from "$lib/dual_editor/monaco_host";
  import { bindMonacoEffects } from "$lib/dual_editor/monaco_sync.svelte";
  import { generateRhaiFromCanvas } from "$lib/dual_editor/vhai_codegen";

  import { parseRhaiToFlow, buildCanvasMetadata, getNodeCode, updateNodeCode } from "$lib/parser";
  import type { FlowPosition } from "$lib/dual_editor/node_palette";
  import { EditorHistory, type EditorSnapshot } from "$lib/dual_editor/history";
  import { createNodeActions } from "$lib/dual_editor/node_actions";
  import {
    restackGroups,
    resolveDropTargetAtPoint,
    collectGroupDescendants,
  } from "$lib/dual_editor/group_membership";
  import { resizeGroupsBottomUp, type Size } from "$lib/dual_editor/group_geometry";
  import IconPanelLeftClose from "~icons/lucide/panel-left-close";
  import IconPanelLeftOpen from "~icons/lucide/panel-left-open";
  import { assembly } from "$lib/assembly.svelte";
  import { engineSchema } from "$lib/schema.svelte";
  import {
    enrichNodesWithManifest,
    mergeCanvasAssemblyNodes,
    applyGraphDiagnostics,
  } from "$lib/assembly_flow";
  import type { FnSignature } from "$lib/graph";
  import { getCyclicEdges } from "$lib/cycle_detector";
  import { reconcileVisualEdges } from "$lib/dual_editor/edge_visuals";
  import type { CanvasPinDescriptor } from "$lib/dual_editor/canvas_schema";

  let monacoInstance: any = $state(null);
  let isUpdatingFromState = false;
  let codeWidth = $state(50);

  /** Flow positions queued for code-appended nodes before the parse pass materializes them. */
  const pendingNodePositions = new Map<string, FlowPosition>();

  // Visual graph nodes/edges state
  let nodes = $state<Node[]>([]);
  let edges = $state<Edge[]>([]);
  let getNodeSize = $state<((id: string) => Size | undefined) | undefined>(undefined);

  // Undo/redo history for the visual editor. One stack per open tab, capturing
  // {content, canvas} snapshots so undo covers code edits AND layout operations
  // (move/group/resize/delete). Capture is debounced so a continuous drag or a
  // burst of typing collapses into a single, settled history entry.
  const histories = new Map<string, EditorHistory>();
  const HISTORY_DEBOUNCE_MS = 350;
  let historyCaptureTimer: ReturnType<typeof setTimeout> | undefined;
  let historyReleaseTimer: ReturnType<typeof setTimeout> | undefined;
  /** Suppresses capture while a restored snapshot's reactive cascade settles. */
  let isApplyingHistory = false;
  /** Reactive mirrors of the active tab's history for the toolbar buttons. */
  let canUndo = $state(false);
  let canRedo = $state(false);

  function historyFor(key: string): EditorHistory {
    let h = histories.get(key);
    if (!h) {
      h = new EditorHistory();
      histories.set(key, h);
    }
    return h;
  }

  /** Mirrors a tab's undo/redo availability into reactive state for the toolbar. */
  function syncHistoryButtons(key: string): void {
    if (key !== activeKey) return;
    const h = histories.get(key);
    canUndo = !!h?.canUndo();
    canRedo = !!h?.canRedo();
  }

  /** Builds a snapshot of the current persistent editor state (content + sidecar). */
  function snapshotNow(): EditorSnapshot {
    const canvas = activeCanvas ? JSON.stringify(activeCanvas) : "";
    return { content: activeContent, canvas };
  }

  /** Records the current state immediately (used before an undo/redo step). */
  function flushHistoryCapture(): void {
    clearTimeout(historyCaptureTimer);
    if (isApplyingHistory || !isRhai || !activeKey) return;
    if (historyFor(activeKey).push(snapshotNow())) syncHistoryButtons(activeKey);
  }

  /** Restores a snapshot by rewriting both sources; the parse pass rebuilds the graph. */
  function applySnapshot(snapshot: EditorSnapshot): void {
    const tab = workbench.activeTab;
    if (!tab) return;
    clearTimeout(historyCaptureTimer);
    clearTimeout(historyReleaseTimer);
    isApplyingHistory = true;

    workbench.updateFileContent(tab.pluginName, tab.filename, snapshot.content);
    monacoInstance?.setValue(snapshot.content);
    if (snapshot.canvas) {
      try {
        workbench.updateCanvasContent(tab.pluginName, tab.filename, JSON.parse(snapshot.canvas));
      } catch {
        // A malformed snapshot is skipped rather than crashing the editor.
      }
    }

    // Release the guard once the parse -> sidecar-write cascade has settled past
    // the debounce window, so it cannot re-capture the state we just restored.
    historyReleaseTimer = setTimeout(() => {
      isApplyingHistory = false;
    }, HISTORY_DEBOUNCE_MS + 100);
  }

  function undoCanvas(): void {
    if (!isRhai || !activeKey) return;
    flushHistoryCapture();
    const snapshot = historyFor(activeKey).undo();
    if (!snapshot) return;
    applySnapshot(snapshot);
    syncHistoryButtons(activeKey);
  }

  function redoCanvas(): void {
    if (!isRhai || !activeKey) return;
    const snapshot = historyFor(activeKey).redo();
    if (!snapshot) return;
    applySnapshot(snapshot);
    syncHistoryButtons(activeKey);
  }

  async function handleCanvasSave(): Promise<void> {
    // Before manually saving, forcefully run the Visual -> Text generation if we are in visual mode
    if (viewMode === "visual" && pendingPlugins.isEditingEnabled !== false) {
       const tab = workbench.activeTab;
       if (tab && nodes.length > 0) {
           const generatedRhai = generateRhaiFromCanvas(nodes, edges);
           workbench.updateFileContent(tab.pluginName, tab.filename, generatedRhai);
           if (monacoInstance) monacoInstance.setValue(generatedRhai);
       }
    }
    await handleSave();
  }

  // Macro Drawer Settings State
  let isDrawerOpen = $state(false);
  let drawerNodeId = $state("");
  let drawerNodeLabel = $state("");
  let drawerInitialCode = $state("");

  /**
   * Pending destructive delete awaiting confirmation (opens
   * {@link ConfirmDeleteModal}). Only set when the selection contains at least
   * one non-empty group, since cascading group deletes are the sole case that
   * warrants a warning; empty groups and leaf nodes delete immediately.
   */
  let pendingDelete = $state<{ ids: string[]; title: string; message: string } | null>(null);

  /** True when the group has any descendant beyond itself (contents to cascade). */
  function groupHasContents(groupId: string): boolean {
    return collectGroupDescendants(groupId, nodes).length > 1;
  }

  /**
   * Routes a delete request: immediate when nothing dangerous is involved, or
   * via the confirmation modal when any targeted group has contents. `main_group`
   * and unknown ids are filtered out (Main Logic can never be deleted).
   *
   * @param rawIds Node/group ids the user asked to delete.
   */
  function requestDelete(rawIds: string[]): void {
    const ids = rawIds.filter((id) => id !== "main_group" && nodes.some((n) => n.id === id));
    if (ids.length === 0) return;

    const nonEmptyGroups = ids
      .map((id) => nodes.find((n) => n.id === id))
      .filter(
        (n): n is NonNullable<typeof n> => !!n && n.type === "group" && groupHasContents(n.id)
      );

    if (nonEmptyGroups.length === 0) {
      nodeActions.handleDeleteSelection(ids);
      return;
    }

    let title: string;
    let message: string;
    if (ids.length === 1) {
      const group = nonEmptyGroups[0];
      const count = collectGroupDescendants(group.id, nodes).length - 1;
      const label = (group.data as { label?: string }).label ?? group.id;
      title = `Delete group "${label}"?`;
      message =
        `Are you sure you want to delete this group? It and all of its contents ` +
        `(${count} contained ${count === 1 ? "item" : "items"}) will be deleted, ` +
        `including nested groups, nodes, and their Rhai anchors.`;
    } else {
      const groupWord = nonEmptyGroups.length === 1 ? "group" : "groups";
      title = `Delete ${ids.length} selected items?`;
      message =
        `This selection includes ${nonEmptyGroups.length} ${groupWord} with contents. ` +
        `Every selected item, including everything inside the selected groups ` +
        `(nested groups, nodes, and their Rhai anchors), will be deleted.`;
    }
    pendingDelete = { ids, title, message };
  }

  /** Deletes the current canvas selection (Delete/Backspace), minus Main Logic. */
  function requestDeleteSelection(): void {
    const ids = nodes.filter((n) => n.selected && n.id !== "main_group").map((n) => n.id);
    requestDelete(ids);
  }

  // Drives a group into inline-rename mode from the context menu by bumping a
  // transient token on its data; CustomGroupNode watches the token and focuses
  // its title input. The token is not part of buildCanvasMetadata or nodeShape,
  // so it neither persists to the sidecar nor retriggers the parse/commit loop.
  function requestRenameGroup(groupId: string): void {
    if (groupId === "main_group") return;
    nodes = nodes.map((n) => {
      if (n.id !== groupId || n.type !== "group") return n;
      const data = n.data as { renameToken?: number };
      return { ...n, data: { ...data, renameToken: (data.renameToken ?? 0) + 1 } };
    });
  }
  let activeKey = $derived(
    workbench.activeTab ? `${workbench.activeTab.pluginName}:${workbench.activeTab.filename}` : null
  );

  let activeContent = $derived(activeKey ? workbench.fileContents[activeKey] || "" : "");

  let activeCanvas = $derived(activeKey ? (workbench.canvasContents[activeKey] ?? null) : null);

  let canvasDisplayOnly = $derived(
    isDisplayOnlyCanvas(activeCanvas) ||
    (workbench.activeTab?.pluginName === "__PENDING__" && !pendingPlugins.isEditingEnabled)
  );

  let isRhai = $derived(
    workbench.activeTab ? workbench.activeTab.filename.endsWith(".rhai") : false
  );

  let isMarkdown = $derived(
    workbench.activeTab ? workbench.activeTab.filename.endsWith(".md") : false
  );

  let viewMode = $derived(workbench.activeTab?.viewMode || "split");

  let activeManifest = $derived(
    activeKey ? assembly.signaturesFor(activeKey) : ([] as FnSignature[])
  );

  let unboundFunctions = $derived.by(() => {
    if (!activeKey) return [] as string[];
    const bound = new Set(
      nodes
        .filter((n) => n.type !== "group")
        .map(
          (n) =>
            (n.data as { fn?: string; label?: string }).fn ?? (n.data as { label?: string }).label
        )
    );
    return activeManifest
      .filter((s) => s.access === "public" && !bound.has(s.name))
      .map((s) => s.name);
  });

  // Schema-generated native palette (SSOT): every public engine function name.
  let nativeFunctions = $derived(engineSchema.functions.map((f) => f.name));

  // Refresh the engine manifest whenever the active Rhai tab changes.
  $effect(() => {
    const tab = workbench.activeTab;
    const path = workbench.projectPath;
    const key = activeKey;
    const rhaiTab = isRhai;
    if (!rhaiTab || !tab || !path || !key) return;
    untrack(() => {
      void assembly.refresh(path, tab.pluginName, tab.filename);
    });
  });

  // Load the engine SSOT schema once so the native palette is populated.
  $effect(() => {
    void engineSchema.ensureLoaded();
  });

  let showEditorPane = $derived(
    !isRhai && !isMarkdown
      ? true
      : isRhai
        ? viewMode === "split" || viewMode === "code"
        : viewMode === "split" || viewMode === "code"
  );

  let showMarkdownPreview = $derived(
    isMarkdown && (viewMode === "split" || viewMode === "preview")
  );

  let showSplitLayout = $derived(
    (isRhai && viewMode === "split") || (isMarkdown && viewMode === "split")
  );

  let svelteFlowColorMode = $derived<"light" | "dark" | "system">(
    workbench.theme === "System"
      ? "system"
      : workbench.theme.toLowerCase().includes("light")
        ? "light"
        : "dark"
  );

  // Canvas node/edge handlers, extracted to node_actions.ts. They mutate this
  // component's reactive state through the accessor/mutator closures below so the
  // logic can live outside the component while staying fully reactive.
  const nodeActions = createNodeActions({
    getNodes: () => nodes,
    setNodes: (n) => (nodes = n),
    getEdges: () => edges,
    setEdges: (e) => (edges = e),
    getActiveContent: () => activeContent,
    getActiveManifest: () => activeManifest,
    getMonaco: () => monacoInstance,
    pendingNodePositions,
    onOpenSettings: handleOpenNodeSettings,
    getNodeSize: (id) => getNodeSize?.(id),
  });

  function confirmDelete(): void {
    if (!pendingDelete) return;
    nodeActions.handleDeleteSelection(pendingDelete.ids);
    pendingDelete = null;
  }

  bindMonacoEffects({
    getMonacoInstance: () => monacoInstance,
    getActiveKey: () => activeKey,
    getActiveContent: () => activeContent,
    getIsUpdatingFromState: () => isUpdatingFromState,
    setIsUpdatingFromState: (val) => (isUpdatingFromState = val),
  });

  // Reset nodes when activeKey changes to prevent cross-contamination
  let previousKey = $state("");
  $effect(() => {
    if (activeKey !== previousKey) {
      untrack(() => {
        nodes = [];
        edges = [];
        previousKey = activeKey || "";
        // Switch the toolbar's undo/redo state to the newly active tab's stack.
        if (activeKey) syncHistoryButtons(activeKey);
        else {
          canUndo = false;
          canRedo = false;
        }
      });
    }
  });

  // Debounced undo/redo capture: snapshot {content, canvas} once a change settles
  // so a drag or burst of typing yields a single history entry. Skipped while a
  // restored snapshot is being applied (its cascade must not re-enter the stack).
  $effect(() => {
    if (!isRhai || !activeKey) return;
    const content = activeContent;
    const canvasObj = activeCanvas;
    const key = activeKey;

    untrack(() => {
      if (isApplyingHistory) return;
      // Defer the first baseline until the sidecar has materialized so we do not
      // record a transient null-canvas state right before the parse pass writes it.
      if (!canvasObj && !histories.get(key)?.current()) return;

      clearTimeout(historyCaptureTimer);
      const snapshot: EditorSnapshot = {
        content,
        canvas: canvasObj ? JSON.stringify(canvasObj) : "",
      };
      historyCaptureTimer = setTimeout(() => {
        if (isApplyingHistory) return;
        if (historyFor(key).push(snapshot)) syncHistoryButtons(key);
      }, HISTORY_DEBOUNCE_MS);
    });
  });
  let pendingAstTimer: ReturnType<typeof setTimeout> | undefined;

  // Debounced AST generation for live-reloading visual script while editing pending plugins
  $effect(() => {
    const content = activeContent;
    const key = activeKey;
    const isPending = workbench.activeTab?.pluginName === "__PENDING__";
    const editingEnabled = pendingPlugins.isEditingEnabled;
    const filename = workbench.activeTab?.filename;

    if (isPending && editingEnabled && key && filename && content !== undefined) {
      untrack(() => {
        clearTimeout(pendingAstTimer);
        pendingAstTimer = setTimeout(async () => {
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            const res = await invoke<{ ast_canvas: string; rhai_source: string }>(
              "chaoswrench_parse_rhai_ast",
              { source: content }
            );
            if (res.ast_canvas) {
              const newCanvas = JSON.parse(res.ast_canvas);
              workbench.updateCanvasContent("__PENDING__", filename, newCanvas);
            }
          } catch (e) {
            console.error("Failed to live-reload visual script AST:", e);
          }
        }, 600); // Debounce to avoid constant parsing while typing
      });
    }
  });

  // 1. From code to Svelte Flow: Parse whenever active Rhai content changes
  $effect(() => {
    const content = activeContent;
    const key = activeKey;
    const canvas = activeCanvas;
    const rhaiTab = isRhai;

    untrack(() => {
      if (!rhaiTab || !key || content === undefined) return;

      const parsed = parseRhaiToFlow(content, workbench.nodeRegistry, canvas);
      const merged = mergeCanvasAssemblyNodes(parsed.nodes, canvas, activeManifest);
      const enriched = enrichNodesWithManifest(
        merged,
        activeManifest,
        key ? assembly.isKnown(key) : false
      );

      let mappedNodes = enriched.map((n) => {
        if (n.type === "group") {
          return {
            ...n,
            data: {
              ...n.data,
              onGroupResize: nodeActions.handleGroupResize,
            },
          };
        }
        return {
          ...n,
          data: {
            ...n.data,
            onOpenSettings: handleOpenNodeSettings,
            onUngroup: nodeActions.handleUngroupNode,
            parentId: n.parentId,
          },
        };
      });

      if (pendingNodePositions.size > 0) {
        mappedNodes = mappedNodes.map((n) => {
          const label = (n.data as { label?: string }).label;
          if (!label) return n;
          const pending = pendingNodePositions.get(label);
          if (!pending) return n;
          pendingNodePositions.delete(label);
          const { position, parentId } = nodeActions.resolveNodePlacement(pending);
          return { ...n, position, parentId: parentId ?? n.parentId };
        });
      }

      // Compute the final committed form up front (grow-only size + parent-first
      // restack) so the change check compares like-for-like. This pass is
      // idempotent, so comparing against it (instead of the raw parser output)
      // avoids a re-commit loop now that sizing can shift positions and restack
      // reorders nodes.
      const finalNodesBase = restackGroups(
        resizeGroupsBottomUp(mappedNodes, (id) => getNodeSize?.(id))
      );

      const mappedEdges = reconcileVisualEdges(parsed.edges, finalNodesBase);

      const diags = assembly.diagnosticsForCanvas(
        key,
        finalNodesBase.map((n) => ({
          id: n.id,
          fn: (n.data as { fn?: string }).fn,
          kind: (n.data as { kind?: string }).kind,
          type: n.type,
        })),
        mappedEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? undefined,
          targetHandle: e.targetHandle ?? undefined,
          type: e.type,
        }))
      );
      const finalNodes = applyGraphDiagnostics(finalNodesBase, diags);

      // Include `style` (the group size) so a snug auto-fit that only changed a
      // group's dimensions - e.g. healing a runaway-inflated sidecar on load -
      // is actually committed, not silently dropped because positions matched.
      const nodeShape = (n: Node) => ({
        id: n.id,
        x: n.position.x,
        y: n.position.y,
        label: (n.data as any).label,
        parentId: n.parentId,
        style: typeof n.style === "string" ? n.style : undefined,
      });
      const nodesChanged =
        JSON.stringify(finalNodes.map(nodeShape)) !== JSON.stringify(nodes.map(nodeShape));
      const edgesChanged =
        JSON.stringify(
          mappedEdges.map((e) => ({ id: e.id, source: e.source, target: e.target }))
        ) !== JSON.stringify(edges.map((e) => ({ id: e.id, source: e.source, target: e.target })));

      // Only commit when the structural form actually changed. Because the
      // committed form is the idempotent finalNodes, re-running this parse after
      // our own sidecar write compares equal and stops (the structural diff is
      // the loop-breaker that replaced the old timing guard).
      if (nodesChanged || edgesChanged) {
        nodes = finalNodes;
        edges = mappedEdges;

        if (monacoInstance) {
          setTimeout(() => {
            monacoInstance.trigger("fold", "editor.foldAllMarkerRegions");
          }, 50);
        }
      }
    });
  });

  // Highlight the canvas node tied to a selected trace span (error attribution).
  $effect(() => {
    if (!isRhai) return;
    const label = engine.highlightedNodeLabel;
    untrack(() => {
      nodes = nodes.map((n) => {
        const nodeLabel = (n.data as { label?: string }).label;
        const traceHighlight = !!label && nodeLabel === label;
        const current = (n.data as { traceHighlight?: boolean }).traceHighlight === true;
        if (current === traceHighlight) return n;
        return { ...n, data: { ...n.data, traceHighlight } };
      });
    });
  });

  // Keep edges obstacle node maps reactively in sync when nodes are dragged (Rhai only)
  $effect(() => {
    if (!isRhai) return;
    const currentNodes = nodes;

    untrack(() => {
      if (edges.length > 0) {
        let changed = false;
        edges = reconcileVisualEdges(edges, currentNodes);
      }
    });
  });

  // 2. From Svelte Flow to canvas sidecar (never embed metadata in Rhai source)
  let canvasWriteTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (!isRhai) return;
    const currentNodes = nodes;
    const currentEdges = edges;
    const tab = workbench.activeTab;
    const currentViewMode = viewMode;

    // Always persist a genuine change (diff-gated). The parse pass that reacts to
    // this write is idempotent, so it won't fight us; this guarantees every node
    // mutation reaches the sidecar instead of depending on guard timing.
    if (activeKey && currentNodes.length > 0 && tab) {
      const metadata = buildCanvasMetadata(currentNodes, currentEdges, {
        displayOnly: activeCanvas?.displayOnly,
      });
      const serialized = JSON.stringify(metadata);
      const existing = workbench.canvasContents[activeKey];
      if (serialized !== JSON.stringify(existing)) {
        clearTimeout(canvasWriteTimer);
        canvasWriteTimer = setTimeout(() => {
          workbench.updateCanvasContent(tab.pluginName, tab.filename, metadata);
          
          // --- Visual to Text Live Sync ---
          // If the user modifies the visual graph, we generate the Rhai code to match.
          // For performance, only auto-generate live if BOTH views are visible ('split').
          // Otherwise, it waits for a manual save or the safety auto-save timer.
          if (currentViewMode === "split" && monacoInstance && pendingPlugins.isEditingEnabled !== false) {
             const generatedRhai = generateRhaiFromCanvas(currentNodes, currentEdges);
             const currentCode = activeContent;
             // Only update if the logic structurally differs to avoid infinite cursor jumping
             if (generatedRhai.trim() !== currentCode.trim()) {
                 workbench.updateFileContent(tab.pluginName, tab.filename, generatedRhai);
                 monacoInstance.setValue(generatedRhai);
             }
          }
        }, 300);
      }
    }
  });

  // Safety Auto-Save Timer
  // Periodically commits the generated Vhai code if the user is in full-screen visual mode.
  let autoSaveTimer: ReturnType<typeof setInterval> | undefined;
  $effect(() => {
    clearInterval(autoSaveTimer);
    if (isRhai && viewMode === "visual" && pendingPlugins.isEditingEnabled !== false) {
      autoSaveTimer = setInterval(() => {
        const tab = workbench.activeTab;
        if (!tab || nodes.length === 0) return;
        const generatedRhai = generateRhaiFromCanvas(nodes, edges);
        if (generatedRhai.trim() !== activeContent.trim()) {
           workbench.updateFileContent(tab.pluginName, tab.filename, generatedRhai);
           if (monacoInstance) monacoInstance.setValue(generatedRhai);
        }
      }, 5000);
    }
  });

  // Re-layout Monaco when layout bounds change to fix resizing quirks
  $effect(() => {
    const _viewMode = viewMode;
    const _codeWidth = codeWidth;
    const _showSplit = showSplitLayout;
    if (monacoInstance) {
      requestAnimationFrame(() => {
        if (monacoInstance) monacoInstance.layout();
      });
    }
  });

  const monacoHost = createMonacoHost(() => ({
    initialContent: activeContent,
    getFilename: () => workbench.activeTab?.filename ?? "",
    onContentChange: (val) => {
      if (isUpdatingFromState || !workbench.activeTab) return;
      isUpdatingFromState = true;
      workbench.updateFileContent(
        workbench.activeTab.pluginName,
        workbench.activeTab.filename,
        val
      );
      isUpdatingFromState = false;
    },
    onInstance: (inst) => {
      monacoInstance = inst;
    },
  }));

  $effect(() => bindEditorActionShortcuts(() => monacoInstance));

  async function handleSave() {
    if (workbench.activeTab) {
      await workbench.saveFile(workbench.activeTab.pluginName, workbench.activeTab.filename);
    }
  }

  /** Switches the active tab's view mode (shared by the action bar + preview toggle). */
  function setViewMode(mode: "split" | "code" | "visual" | "preview") {
    if (workbench.activeTab) {
      const oldMode = workbench.activeTab.viewMode;
      
      // Force instantaneous reconciliation when switching back to split view
      if (mode === "split" && isRhai && pendingPlugins.isEditingEnabled !== false) {
        if (oldMode === "visual" && nodes.length > 0) {
          // Sync Visual -> Code instantly
          const generatedRhai = generateRhaiFromCanvas(nodes, edges);
          if (generatedRhai.trim() !== activeContent.trim()) {
            workbench.updateFileContent(workbench.activeTab.pluginName, workbench.activeTab.filename, generatedRhai);
            if (monacoInstance) monacoInstance.setValue(generatedRhai);
          }
          handleSave();
        } else if (oldMode === "code") {
          // Code -> Visual is usually parsed in the background instantly (debounced),
          // but we trigger a manual save just to be safe.
          handleSave();
        }
      }
      
      workbench.setTabViewMode(workbench.activeTab.pluginName, workbench.activeTab.filename, mode);
    }
  }

  // Macro settings drawer openers and handlers
  function handleOpenNodeSettings(nodeId: string, label: string) {
    drawerNodeId = nodeId;
    drawerNodeLabel = label;
    drawerInitialCode = getNodeCode(activeContent, label);
    isDrawerOpen = true;
  }

  function handleSaveNodeMacro(newCode: string) {
    const updatedFullCode = updateNodeCode(activeContent, drawerNodeLabel, newCode);

    if (updatedFullCode !== activeContent) {
      workbench.updateFileContent(
        workbench.activeTab!.pluginName,
        workbench.activeTab!.filename,
        updatedFullCode
      );

      if (monacoInstance) {
        monacoInstance.setValue(updatedFullCode);
      }
    }
    isDrawerOpen = false;
  }
  // Check for graph loop/cycles
  let hasCycles = $derived(getCyclicEdges(edges).size > 0);

  // Exposes graph helpers for Playwright E2E (browser-only, not serialized).
  $effect(() => {
    const root = (window as unknown as { _chaosforge_state?: Record<string, unknown> })
      ._chaosforge_state;
    if (!root) return;
    root.editorGraph = {
      nodeActions,
      getNodes: () => nodes,
      patchNode: (id: string, patch: Partial<Node>) => {
        nodes = nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
      },
      /** Playwright helper: cursor-based drop target for a node (flow coords). */
      resolveDropTargetAtPoint: (nodeId: string, cursorFlow: FlowPosition) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (!node) return null;
        return resolveDropTargetAtPoint(node, nodes, cursorFlow, (id) => getNodeSize?.(id));
      },
      // Undo/redo/save surface for E2E (mirrors the canvas keyboard shortcuts).
      undo: undoCanvas,
      redo: redoCanvas,
      save: handleCanvasSave,
      canUndo: () => (activeKey ? !!histories.get(activeKey)?.canUndo() : false),
      canRedo: () => (activeKey ? !!histories.get(activeKey)?.canRedo() : false),
      // Delete-key surface for E2E: requestDelete routes single ids/selections
      // through the same confirm-or-immediate logic as the keyboard handler.
      requestDelete: (ids: string[]) => requestDelete(ids),
      deleteSelection: requestDeleteSelection,
    };
  });
</script>

<div class="h-full w-full flex flex-col theme-bg-main">
  {#if workbench.activeTab}
    <!-- Workbench Pane Layout -->
    <div class="flex-1 w-full flex flex-col overflow-hidden relative min-h-0">
      <!-- Stable global header: tabs + Save always full-width (never moves). -->
      <EditorActionBar
        openTabs={workbench.openTabs}
        activeTab={workbench.activeTab}
        modifiedFiles={workbench.modifiedFiles}
        onSelectTab={(tab) => workbench.openTab(tab.pluginName, tab.filename)}
        onCloseTab={(tab, e) => {
          e.stopPropagation();
          workbench.attemptCloseTab(tab.pluginName, tab.filename);
        }}
        onSave={handleSave}
      />

      <div
        class="flex-1 w-full flex {showSplitLayout ? 'theme-divide-x' : ''} overflow-hidden min-h-0"
      >
        <!-- Left Pane: Monaco Code Editor -->
        {#if showEditorPane}
          <div
            data-testid="dual-editor-code-pane"
            style="width: {showSplitLayout ? codeWidth + '%' : '100%'}"
            class="h-full flex flex-col overflow-hidden theme-bg-main {showSplitLayout
              ? 'flex-none'
              : 'flex-1'}"
          >
            {#if isRhai}
              <EditorPaneHeader label="Code" {viewMode} onSetViewMode={setViewMode} />
            {:else if isMarkdown}
              <MarkdownToolbar {monacoInstance} {viewMode} onSetViewMode={setViewMode} />
            {/if}

            <!-- Pending Plugin Review Banner -->
            <DualEditorPendingBanner />

            <div class="relative flex-1 w-full h-full min-h-0 theme-bg-main">
              <div use:monacoHost class="absolute inset-0"></div>
              {#if !monacoInstance}
                <div
                  class="absolute inset-0 flex flex-col items-center justify-center gap-3 theme-bg-main pointer-events-none"
                  data-testid="monaco-loading"
                  aria-hidden="true"
                >
                  <div
                    class="w-48 h-2 rounded theme-bg-sidebar overflow-hidden border theme-border"
                    role="presentation"
                  >
                    <div class="h-full w-1/3 theme-bg-accent-soft animate-pulse rounded"></div>
                  </div>
                  <span class="text-[10px] font-bold uppercase tracking-wider theme-text-muted"
                    >Loading editor</span
                  >
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Center Splitter -->
        {#if showSplitLayout}
          <Splitter
            min={20}
            max={80}
            bind:value={codeWidth}
            type="percent"
            testId="dual-editor-split-handle"
          />
        {/if}

        <!-- Right Pane: Markdown Preview -->
        {#if showMarkdownPreview}
          <DualEditorMarkdownPane {activeContent} {viewMode} onSetViewMode={setViewMode} />
        {/if}

        <!-- Right Pane: Svelte Flow Visual Graph -->
        {#if isRhai && (viewMode === "split" || viewMode === "visual")}
          <DualEditorFlowPane
            bind:nodes
            bind:edges
            bind:getNodeSize
            {hasCycles}
            {svelteFlowColorMode}
            onConnect={nodeActions.handleConnect}
            onNewGroup={nodeActions.handleNewGroup}
            onPaletteAction={nodeActions.handlePaletteAction}
            onEditNode={handleOpenNodeSettings}
            onUngroupNode={nodeActions.handleUngroupNode}
            onDeleteNode={nodeActions.handleDeleteNode}
            onDeleteGroup={(id) => requestDelete([id])}
            onDeleteSelection={requestDeleteSelection}
            onRenameGroup={requestRenameGroup}
            onNodeDragStop={nodeActions.handleNodeDragStop}
            onNodesDragStop={nodeActions.handleNodesDragStop}
            onHighlightGroup={nodeActions.setGroupHighlight}
            onAddToGroup={nodeActions.handleAddToGroup}
            onSave={handleCanvasSave}
            onUndo={undoCanvas}
            onRedo={redoCanvas}
            {canUndo}
            {canRedo}
            {unboundFunctions}
            {nativeFunctions}
            {canvasDisplayOnly}
          />
        {/if}
      </div>
    </div>

    <!-- Slide-out Settings Drawer with mini Monaco instance -->
    <MacroDrawer
      isOpen={isDrawerOpen}
      nodeLabel={drawerNodeLabel}
      initialCode={drawerInitialCode}
      onSave={handleSaveNodeMacro}
      onClose={() => {
        isDrawerOpen = false;
      }}
    />

    <ConfirmDeleteModal
      open={!!pendingDelete}
      title={pendingDelete?.title ?? ""}
      message={pendingDelete?.message ?? ""}
      confirmLabel={(pendingDelete?.ids.length ?? 0) > 1 ? "Delete Selection" : "Delete Group"}
      onConfirm={confirmDelete}
      onCancel={() => (pendingDelete = null)}
    />
  {:else}
    <!-- No Active Tab Operator Welcome stage -->
    <DualEditorWelcomePane />
  {/if}
</div>
