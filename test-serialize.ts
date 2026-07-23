/**
 * Serialization Test Script
 * 
 * @module test-serialize
 * @description Simple test script to verify Rhai-to-Flow and Flow-to-Rhai serialization
 * for the terminal plugin. Checks if the output matches the original source.
 */
import { parseRhaiToFlow, serializeFlowToRhai } from "./src/lib/parser.js";
import fs from "fs";

const code = fs.readFileSync("../chaosnexus-scripts/plugins/terminal/terminal_tool.rhai", "utf-8");
const parsed = parseRhaiToFlow(code, []);
const newCode = serializeFlowToRhai(code, parsed.nodes, parsed.edges);
console.log(newCode === code);
if (newCode !== code) {
  fs.writeFileSync("newCode.rhai", newCode);
}
