/**
 * Secondary Serialization Test Script
 * 
 * @module test-serialize-2
 * @description Follow-up test to `test-serialize.ts` that runs serialization on the
 * previously generated output (`newCode.rhai`) to ensure idempotency.
 */
import { parseRhaiToFlow, serializeFlowToRhai } from "./src/lib/parser.js";
import fs from "fs";

const code = fs.readFileSync("newCode.rhai", "utf-8");
const parsed = parseRhaiToFlow(code, []);
const newCode2 = serializeFlowToRhai(code, parsed.nodes, parsed.edges);
console.log(newCode2 === code);
if (newCode2 !== code) {
  fs.writeFileSync("newCode2.rhai", newCode2);
}
