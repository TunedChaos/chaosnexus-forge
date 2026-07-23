// chaosnexus-forge/src/lib/state.svelte.ts

/**
 * @file state.svelte.ts
 * @module chaosnexus-forge/state
 * @description State management and workbench handling for the ChaosNexus Forge editor.
 */

import { invoke } from "@tauri-apps/api/core";
import type { PluginMetadata, TabState, NodeDef, FileNode } from "./types";
import type { CanvasMetadata } from "./parser";
import { stripCanvasMetadata } from "./parser";
import {
  isRhaiScript,
  loadCanvasForTab,
  writeCanvasSidecar,
} from "./dual_editor/canvas_storage";

/** VS Code-aligned default Monaco editor font size (px). */
export const EDITOR_FONT_SIZE_DEFAULT = 14;

/** UI chrome is one step smaller than the editor for VS Code-like density. */
export const UI_FONT_SIZE_OFFSET = -1;

/** Selectable workbench themes (display names persisted in localStorage). */
export const THEME_OPTIONS = [
  "System",
  "Standard Dark",
  "Standard Light",
  "High Contrast Dark",
  "High Contrast Light",
  "Protanopia Dark",
  "Protanopia Light",
  "Deuteranopia Dark",
  "Deuteranopia Light",
  "Tritanopia Dark",
  "Tritanopia Light",
  "Monochromacy Dark",
  "Monochromacy Light",
] as const;

/** Type alias for a valid theme option derived from THEME_OPTIONS. */
export type ThemeOption = (typeof THEME_OPTIONS)[number];

/**
 * Curated editor/UI font families offered in Settings. Each value is a complete
 * CSS `font-family` stack ending in a generic fallback, so an uninstalled face
 * still degrades gracefully. The preview dropdown renders every row in its own
 * stack so the user sees the typeface before applying it.
 */
export const FONT_FAMILY_OPTIONS: { label: string; value: string }[] = [
  { label: "Fira Code", value: "'Fira Code', monospace" },
  { label: "JetBrains Mono", value: "'JetBrains Mono', monospace" },
  { label: "Cascadia Code", value: "'Cascadia Code', monospace" },
  { label: "Source Code Pro", value: "'Source Code Pro', monospace" },
  { label: "IBM Plex Mono", value: "'IBM Plex Mono', monospace" },
  { label: "Hack", value: "'Hack', monospace" },
  { label: "JetBrains Mono NL", value: "'JetBrains Mono NL', monospace" },
  { label: "Consolas", value: "Consolas, monospace" },
  { label: "Menlo / Monaco", value: "Menlo, Monaco, monospace" },
  { label: "Courier New", value: "'Courier New', monospace" },
  { label: "System Monospace", value: "monospace" },
  { label: "System Sans", value: "system-ui, sans-serif" },
];

/** Maps a theme display name to the `data-theme` slug on `<html>`. */
export const THEME_SLUG_MAP: Record<string, string> = {
  "Standard Dark": "dark",
  "Standard Light": "light",
  "High Contrast Dark": "hc-dark",
  "High Contrast Light": "hc-light",
  "Protanopia Dark": "protanopia-dark",
  "Protanopia Light": "protanopia-light",
  "Deuteranopia Dark": "deuteranopia-dark",
  "Deuteranopia Light": "deuteranopia-light",
  "Tritanopia Dark": "tritanopia-dark",
  "Tritanopia Light": "tritanopia-light",
  "Monochromacy Dark": "monochromacy-dark",
  "Monochromacy Light": "monochromacy-light",
};

/**
 * Resolves the `data-theme` attribute value for a workbench theme selection.
 * When `theme` is `System`, uses `systemPrefersDark` or the live media query.
 */
export function resolveThemeDataAttribute(
  theme: string,
  systemPrefersDark?: boolean
): string {
  if (theme === "System") {
    const dark =
      systemPrefersDark ??
      (typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    return dark ? "dark" : "light";
  }
  return THEME_SLUG_MAP[theme] ?? "dark";
}

/** Legacy zoom defaults stored in localStorage before typography alignment. */
const LEGACY_EDITOR_FONT_SIZES = new Set([16, 18]);

/** Maps editor font size to compact UI chrome size. */
export function resolveUiFontSize(editorFontSize: number): number {
  return Math.max(11, editorFontSize + UI_FONT_SIZE_OFFSET);
}

function extractFilePaths(nodes: FileNode[], currentPath = ""): string[] {
  let paths: string[] = [];
  for (const node of nodes) {
    const fullPath = currentPath ? `${currentPath}/${node.name}` : node.name;
    if (node.is_dir && node.children) {
      paths.push(...extractFilePaths(node.children, fullPath));
    } else {
      paths.push(fullPath);
    }
  }
  return paths;
}

/**
 * Represents the state of the unsaved changes prompt dialog.
 * Contains the files to be saved and a resolution callback.
 */
export interface UnsavedPromptState {
  files: { pluginName: string; filename: string }[];
  resolve: (choice: "save" | "dont_save" | "cancel") => void;
}

/** localStorage key holding the restorable editor session (VS Code-like). */
const SESSION_STORAGE_KEY = "chaosnexus-forge:session";

/**
 * Serializable snapshot of the open editor session, persisted so the next launch
 * reopens the same workspace, tabs, focused tab, and per-tab view modes.
 */
export interface SessionSnapshot {
  /** Workspace the tabs belong to; restore is skipped if it no longer matches. */
  projectPath: string;
  /** Open tabs in display order (each carrying its own view mode). */
  openTabs: TabState[];
  /** "pluginName:filename" of the focused tab, or null when none. */
  activeTab: string | null;
}

/**
 * Reactive store managing the global workspace, active tabs, theme, and file contents.
 * Uses Svelte 5 runes for reactivity across the application.
 */
export class WorkbenchState {
  projectPath = $state<string>("");
  plugins = $state<PluginMetadata[]>([]);
  activePlugin = $state<PluginMetadata | null>(null);
  openTabs = $state<TabState[]>([]);
  activeTab = $state<TabState | null>(null);
  selectedFileNode = $state<{
    pluginName: string;
    path: string;
    is_dir: boolean;
    name: string;
  } | null>(null);
  modifiedFiles = $state<Record<string, boolean>>({}); // "pluginName:filename" -> boolean
  fileContents = $state<Record<string, string>>({}); // "pluginName:filename" -> content
  originalContents = $state<Record<string, string>>({}); // "pluginName:filename" -> content
  /** Visual canvas layout per Rhai tab (sidecar-backed). */
  canvasContents = $state<Record<string, CanvasMetadata | null>>({});
  originalCanvasContents = $state<Record<string, string>>({});
  modifiedCanvas = $state<Record<string, boolean>>({});
  nodeRegistry = $state<NodeDef[]>([]);
  unsavedPrompt = $state<UnsavedPromptState | null>(null);

  // Phase D Theme & Typography States
  fontSize = $state<number>(EDITOR_FONT_SIZE_DEFAULT);
  fontFamily = $state<string>("'Fira Code', monospace");
  theme = $state<string>("System");
  showCreateModal = $state<boolean>(false);
  isClosing = $state<boolean>(false);

  private canvasSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Suppresses session writes while a restore is replaying saved tabs. */
  private restoringSession = false;

  constructor() {
    // Load states and LKG path on startup
    if (typeof window !== "undefined") {
      this.initNodeRegistry();
      this.setupCloseInterceptor();

      // Reconnect the last workspace (or probe defaults), then replay the saved
      // editor session so the app reopens exactly where it left off.
      const savedPath = localStorage.getItem("chaosnexus-forge:last_project_path");
      if (savedPath) {
        this.connectWorkspace(savedPath).then(() => this.restoreLastSession());
      } else {
        this.probeDefaultWorkspaces().then(() => this.restoreLastSession());
      }

      const savedTheme = localStorage.getItem("chaosnexus-forge:theme");
      if (savedTheme) {
        this.theme = savedTheme;
      }

      const savedFontSize = localStorage.getItem("chaosnexus-forge:font_size");
      if (savedFontSize) {
        let parsed = parseInt(savedFontSize, 10);
        if (!isNaN(parsed) && parsed >= 10 && parsed <= 40) {
          if (LEGACY_EDITOR_FONT_SIZES.has(parsed)) {
            parsed = EDITOR_FONT_SIZE_DEFAULT;
            localStorage.setItem("chaosnexus-forge:font_size", parsed.toString());
          }
          this.fontSize = parsed;
        }
      }

      const savedFontFamily = localStorage.getItem("chaosnexus-forge:font_family");
      if (savedFontFamily) {
        this.fontFamily = savedFontFamily;
      }
    }
  }

  setFontSize(size: number) {
    const clamped = Math.max(10, Math.min(40, size));
    this.fontSize = clamped;
    localStorage.setItem("chaosnexus-forge:font_size", clamped.toString());
  }

  setFontFamily(family: string) {
    this.fontFamily = family;
    localStorage.setItem("chaosnexus-forge:font_family", family);
  }

  async initNodeRegistry() {
    try {
      const registry = await invoke<NodeDef[]>("get_node_registry");
      if (Array.isArray(registry)) {
        this.nodeRegistry = registry;
      }
    } catch (err) {
      console.error("Failed to initialize node registry:", err);
    }
  }

  setTheme(theme: string) {
    this.theme = theme;
    localStorage.setItem("chaosnexus-forge:theme", theme);
  }

  async probeDefaultWorkspaces() {
    const defaults = ["../chaosnexus-scripts/plugins", "./chaosnexus-scripts/plugins", "../chaosnexus-anvil/plugins"];
    for (const path of defaults) {
      try {
        const list = await invoke("scan_plugins", { projectPath: path });
        const hasLivePlugins = Array.isArray(list) && list.length > 0;

        if (hasLivePlugins) {
          await this.connectWorkspace(path);
          break; // Stop probing on first successful folder link
        }

        // Agents can create quarantined plugins without adding any live
        // `scripts/plugins/*` folders. Detect those so reopening the IDE still
        // shows the Pending Approvals panel.
        const pending = await invoke("list_pending_plugins", { projectPath: path });
        const hasPendingPlugins = Array.isArray(pending) && pending.length > 0;

        if (hasPendingPlugins) {
          await this.connectWorkspace(path);
          break;
        }
      } catch (err) {
        // Continue probing subsequent defaults
      }
    }
  }

  async pickAndConnectWorkspace() {
    try {
      const path = await invoke<string>("pick_folder");
      if (path) {
        await this.connectWorkspace(path);
      }
    } catch (err) {
      console.error("Failed to pick workspace folder:", err);
    }
  }

  async connectWorkspace(path: string) {
    try {
      const list = await invoke("scan_plugins", { projectPath: path });
      this.projectPath = path;
      this.plugins = list as PluginMetadata[];
      localStorage.setItem("chaosnexus-forge:last_project_path", path);

      // If we connected and had an active plugin that still exists, preserve it
      if (this.activePlugin) {
        const found = this.plugins.find((p) => p.name === this.activePlugin!.name);
        if (found) {
          this.activePlugin = found;
        } else {
          this.activePlugin = null;
          this.openTabs = [];
          this.activeTab = null;
          this.persistSession();
        }
      }
    } catch (err) {
      console.error("Failed to connect workspace:", err);
      this.disconnectWorkspace();
    }
  }

  disconnectWorkspace() {
    this.projectPath = "";
    this.plugins = [];
    this.activePlugin = null;
    this.openTabs = [];
    this.activeTab = null;
    localStorage.removeItem("chaosnexus-forge:last_project_path");
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  async refreshWorkspace() {
    if (this.projectPath) {
      await this.connectWorkspace(this.projectPath);
    }
  }

  async createPlugin(name: string, description: string) {
    if (!this.projectPath) throw new Error("No active workspace");
    const rhaiFilename = `${name}_tool.rhai`;
    await invoke("create_new_plugin", {
      projectPath: this.projectPath,
      name,
      description,
    });
    await writeCanvasSidecar(this.projectPath, name, rhaiFilename, { nodes: [], edges: [] });
    await this.refreshWorkspace();
  }

  async createFile(pluginName: string, filename: string) {
    if (!this.projectPath) throw new Error("No active workspace");
    await invoke("create_new_file", {
      projectPath: this.projectPath,
      pluginName,
      filename,
    });
    this.openTab(pluginName, filename);
    await this.refreshWorkspace();
  }

  async renameFile(pluginName: string, oldFilename: string, newFilename: string) {
    if (!this.projectPath) throw new Error("No active workspace");
    await invoke("rename_file", {
      projectPath: this.projectPath,
      pluginName,
      oldFilename,
      newFilename,
    });
    this.closeTab(pluginName, oldFilename);
    await this.refreshWorkspace();
  }

  async deleteFile(pluginName: string, filename: string) {
    if (!this.projectPath) throw new Error("No active workspace");
    await invoke("delete_file", {
      projectPath: this.projectPath,
      pluginName,
      filename,
    });
    this.closeTab(pluginName, filename);
    await this.refreshWorkspace();
  }

  async updatePluginDependencies(pluginName: string, dependencies: string[]) {
    if (!this.projectPath) throw new Error("No active workspace");
    await invoke("update_plugin_dependencies", {
      projectPath: this.projectPath,
      pluginName,
      dependencies,
    });
    await this.refreshWorkspace();
  }

  async selectPlugin(plugin: PluginMetadata) {
    this.activePlugin = plugin;
    // Removed auto-open behavior at user request
  }

  /**
   * Opens (or re-focuses) a file tab, fetching its content first so an
   * unreadable file (e.g. one deleted since last session) never leaves a ghost
   * tab behind. Returns whether the tab is now open.
   *
   * @param pluginName Owning plugin of the file.
   * @param filename File path relative to the plugin root.
   * @returns true when the tab is open/active, false when the read failed.
   */
  async openTab(pluginName: string, filename: string): Promise<boolean> {
    const key = `${pluginName}:${filename}`;

    // Prefetch file content from backend if not already cached; bail cleanly
    // (no tab added) when the file can't be read.
    if (this.fileContents[key] === undefined) {
      if (pluginName === "__PENDING__") {
        try {
          const detail = await invoke<{ rhai_source: string; canvas_sidecar?: string }>("read_pending_plugin", {
            projectPath: this.projectPath,
            pluginName: filename,
          });
          this.fileContents[key] = detail.rhai_source;
          this.originalContents[key] = detail.rhai_source;
          if (detail.canvas_sidecar) {
            try {
              this.canvasContents[key] = JSON.parse(detail.canvas_sidecar);
            } catch (e) {
              console.warn("Failed to parse canvas sidecar for pending plugin", e);
            }
          }
          this.modifiedFiles[key] = false;
        } catch (err) {
          console.error("Failed to read pending plugin:", err);
          return false;
        }
      } else {
        try {
          const content = await invoke("read_plugin_file", {
            projectPath: this.projectPath,
            pluginName,
            filename,
          });
          this.fileContents[key] = content as string;
          this.originalContents[key] = content as string;
          this.modifiedFiles[key] = false;

          if (isRhaiScript(filename)) {
            await this.loadCanvasForKey(pluginName, filename);
          }
        } catch (err) {
          console.error("Failed to read plugin file:", err);
          return false;
        }
      }
    }

    const exists = this.openTabs.some(
      (t) => t.pluginName === pluginName && t.filename === filename
    );
    if (!exists) {
      this.openTabs = [...this.openTabs, { pluginName, filename, viewMode: "split" }];
    }
    const existingTab = this.openTabs.find(
      (t) => t.pluginName === pluginName && t.filename === filename
    );
    this.activeTab = existingTab || { pluginName, filename, viewMode: "split" };

    this.persistSession();
    return true;
  }

  closeTab(pluginName: string, filename: string) {
    this.openTabs = this.openTabs.filter(
      (t) => !(t.pluginName === pluginName && t.filename === filename)
    );

    // Clear dirty state and cached contents so they don't persist after the tab is closed
    const key = `${pluginName}:${filename}`;
    this.clearFileCache(key);

    if (this.activeTab?.pluginName === pluginName && this.activeTab?.filename === filename) {
      if (this.openTabs.length > 0) {
        this.activeTab = this.openTabs[this.openTabs.length - 1];
      } else {
        this.activeTab = null;
      }
    }

    this.persistSession();
  }

  clearFileCache(key: string) {
    delete this.modifiedFiles[key];
    delete this.fileContents[key];
    delete this.originalContents[key];
    delete this.canvasContents[key];
    delete this.originalCanvasContents[key];
    delete this.modifiedCanvas[key];
    const timer = this.canvasSaveTimers.get(key);
    if (timer) clearTimeout(timer);
    this.canvasSaveTimers.delete(key);
  }

  /**
   * Writes the current open-tabs session to localStorage so the next launch can
   * restore it. No-ops while a restore is replaying tabs and on the server.
   */
  persistSession() {
    if (typeof localStorage === "undefined" || this.restoringSession) return;
    try {
      const snapshot: SessionSnapshot = {
        projectPath: this.projectPath,
        openTabs: this.openTabs.map((t) => ({ ...t })),
        activeTab: this.activeTab
          ? `${this.activeTab.pluginName}:${this.activeTab.filename}`
          : null,
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (err) {
      console.error("Failed to persist session:", err);
    }
  }

  /**
   * Replays the persisted session for the currently connected workspace: reopens
   * each saved tab (skipping files whose plugin is gone or that fail to read),
   * restores per-tab view modes, and re-focuses the previously active tab. Must
   * run after {@link connectWorkspace} so `plugins` is populated.
   */
  async restoreLastSession() {
    if (typeof localStorage === "undefined") return;

    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return;

    let snapshot: SessionSnapshot;
    try {
      snapshot = JSON.parse(raw) as SessionSnapshot;
    } catch {
      return;
    }

    // Only restore tabs belonging to the workspace we actually reconnected to.
    if (!snapshot || snapshot.projectPath !== this.projectPath) return;
    if (!Array.isArray(snapshot.openTabs) || snapshot.openTabs.length === 0) return;

    this.restoringSession = true;
    try {
      for (const tab of snapshot.openTabs) {
        if (!tab?.pluginName || !tab?.filename) continue;
        // Skip tabs whose plugin no longer exists in the reconnected workspace.
        if (!this.plugins.some((p) => p.name === tab.pluginName)) continue;
        const opened = await this.openTab(tab.pluginName, tab.filename);
        if (opened && tab.viewMode) {
          this.setTabViewMode(tab.pluginName, tab.filename, tab.viewMode);
        }
      }

      // Re-focus the previously active tab when it survived restoration.
      if (snapshot.activeTab) {
        const active = this.openTabs.find(
          (t) => `${t.pluginName}:${t.filename}` === snapshot.activeTab
        );
        if (active) {
          this.activeTab = active;
          const plugin = this.plugins.find((p) => p.name === active.pluginName);
          if (plugin) this.activePlugin = plugin;
        }
      }
    } finally {
      this.restoringSession = false;
    }

    this.persistSession();
  }

  async attemptCloseTab(pluginName: string, filename: string) {
    const key = `${pluginName}:${filename}`;
    if (this.modifiedFiles[key] || this.modifiedCanvas[key]) {
      const choice = await this.promptUnsavedChanges([{ pluginName, filename }]);
      if (choice === "save") {
        await this.saveFile(pluginName, filename);
        this.closeTab(pluginName, filename);
      } else if (choice === "dont_save") {
        this.closeTab(pluginName, filename);
      }
    } else {
      this.closeTab(pluginName, filename);
    }
  }

  setTabViewMode(
    pluginName: string,
    filename: string,
    viewMode: "split" | "code" | "visual" | "preview"
  ) {
    const tab = this.openTabs.find((t) => t.pluginName === pluginName && t.filename === filename);
    if (tab) {
      tab.viewMode = viewMode;
    }
    if (this.activeTab?.pluginName === pluginName && this.activeTab?.filename === filename) {
      this.activeTab.viewMode = viewMode;
    }
    this.persistSession();
  }

  updateFileContent(pluginName: string, filename: string, newContent: string) {
    const key = `${pluginName}:${filename}`;
    this.fileContents[key] = newContent;
    this.modifiedFiles[key] = newContent !== this.originalContents[key];
  }

  /** Updates in-memory canvas layout and debounces sidecar persistence. */
  updateCanvasContent(pluginName: string, filename: string, metadata: CanvasMetadata | null) {
    const key = `${pluginName}:${filename}`;
    this.canvasContents[key] = metadata;
    const serialized = metadata ? JSON.stringify(metadata) : "";
    this.modifiedCanvas[key] = serialized !== (this.originalCanvasContents[key] ?? "");
    this.scheduleCanvasSave(pluginName, filename);
  }

  async loadCanvasForKey(pluginName: string, filename: string) {
    const key = `${pluginName}:${filename}`;
    if (!isRhaiScript(filename) || !this.projectPath) return;

    const rhaiContent = this.fileContents[key] ?? "";
    const { metadata, strippedRhai, migratedFromEmbedded } = await loadCanvasForTab(
      this.projectPath,
      pluginName,
      filename,
      rhaiContent
    );

    if (strippedRhai !== rhaiContent) {
      this.fileContents[key] = strippedRhai;
      if (migratedFromEmbedded) {
        this.modifiedFiles[key] = strippedRhai !== this.originalContents[key];
      }
    }

    const serialized = metadata ? JSON.stringify(metadata) : "";
    this.canvasContents[key] = metadata;
    this.originalCanvasContents[key] = serialized;
    this.modifiedCanvas[key] = migratedFromEmbedded && metadata !== null;

    if (migratedFromEmbedded && metadata) {
      void this.saveCanvasSidecar(pluginName, filename);
    }
  }

  private scheduleCanvasSave(pluginName: string, filename: string) {
    const key = `${pluginName}:${filename}`;
    const existing = this.canvasSaveTimers.get(key);
    if (existing) clearTimeout(existing);

    this.canvasSaveTimers.set(
      key,
      setTimeout(() => {
        this.canvasSaveTimers.delete(key);
        void this.saveCanvasSidecar(pluginName, filename);
      }, 400)
    );
  }

  async saveCanvasSidecar(pluginName: string, filename: string) {
    const key = `${pluginName}:${filename}`;
    if (!this.projectPath || !isRhaiScript(filename)) return;

    const metadata = this.canvasContents[key];
    if (!metadata) return;

    try {
      await writeCanvasSidecar(this.projectPath, pluginName, filename, metadata);
      const serialized = JSON.stringify(metadata);
      this.originalCanvasContents[key] = serialized;
      this.modifiedCanvas[key] = false;
    } catch (err) {
      console.error("Failed to save canvas sidecar:", err);
    }
  }

  async saveFile(pluginName: string, filename: string) {
    const key = `${pluginName}:${filename}`;
    const content = this.fileContents[key];
    if (content === undefined) return;

    const payload = isRhaiScript(filename) ? stripCanvasMetadata(content) : content;

    try {
      if (pluginName === "__PENDING__") {
        await invoke("update_pending_plugin", {
          projectPath: this.projectPath,
          pluginName: filename,
          newSource: payload,
          canvasSidecar: isRhaiScript(filename) && this.canvasContents[key]
            ? JSON.stringify(this.canvasContents[key])
            : null,
        });
      } else {
        await invoke("write_plugin_file", {
          projectPath: this.projectPath,
          pluginName,
          filename,
          contents: payload,
        });
      }
      this.fileContents[key] = payload;
      this.originalContents[key] = payload;
      this.modifiedFiles[key] = false;

      if (pluginName !== "__PENDING__" && isRhaiScript(filename) && this.modifiedCanvas[key]) {
        await this.saveCanvasSidecar(pluginName, filename);
      } else if (pluginName === "__PENDING__") {
        const metadata = this.canvasContents[key];
        if (metadata) {
          const serialized = JSON.stringify(metadata);
          this.originalCanvasContents[key] = serialized;
        }
        this.modifiedCanvas[key] = false;
      }
    } catch (err) {
      console.error("Failed to save file:", err);
    }
  }

  /**
   * Discards in-memory edits for a file, reverting cached content to the
   * last-loaded original and clearing its dirty flags. Backs the "Don't Save"
   * choice so a previously modified document is genuinely no longer modified
   * even when its tab stays open (e.g. a graceful-exit prompt whose actual
   * window close is intercepted or no-ops). Also cancels any pending debounced
   * canvas sidecar write so discarded layout changes can't persist afterward.
   *
   * @param pluginName Owning plugin of the file.
   * @param filename File whose edits should be thrown out.
   */
  discardChanges(pluginName: string, filename: string) {
    const key = `${pluginName}:${filename}`;

    const timer = this.canvasSaveTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.canvasSaveTimers.delete(key);
    }

    const original = this.originalContents[key];
    if (original !== undefined) {
      this.fileContents[key] = original;
    }
    this.modifiedFiles[key] = false;

    const originalCanvas = this.originalCanvasContents[key];
    if (originalCanvas !== undefined) {
      this.canvasContents[key] = originalCanvas
        ? (JSON.parse(originalCanvas) as CanvasMetadata)
        : null;
    }
    this.modifiedCanvas[key] = false;
  }

  private getDirtyTabKeys(): string[] {
    const keys = new Set<string>();
    for (const key of Object.keys(this.modifiedFiles)) {
      if (this.modifiedFiles[key]) keys.add(key);
    }
    for (const key of Object.keys(this.modifiedCanvas)) {
      if (this.modifiedCanvas[key]) keys.add(key);
    }
    return [...keys];
  }

  async attemptGracefulExit() {
    const dirtyKeys = this.getDirtyTabKeys();
    if (dirtyKeys.length === 0) {
      return true;
    }

    const files = dirtyKeys.map((k) => {
      const colon = k.indexOf(":");
      return { pluginName: k.slice(0, colon), filename: k.slice(colon + 1) };
    });

    const choice = await this.promptUnsavedChanges(files);
    if (choice === "save") {
      for (const file of files) {
        await this.saveFile(file.pluginName, file.filename);
      }
      return true;
    } else if (choice === "dont_save") {
      // Throw out every dirty file's edits so nothing remains "modified" even if
      // the subsequent window close is intercepted or no-ops.
      for (const file of files) {
        this.discardChanges(file.pluginName, file.filename);
      }
      return true;
    }
    return false; // Cancel
  }

  async performActualClose() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("force_exit_forge");
    } catch (e) {
      window.close();
    }
  }

  setupCloseInterceptor() {
    import("@tauri-apps/api/window")
      .then(async (mod) => {
        if ((window as any)._chaosforge_unlisten_close) {
          (window as any)._chaosforge_unlisten_close();
        }
        const unlisten = await mod.getCurrentWindow().onCloseRequested((event) => {
          event.preventDefault(); // ALWAYS intercept to guarantee we use our reliable backend exit

          const dirtyKeys = this.getDirtyTabKeys();
          if (dirtyKeys.length === 0) {
            this.performActualClose();
            return;
          }
          this.attemptGracefulExit()
            .then(async (canClose) => {
              if (canClose) {
                await this.performActualClose();
              }
            })
            .catch(console.error);
        });
        (window as any)._chaosforge_unlisten_close = unlisten;
      })
      .catch(console.error);
  }

  async promptUnsavedChanges(
    files: { pluginName: string; filename: string }[]
  ): Promise<"save" | "dont_save" | "cancel"> {
    return new Promise((resolve) => {
      this.unsavedPrompt = {
        files,
        resolve: (choice) => {
          this.unsavedPrompt = null;
          resolve(choice);
        },
      };
    });
  }
}

export const workbench = new WorkbenchState();

if (typeof window !== "undefined") {
  (window as any)._chaosforge_state = { workbench };
}
