// chaosnexus-forge/src/lib/dual_editor/edge_visuals.test.ts

/**
 * @module
 * @description Unit tests for canvas edge visual styling logic, including
 * data-type inheritance, error coloring (cyclic edges), and width adjustments.
 */
import { describe, expect, it } from "vitest";
import { buildEdgeStyle, edgeColorCssVar, sourceDataTypeFor } from "./edge_visuals";

describe("edge_visuals sourceDataTypeFor", () => {
  const pins = [
    { id: "exec_in", pinKind: "exec" },
    { id: "exec_out", pinKind: "exec" },
    { id: "return", pinKind: "data", dataType: "array" },
  ];

  it("returns the data type of a matching data pin", () => {
    expect(sourceDataTypeFor(pins, "return")).toBe("array");
  });

  it("ignores exec pins (no payload type)", () => {
    expect(sourceDataTypeFor(pins, "exec_out")).toBeUndefined();
  });

  it("is undefined when the handle or pin set is missing", () => {
    expect(sourceDataTypeFor(pins, undefined)).toBeUndefined();
    expect(sourceDataTypeFor(undefined, "return")).toBeUndefined();
    expect(sourceDataTypeFor(pins, "nope")).toBeUndefined();
  });
});

describe("edge_visuals edgeColorCssVar", () => {
  it("colors exec wires with the exec token regardless of type", () => {
    expect(edgeColorCssVar({ isExec: true })).toBe("var(--pin-exec)");
  });

  it("colors cyclic data wires with the error token", () => {
    expect(edgeColorCssVar({ isExec: false, isCyclic: true })).toContain("--color-error");
  });

  it("derives a typed color from the per-node source data type", () => {
    expect(edgeColorCssVar({ isExec: false, sourceDataType: "array" })).toBe("var(--pin-array)");
    expect(edgeColorCssVar({ isExec: false, sourceDataType: "object" })).toBe("var(--pin-object)");
  });

  it("falls back to the catalog pin role when no explicit type is given", () => {
    // make-array's `return` pin is typed array in the catalog.
    expect(
      edgeColorCssVar({ isExec: false, sourceKind: "make-array", sourceHandle: "return" })
    ).toBe("var(--pin-array)");
  });

  it("a typed source overrides a generic catalog default", () => {
    // Script `return` defaults to generic in the catalog; the explicit type wins.
    expect(
      edgeColorCssVar({
        isExec: false,
        sourceKind: "script",
        sourceHandle: "return",
        sourceDataType: "array",
      })
    ).toBe("var(--pin-array)");
  });
});

describe("edge_visuals buildEdgeStyle", () => {
  it("emits the typed color and a dashed pattern for data wires", () => {
    const style = buildEdgeStyle({ isExec: false, sourceDataType: "array" });
    expect(style).toContain("--cf-edge-color: var(--pin-array)");
    expect(style).toContain("stroke-dasharray");
  });

  it("emits a solid exec wire with the exec token", () => {
    const style = buildEdgeStyle({ isExec: true });
    expect(style).toContain("--cf-edge-color: var(--pin-exec)");
    expect(style).not.toContain("stroke-dasharray");
  });
});
