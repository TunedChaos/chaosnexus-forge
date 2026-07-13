/**
 * @file console_io.ts
 * @description Clipboard and file-export helpers for the live engine console.
 * Kept framework-agnostic (pure functions + DOM side effects) so they can be unit tested
 * and reused by any log-surfacing view (e.g., Engine Console, Trace Explorer).
 */

// chaosnexus-forge/src/lib/console_io.ts

/** Minimal shape of a console log line needed for plain-text rendering. */
export interface ConsoleLogLine {
  level: string;
  plugin: string;
  message: string;
  time: string;
}

/**
 * Renders a single log entry as a plain-text line: `[time] [plugin] message`.
 * This is the canonical copy/export format so copied lines match what the user
 * sees on screen (minus color), making them safe to paste into tickets/search.
 */
export function formatLogLine(log: ConsoleLogLine): string {
  return `[${log.time}] [${log.plugin}] ${log.message}`;
}

/** Renders an ordered list of log entries as a newline-joined plain-text block. */
export function formatLogLines(logs: ConsoleLogLine[]): string {
  return logs.map(formatLogLine).join("\n");
}

/**
 * Builds a timestamped, filesystem-safe export filename, e.g.
 * `chaos-console-20260629-142530.log`. The timestamp is derived from `date`
 * (defaults to now) using local time so it matches the user's wall clock.
 */
export function consoleExportFilename(date: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `chaos-console-${stamp}.log`;
}

/**
 * Copies `text` to the clipboard, preferring the async Clipboard API and
 * falling back to a transient `<textarea>` + `execCommand("copy")` for webview
 * contexts where the async API is unavailable or permission-gated. Returns
 * `true` on success so callers can surface feedback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path below.
    }
  }

  if (typeof document === "undefined") return false;

  // Legacy fallback: a hidden, off-screen textarea we can select + copy.
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

/**
 * Triggers a client-side download of `text` as `filename` via a transient
 * object-URL anchor. Works inside the Tauri webview without a native save
 * dialog dependency. Returns `false` when no DOM is available (SSR).
 */
export function downloadText(filename: string, text: string): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined") return false;

  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke on the next tick so the click has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}
