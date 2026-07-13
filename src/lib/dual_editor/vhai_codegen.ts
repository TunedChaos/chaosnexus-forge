import type { Node, Edge } from "@xyflow/svelte";
import type { CatalogNodeDef } from "./node_catalog";
import { NODE_CATALOG } from "./node_catalog";

/**
 * Traverses a Vhai visual graph and emits valid Rhai structural source code.
 */
export function generateRhaiFromCanvas(
  nodes: Node[],
  edges: Edge[],
  registry: CatalogNodeDef[] = NODE_CATALOG
): string {
  let output = "";
  
  // 1. Identify all 'event' nodes (the entry points for functions).
  const events = nodes.filter((n) => (n.data as any).kind === "event");
  
  for (const ev of events) {
    const fnName = (ev.data as any).eventId || "on_plugin_start";
    output += `// --- [NODE: ${fnName}] ---\n`;
    output += `fn ${fnName}() {\n`;
    output += traverseExec(ev.id, "then", nodes, edges, registry, 1);
    output += `}\n\n`;
  }
  
  return output.trim() + "\n";
}

function indent(level: number): string {
  return "    ".repeat(level);
}

function getNextExecNode(sourceId: string, sourceHandle: string, edges: Edge[]): string | undefined {
  const edge = edges.find(
    (e) => e.source === sourceId && e.sourceHandle === sourceHandle && e.type === "execEdge"
  );
  return edge ? edge.target : undefined;
}

function traverseExec(
  nodeId: string,
  execHandle: string,
  nodes: Node[],
  edges: Edge[],
  registry: CatalogNodeDef[],
  level: number
): string {
  let currentId = getNextExecNode(nodeId, execHandle, edges);
  let code = "";
  
  while (currentId) {
    const node = nodes.find((n) => n.id === currentId);
    if (!node) break;
    
    const data = node.data as any;
    const kind = data.kind;
    
    if (kind === "branch") {
      const cond = data.condition || "true";
      code += `${indent(level)}if ${cond} {\n`;
      code += traverseExec(currentId, "true", nodes, edges, registry, level + 1);
      code += `${indent(level)}} else {\n`;
      code += traverseExec(currentId, "false", nodes, edges, registry, level + 1);
      code += `${indent(level)}}\n`;
      // Branch splits flow, assume it doesn't rejoin sequentially for simple codegen
      break;
    } else if (kind === "while") {
      const cond = data.condition || "true";
      code += `${indent(level)}while ${cond} {\n`;
      code += traverseExec(currentId, "body", nodes, edges, registry, level + 1);
      code += `${indent(level)}}\n`;
      currentId = getNextExecNode(currentId, "completed", edges);
    } else if (kind === "loop") {
      code += `${indent(level)}loop {\n`;
      code += traverseExec(currentId, "body", nodes, edges, registry, level + 1);
      code += `${indent(level)}}\n`;
      currentId = getNextExecNode(currentId, "completed", edges);
    } else if (kind === "log_info") {
      code += `${indent(level)}log_info("Node executed");\n`;
      currentId = getNextExecNode(currentId, "exec_out", edges);
    } else {
      // Fallback for native functions or unknown
      const fnName = data.fn || kind || "unknown_call";
      code += `${indent(level)}${fnName}();\n`;
      currentId = getNextExecNode(currentId, "exec_out", edges);
    }
  }
  
  return code;
}
