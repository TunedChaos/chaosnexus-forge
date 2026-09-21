// chaosnexus-forge/src/lib/dual_editor/canvas_coverage_targets.ts
//
/**
 * Hard-coded in-scope Rhai scripts for bundled canvas sidecar coverage. Shared
 * by the generate-canvases build script and the Vitest validation matrix.
 *
 * Public Suite / Scripts polyrepo only ships `translation_test`. Terminal lives
 * under Forge fixtures for canvas parity E2E (not published to adopters).
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
    rhaiPath: "chaosnexus-scripts/plugins/translation_test/translation_test_tool.rhai",
    sidecarPath:
      "chaosnexus-scripts/plugins/translation_test/.chaosnexus-forge/translation_test_tool.rhai.canvas.json",
  },
  {
    rhaiPath: "chaosnexus-forge/fixtures/scripts/plugins/terminal/terminal_tool.rhai",
    sidecarPath:
      "chaosnexus-forge/fixtures/scripts/plugins/terminal/.chaosnexus-forge/terminal_tool.rhai.canvas.json",
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
