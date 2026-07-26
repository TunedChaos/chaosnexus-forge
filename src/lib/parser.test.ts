// chaosnexus-forge/src/lib/parser.test.ts

import { describe, test, expect } from "vitest";
import {
  parseRhaiToFlow,
  buildCanvasMetadata,
  serializeFlowToRhai,
  stripCanvasMetadata,
  extractEmbeddedCanvasMetadata,
  getNodeCode,
  updateNodeCode,
} from "./parser";
import type { Node, Edge } from "@xyflow/svelte";

describe("Rhai Visual Sync Parser & Serializer", () => {
  test("returns empty graph for files with no node anchors", () => {
    const { nodes, edges } = parseRhaiToFlow("// hello\nlet x = 1;");
    expect(nodes).toHaveLength(0);
    expect(edges).toHaveLength(0);
  });

  test("parses nodes with no metadata block and synthesizes main_group", () => {
    const code = `
      fn test() {
        // --- [NODE: Start] ---
        let a = 1;
        // --- [NODE: Process] ---
        let b = 2;
      }
    `;

    const { nodes, edges } = parseRhaiToFlow(code);
    expect(nodes).toHaveLength(3);
    expect(nodes[0].id).toBe("main_group");
    expect(nodes[1].data.label).toBe("Start");
    expect(nodes[2].data.label).toBe("Process");
    expect(edges).toHaveLength(0);
    expect(nodes[1].position.x).toBe(100);
    expect(nodes[2].position.y).toBe(200);
  });

  test("parses nodes and edges from external canvas metadata", () => {
    const code = `
      // --- [NODE: Start] ---
      // --- [NODE: Process] ---
    `;
    const canvas = {
      nodes: [
        { id: "node_start", label: "Start", x: 150, y: 200 },
        { id: "node_process", label: "Process", x: 400, y: 350 },
      ],
      edges: [{ id: "e1", source: "node_start", target: "node_process" }],
    };

    const { nodes, edges } = parseRhaiToFlow(code, [], canvas);
    expect(nodes).toHaveLength(3);
    expect(nodes[1].id).toBe("node_start");
    expect(nodes[1].position.x).toBe(150);
    expect(nodes[2].id).toBe("node_process");
    expect(nodes[2].position.y).toBe(350);
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe("e1");
  });

  test("filters out deleted nodes and dangling edges", () => {
    const code = `// --- [NODE: Start] ---`;
    const canvas = {
      nodes: [
        { id: "node_start", label: "Start", x: 150, y: 200 },
        { id: "node_process", label: "Process", x: 400, y: 350 },
      ],
      edges: [{ id: "e1", source: "node_start", target: "node_process" }],
    };

    const { nodes, edges } = parseRhaiToFlow(code, [], canvas);
    expect(nodes).toHaveLength(2);
    expect(nodes[1].id).toBe("node_start");
    expect(edges).toHaveLength(0);
  });

  test("restores exec wires for canvas-only v3 catalog nodes", () => {
    const code = "// Vhai demo\n";
    const canvas = {
      version: 3,
      nodes: [
        { id: "evt1", label: "Event", x: 0, y: 0, kind: "event" },
        { id: "set1", label: "Set", x: 0, y: 100, kind: "set-variable" },
      ],
      edges: [
        {
          id: "exec1",
          source: "evt1",
          target: "set1",
          sourceHandle: "then",
          targetHandle: "exec_in",
          kind: "exec" as const,
        },
      ],
    };

    const { edges } = parseRhaiToFlow(code, [], canvas);
    expect(edges).toHaveLength(1);
    expect(edges[0].type).toBe("execEdge");
    expect(edges[0].targetHandle).toBe("exec_in");
  });

  test("buildCanvasMetadata serializes graph layout", () => {
    const nodes: Node[] = [
      { id: "n1", type: "default", position: { x: 50, y: 80 }, data: { label: "Start" } },
    ];
    const edges: Edge[] = [];

    const metadata = buildCanvasMetadata(nodes, edges);
    expect(metadata.nodes[0].id).toBe("n1");
    expect(metadata.nodes[0].x).toBe(50);
    expect(metadata.edges).toHaveLength(0);
  });

  test("stripCanvasMetadata removes embedded legacy blocks", () => {
    const code = `
      // --- [NODE: Start] ---
      // #region CANVAS_METADATA
      // --- [CANVAS_METADATA: {"nodes":[],"edges":[]} ] ---
      // #endregion
    `;
    const stripped = stripCanvasMetadata(code);
    expect(stripped).not.toContain("CANVAS_METADATA");
    expect(stripped).toContain("[NODE: Start]");
  });

  test("extractEmbeddedCanvasMetadata reads legacy JSON", () => {
    const code = `// --- [CANVAS_METADATA: {"nodes":[{"id":"n1","label":"A","x":0,"y":0}],"edges":[]} ] ---`;
    const meta = extractEmbeddedCanvasMetadata(code);
    expect(meta?.nodes[0].id).toBe("n1");
  });

  test("serializeFlowToRhai strips legacy metadata without re-embedding", () => {
    const code = `// --- [NODE: Start] ---\n// --- [CANVAS_METADATA: {"nodes":[],"edges":[]} ] ---`;
    const result = serializeFlowToRhai(code, [], []);
    expect(result).not.toContain("CANVAS_METADATA");
    expect(result).toContain("[NODE: Start]");
  });

  test("getNodeCode extracts code block correctly", () => {
    const code = `
      // --- [NODE: Start] ---
      let x = 10;
      print(x);
      
      // --- [NODE: End] ---
      let y = 20;
    `;
    expect(getNodeCode(code, "Start")).toBe("let x = 10;\n      print(x);");
    expect(getNodeCode(code, "End")).toBe("let y = 20;");
    expect(getNodeCode(code, "Nonexistent")).toBe("");
  });

  test("updateNodeCode replaces code block correctly", () => {
    const code = `
      // --- [NODE: Start] ---
      let x = 10;
      print(x);
      
      // --- [NODE: End] ---
      let y = 20;
    `;
    const updated = updateNodeCode(code, "Start", "let updated_x = 999;");
    expect(updated).toContain("let updated_x = 999;");
    expect(updated).not.toContain("let x = 10;");
  });
});
