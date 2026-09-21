/**
 * @file node_catalog.test.ts
 *
 * Tests for the node catalog SSOT.
 */
import { describe, expect, it } from "vitest";
import {
  NODE_CATALOG,
  catalogByKind,
  operatorExpression,
  resolveConnectionWireKind,
  pinKindForHandle,
  EXEC_IN,
} from "./node_catalog";

describe("node_catalog", () => {
  it("has unique kinds and flow types", () => {
    const kinds = NODE_CATALOG.map((d) => d.kind);
    const flowTypes = NODE_CATALOG.map((d) => d.flowType);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(new Set(flowTypes).size).toBe(flowTypes.length);
  });

  it("resolves branch catalog entry with exec pins", () => {
    const branch = catalogByKind("branch");
    expect(branch).toBeDefined();
    expect(branch?.pins.some((p) => p.pinKind === "exec")).toBe(true);
    expect(branch?.pins.some((p) => p.id === "condition")).toBe(true);
  });

  it("operatorExpression returns Rhai micro-AST templates", () => {
    expect(operatorExpression("add")).toBe("a + b");
    expect(operatorExpression("not")).toBe("!a");
  });

  it("resolveConnectionWireKind detects exec vs data", () => {
    expect(resolveConnectionWireKind("event", "then", "branch", EXEC_IN)).toBe("exec");
    expect(resolveConnectionWireKind("literal", "value", "branch", "condition")).toBe("data");
    expect(pinKindForHandle("branch", EXEC_IN)).toBe("exec");
  });
});
