// chaosnexus-forge/src/lib/dual_editor/pin_roles.ts
//
// Single source of truth mapping a pin's data type (or semantic role) to a
// Vhai-style color role. The role string keys a `--pin-<role>` CSS token
// (see app.css), so both the empty ring and the filled fill resolve their color
// from one place and tests can assert color via the stable `data-pin-role` hook.

/** Color role for a connection pin; maps 1:1 to a `--pin-<role>` CSS token. */
export type PinRole =
  | "bool"
  | "int"
  | "float"
  | "string"
  | "object"
  | "array"
  | "control"
  | "exec"
  | "generic";

/** All roles, exported for exhaustive testing and token validation. */
export const PIN_ROLES: readonly PinRole[] = [
  "bool",
  "int",
  "float",
  "string",
  "object",
  "array",
  "control",
  "exec",
  "generic",
] as const;

/**
 * Normalizes an engine/literal data-type string to a {@link PinRole}. Accepts
 * the literal `valueType` union ("string" | "int" | "float" | "bool" | "json")
 * as well as common engine aliases. Unknown or absent types fall back to
 * `"generic"`.
 *
 * @param dataType - the raw data type (case-insensitive) or undefined.
 * @returns the resolved color role.
 */
export function pinRoleFromDataType(dataType?: string | null): PinRole {
  if (!dataType) return "generic";
  switch (dataType.trim().toLowerCase()) {
    case "bool":
    case "boolean":
      return "bool";
    case "int":
    case "i64":
    case "i32":
    case "integer":
      return "int";
    case "float":
    case "f64":
    case "f32":
    case "double":
    case "number":
      return "float";
    case "string":
    case "str":
    case "text":
      return "string";
    case "json":
    case "object":
    case "map":
    case "struct":
    case "dynamic":
      return "object";
    case "array":
    case "vec":
    case "list":
      return "array";
    default:
      return "generic";
  }
}
