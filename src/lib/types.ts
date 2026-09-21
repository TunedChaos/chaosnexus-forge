// chaosnexus-forge/src/lib/types.ts

/**
 * Represents a file or directory node within the workspace file tree.
 */
export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
}

/**
 * Metadata definition for a parsed ChaosNexus Anvil plugin.
 * Used to define the schema, manifest data, and load sequence of a plugin.
 */
export interface PluginMetadata {
  name: string;
  version: string;
  author?: string;
  description?: string;
  /** Topological load-order dependencies (other plugin directory names). */
  dependencies?: string[];
  files: FileNode[];
}

/**
 * Represents the in-memory state of an individual file within a plugin.
 * Used to track modifications and unsaved changes in the editor.
 */
export interface PluginFile {
  name: string;
  content: string;
  isModified: boolean;
}

/**
 * Represents an open tab within the dual editor environment.
 * Tracks the target plugin, filename, and the active view mode (e.g., visual graph vs code).
 */
export interface TabState {
  pluginName: string;
  filename: string; // e.g. "plugin.toml" or "lib/db_test_tool.rhai"
  viewMode?: "split" | "code" | "visual" | "preview";
}

/**
 * Represents a connection pin on a visual graph node.
 * Used for defining execution flow or data flow between nodes in a script graph.
 */
export interface NodePin {
  id: string;
  label: string;
  pin_type: "Execution" | "Data";
  data_type?: string;
}

/**
 * Definition of a visual graph node type.
 * Acts as the schema for instantiating concrete nodes in a Rhai execution graph.
 */
export interface NodeDef {
  type_id: string;
  label: string;
  inputs: NodePin[];
  outputs: NodePin[];
  template: string;
}
