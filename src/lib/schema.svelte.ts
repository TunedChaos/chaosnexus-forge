// chaosnexus-forge/src/lib/schema.svelte.ts
//
// Reactive store for the engine SSOT schema (Phase 6c). Surfaces every native
// ChaosNexus Anvil function so the visual canvas can offer a schema-generated node
// palette that materializes wrapper Actuators on drop.

import { invoke } from "@tauri-apps/api/core";

/** A native engine function parameter. */
export interface SchemaParam {
  /** The name of the parameter. */
  name: string;
  /** The type of the parameter. */
  type: string;
  /** An optional description of the parameter. */
  description?: string;
}

/** A native engine function flattened from the SSOT `modules[]` document. */
export interface SchemaFunction {
  /** The name of the function. */
  name: string;
  /** The module this function belongs to. */
  module: string;
  /** The function signature. */
  signature: string;
  /** A description of the function. */
  description: string;
  /** A list of parameters for the function. */
  params: SchemaParam[];
  /** Optional URL to external documentation. */
  docs_url?: string;
}

/** 
 * Parses the SSOT schema JSON into a flat, de-duplicated function list. 
 *
 * @param schemaStr - The raw JSON string of the SSOT schema.
 * @returns An array of parsed and flattened SchemaFunction objects.
 */
export function parseSchemaFunctions(schemaStr: string): SchemaFunction[] {
  if (!schemaStr || !schemaStr.trim()) return [];
  let schema: unknown;
  try {
    schema = JSON.parse(schemaStr);
  } catch {
    return [];
  }

  const modules = (schema as { modules?: Record<string, unknown> }).modules;
  if (!modules || typeof modules !== "object") return [];

  const out: SchemaFunction[] = [];
  const seen = new Set<string>();

  for (const [moduleName, mod] of Object.entries<any>(modules)) {
    const fns = mod?.functions;
    if (!Array.isArray(fns)) continue;
    for (const fn of fns) {
      if (!fn?.name || typeof fn.name !== "string" || fn.name.startsWith("_")) continue;
      if (seen.has(fn.name)) continue;
      seen.add(fn.name);

      const params: SchemaParam[] = Array.isArray(fn.parameters)
        ? fn.parameters.map((p: any) => ({
            name: String(p?.name ?? "arg"),
            type: String(p?.type ?? "Dynamic"),
            description: p?.description ? String(p.description) : undefined,
          }))
        : [];

      out.push({
        name: fn.name,
        module: moduleName,
        signature: fn.signature || `${fn.name}(...)`,
        description: fn.description || "",
        params,
        docs_url: fn.docs_url,
      });
    }
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** 
 * Reactive store managing the loaded SSOT schema functions. 
 */
class SchemaStore {
  functions = $state<SchemaFunction[]>([]);
  loaded = $state(false);

  /**
   * Looks up a schema function by its name.
   *
   * @param name - The name of the function to find.
   * @returns The SchemaFunction if found, otherwise undefined.
   */
  byName(name: string): SchemaFunction | undefined {
    return this.functions.find((f) => f.name === name);
  }

  /** 
   * Loads the engine schema once; self-heals via sync when persisted is empty.
   * 
   * @returns A Promise that resolves when the schema is loaded or fails gracefully.
   */
  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      let raw = (await invoke("load_engine_schema")) as string;
      let fns = parseSchemaFunctions(raw);
      if (fns.length === 0) {
        try {
          raw = (await invoke("sync_engine_schema")) as string;
          fns = parseSchemaFunctions(raw);
        } catch {
          // Non-fatal: keep an empty palette when no engine binary is present.
        }
      }
      this.functions = fns;
      this.loaded = true;
    } catch (e) {
      console.error("[schema] failed to load engine schema", e);
      this.loaded = true;
    }
  }
}

/** Singleton instance of the SchemaStore for global access. */
export const engineSchema = new SchemaStore();
