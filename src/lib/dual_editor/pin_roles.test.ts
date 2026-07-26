// chaosnexus-forge/src/lib/dual_editor/pin_roles.test.ts
import { describe, expect, it } from "vitest";
import { PIN_ROLES, pinRoleFromDataType, type PinRole } from "./pin_roles";

describe("pinRoleFromDataType", () => {
  const cases: Array<[string, PinRole]> = [
    ["bool", "bool"],
    ["Boolean", "bool"],
    ["int", "int"],
    ["i64", "int"],
    ["integer", "int"],
    ["float", "float"],
    ["f32", "float"],
    ["double", "float"],
    ["number", "float"],
    ["string", "string"],
    ["str", "string"],
    ["text", "string"],
    ["json", "object"],
    ["object", "object"],
    ["map", "object"],
    ["struct", "object"],
    ["array", "array"],
    ["vec", "array"],
    ["list", "array"],
  ];

  for (const [input, expected] of cases) {
    it(`maps "${input}" -> ${expected}`, () => {
      expect(pinRoleFromDataType(input)).toBe(expected);
    });
  }

  it("is case- and whitespace-insensitive", () => {
    expect(pinRoleFromDataType("  INT  ")).toBe("int");
  });

  it("falls back to generic for unknown or empty types", () => {
    expect(pinRoleFromDataType("widget")).toBe("generic");
    expect(pinRoleFromDataType("")).toBe("generic");
    expect(pinRoleFromDataType(undefined)).toBe("generic");
    expect(pinRoleFromDataType(null)).toBe("generic");
  });

  it("only ever returns a known role", () => {
    for (const [input] of cases) {
      expect(PIN_ROLES).toContain(pinRoleFromDataType(input));
    }
  });
});
