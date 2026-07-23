// chaosnexus-forge/src/lib/dual_editor/canvas_coverage_targets.ts
//
/**
 * Hard-coded in-scope Rhai scripts for bundled canvas sidecar coverage. Shared
 * by the generate-canvases build script and the Vitest validation matrix.
 * 
 * @module
 */

/**
 * Represents a sidecar document definition mapped to a given Rhai script.
 */
export interface CanvasCoverageTarget {
  /** Repo-relative path to the Rhai source file. */
  rhaiPath: string;
  /** Repo-relative path to the committed sidecar JSON. */
  sidecarPath: string;
}

/** 
 * Bundled scripts that must ship a v3 canvas sidecar. 
 * This ensures that standard plugin examples have accompanying visual illustrations.
 */
export const CANVAS_COVERAGE_TARGETS: CanvasCoverageTarget[] = [
  {
    rhaiPath: "chaosnexus-scripts/plugins/disabled/crash_test/crash_test_tool.rhai",
    sidecarPath:
      "chaosnexus-scripts/plugins/disabled/crash_test/.chaosnexus-forge/crash_test_tool.rhai.canvas.json",
  },

  {
    rhaiPath: "chaosnexus-scripts/plugins/http_ws_example/http_ws_example_tool.rhai",
    sidecarPath:
      "chaosnexus-scripts/plugins/http_ws_example/.chaosnexus-forge/http_ws_example_tool.rhai.canvas.json",
  },
  {
    rhaiPath: "chaosnexus-scripts/plugins/mcp_bridge_demo/mcp_bridge_demo_tool.rhai",
    sidecarPath:
      "chaosnexus-scripts/plugins/mcp_bridge_demo/.chaosnexus-forge/mcp_bridge_demo_tool.rhai.canvas.json",
  },

  {
    rhaiPath: "chaosnexus-scripts/plugins/safe/safe_tool.rhai",
    sidecarPath: "chaosnexus-scripts/plugins/safe/.chaosnexus-forge/safe_tool.rhai.canvas.json",
  },
  {
    rhaiPath: "chaosnexus-scripts/plugins/st/st_tool.rhai",
    sidecarPath: "chaosnexus-scripts/plugins/st/.chaosnexus-forge/st_tool.rhai.canvas.json",
  },
  {
    rhaiPath: "chaosnexus-scripts/plugins/terminal/terminal_tool.rhai",
    sidecarPath: "chaosnexus-scripts/plugins/terminal/.chaosnexus-forge/terminal_tool.rhai.canvas.json",
  },
  {
    rhaiPath: "chaosnexus-scripts/plugins/time/time_tool.rhai",
    sidecarPath: "chaosnexus-scripts/plugins/time/.chaosnexus-forge/time_tool.rhai.canvas.json",
  },
  {
    rhaiPath: "chaosnexus-scripts/plugins/translation_test/translation_test_tool.rhai",
    sidecarPath:
      "chaosnexus-scripts/plugins/translation_test/.chaosnexus-forge/translation_test_tool.rhai.canvas.json",
  },

  {
    rhaiPath: "chaosnexus-scripts/lib/string_utils.rhai",
    sidecarPath: "chaosnexus-scripts/lib/.chaosnexus-forge/string_utils.rhai.canvas.json",
  },
  {
    rhaiPath: "chaosnexus-anvil/plugins/test_plugin/test_plugin_tool.rhai",
    sidecarPath:
      "chaosnexus-anvil/plugins/test_plugin/.chaosnexus-forge/test_plugin_tool.rhai.canvas.json",
  },
];
