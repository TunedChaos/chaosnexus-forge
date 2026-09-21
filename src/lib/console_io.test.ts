/**
 * @file console_io.test.ts
 * @description Unit tests for console input/output formatting and exporting utilities.
 */

// chaosnexus-forge/src/lib/console_io.test.ts

import { describe, it, expect } from "vitest";
import {
  type ConsoleLogLine,
  formatLogLine,
  formatLogLines,
  consoleExportFilename,
} from "./console_io";

const line = (over: Partial<ConsoleLogLine> = {}): ConsoleLogLine => ({
  level: "info",
  plugin: "engine",
  message: "ready",
  time: "09:24:01",
  ...over,
});

describe("formatLogLine", () => {
  it("renders the [time] [plugin] message shape", () => {
    expect(formatLogLine(line())).toBe("[09:24:01] [engine] ready");
  });

  it("preserves the raw message including punctuation", () => {
    const err = line({ level: "error", plugin: "github", message: "RecursionLimitExceeded: 6 > 5" });
    expect(formatLogLine(err)).toBe("[09:24:01] [github] RecursionLimitExceeded: 6 > 5");
  });
});

describe("formatLogLines", () => {
  it("joins entries with newlines in order", () => {
    const out = formatLogLines([line({ message: "a" }), line({ message: "b" })]);
    expect(out).toBe("[09:24:01] [engine] a\n[09:24:01] [engine] b");
  });

  it("returns an empty string for no logs", () => {
    expect(formatLogLines([])).toBe("");
  });
});

describe("consoleExportFilename", () => {
  it("builds a zero-padded, timestamped .log filename", () => {
    const date = new Date(2026, 5, 9, 4, 5, 6); // 2026-06-09 04:05:06 local
    expect(consoleExportFilename(date)).toBe("chaos-console-20260609-040506.log");
  });
});
