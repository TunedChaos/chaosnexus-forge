// chaosnexus-forge/src-tauri/src/engine_supervisor.rs
//
// Live ChaosNexus Anvil engine supervisor.
//
// ChaosNexus Forge spawns ChaosNexus Anvil in `--supervised` mode (see chaosnexus-anvil's
// main.rs) as a long-lived child process. That mode boots the plugin runtime,
// streams structured log lines to stderr, prints a `CHAOSFORGE_READY` marker on
// stdout when ready, and accepts `reload` / `stop` commands on stdin.
//
// This module owns the child process handle and two reader threads that forward
// the child's output to the webview as Tauri events:
//   * `engine://log`    - one line per log entry (`EngineLogLine`)
//   * `engine://status` - lifecycle transitions (`EngineStatusPayload`)
//   * `engine://cvars`  - the live CVar snapshot (`Vec<EngineCvar>`)
//   * `engine://traces` - the MCP trace ring buffer (`Vec<EngineTraceSpan>`)
//
// The engine runs without the MCP stdio transport, so reloading plugins is a
// real in-process reload (no Forge restart) driven by a single stdin command.
// CVars are read/written through the same stdin/stdout channel: ChaosNexus Forge sends
// `cvars` / `setcvar` / `savecvars` and the engine replies with a
// `CHAOSFORGE_CVARS\t<json>` snapshot line that becomes the `engine://cvars`
// event powering the CVar Controller.

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStderr, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Event name carrying a single streamed log line.
pub const EVENT_LOG: &str = "engine://log";
/// Event name carrying engine lifecycle status transitions.
pub const EVENT_STATUS: &str = "engine://status";
/// Event name carrying the engine's current CVar snapshot.
pub const EVENT_CVARS: &str = "engine://cvars";
/// Event name carrying the MCP execution trace ring buffer.
pub const EVENT_TRACES: &str = "engine://traces";

/// Sentinel that the supervised engine prints on stdout when ready.
const READY_MARKER: &str = "CHAOSFORGE_READY";
/// Sentinel prefix for structured stderr log lines (matches chaosnexus-anvil).
const LOG_PREFIX: &str = "CHAOSFORGE_LOG";
/// Sentinel prefix for the stdout CVar snapshot line (matches chaosnexus-anvil).
const CVARS_PREFIX: &str = "CHAOSFORGE_CVARS";
/// Sentinel prefix for the stdout trace snapshot line (matches chaosnexus-anvil).
const TRACES_PREFIX: &str = "CHAOSFORGE_TRACES";

/// A single log line streamed from the engine to the webview. The timestamp is
/// intentionally added on the frontend at receipt time to avoid a date
/// dependency in the Forge backend.
#[derive(Clone, Serialize)]
pub struct EngineLogLine {
    /// Severity level of the log entry (e.g. `"info"`, `"error"`, `"raw"`).
    pub level: String,
    /// Name of the plugin (or `"engine"`) that originated this log line.
    pub plugin: String,
    /// Human-readable log message body.
    pub message: String,
}

/// An engine lifecycle status transition.
#[derive(Clone, Serialize)]
pub struct EngineStatusPayload {
    /// One of: `starting`, `running`, `stopping`, `stopped`, `crashed`.
    pub status: String,
    /// Optional extra detail (e.g. the error message when `status` is `crashed`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

/// A single CVar as reported by the supervised engine. The field names mirror
/// chaosnexus-anvil's `CVar` JSON shape so the snapshot forwards verbatim.
#[derive(Clone, Serialize, Deserialize)]
pub struct EngineCvar {
    /// Name of the plugin that registered this CVar.
    pub plugin_name: String,
    /// CVar key (unique within the owning plugin).
    pub name: String,
    /// Current string-encoded value of the CVar.
    pub value: String,
    /// Human-readable description of what this CVar controls.
    pub description: String,
}

/// A single MCP execution span from the engine trace ring buffer.
#[derive(Clone, Serialize, Deserialize)]
pub struct EngineTraceSpan {
    /// Unique identifier for the full trace (groups related spans).
    pub trace_id: String,
    /// Unique identifier for this individual span within the trace.
    pub span_id: String,
    /// Span ID of the parent span, if this is a child span.
    pub parent_span_id: Option<String>,
    /// Descriptive name of the operation this span represents.
    pub name: String,
    /// MCP connection identifier associated with this span, if applicable.
    pub conn_id: Option<String>,
    /// Zero-based hop index within a multi-hop MCP chain.
    pub hop: u32,
    /// Wall-clock latency of this span in milliseconds.
    pub latency_ms: u64,
    /// Error message captured during span execution, if any.
    pub error: Option<String>,
    /// Human-readable label of the graph node that produced this span.
    pub node_label: Option<String>,
    /// Span kind (e.g. `"tool_call"`, `"plugin"`, `"internal"`).
    pub kind: String,
    /// Unix epoch timestamp (milliseconds) when this span started.
    pub started_at_ms: u64,
}

/// Managed Tauri state holding the live supervised ChaosNexus Anvil child process.
///
/// Shared across Tauri command handlers via `tauri::State<EngineSupervisor>`.
/// The inner mutex serializes access to the child process handle, its stdin
/// pipe, and the intentional-stop flag.
#[derive(Default)]
pub struct EngineSupervisor {
    /// Mutex-guarded interior holding the child process handle and stdin pipe.
    inner: Mutex<Inner>,
}

impl EngineSupervisor {
    /// Helper to cleanly acquire the inner mutex lock.
    fn lock_inner(&self) -> Result<std::sync::MutexGuard<'_, Inner>, String> {
        self.inner.lock().map_err(|e| e.to_string())
    }
}

#[derive(Default)]
struct Inner {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
    /// Shared with the stderr reader so it can distinguish an intentional stop
    /// (`stopped`) from an unexpected exit (`crashed`).
    intentional_stop: Option<Arc<AtomicBool>>,
}

/// Ordered candidate paths for the ChaosNexus Anvil binary. Shared with the schema
/// sync command so binary discovery stays DRY.
///
/// Discovery order: configured `settings.toml` path, `CHAOSWRENCH_BIN` env,
/// sibling debug/release build dirs, then `chaosnexus-anvil` on `PATH`.
pub fn chaoswrench_binary_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    let settings = crate::settings::load(app);
    if let Some(bin) = settings.chaoswrench_bin {
        candidates.push(PathBuf::from(bin));
    }

    if let Ok(custom) = std::env::var("CHAOSWRENCH_BIN") {
        candidates.push(PathBuf::from(custom));
    }

    // Sibling target dirs relative to the Forge executable (dev layout).
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for profile in ["debug", "release"] {
                candidates.push(
                    dir.join("../../../chaosnexus-anvil/target")
                        .join(profile)
                        .join("chaosnexus-anvil"),
                );
            }
        }
    }

    // Fall back to PATH resolution.
    candidates.push(PathBuf::from("chaosnexus-anvil"));
    candidates
}

/// Derives the engine scripts root (the parent of `plugins/`) from a workspace
/// path. ChaosNexus Forge connects to the `plugins/` directory, but ChaosNexus Anvil
/// expects the directory that *contains* `plugins/` and `lib/`. Shared with the
/// MCP registry so workspace-scoped config files (`cvars.toml`,
/// `.chaosnexus-forge/mcp_registry.toml`) resolve to the same root.
pub fn scripts_root_from_project(project_path: &str) -> String {
    let path = Path::new(project_path);
    match path.file_name().and_then(|s| s.to_str()) {
        Some("plugins") => path
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| project_path.to_string()),
        _ => project_path.to_string(),
    }
}

/// Attempts to resolve `chaosnexus-anvil.toml` relative to the selected ChaosNexus Anvil
/// binary location.
///
/// ChaosNexus Forge launches ChaosNexus Anvil in `--supervised` mode with `--scripts-dir`
/// but without `--config`, which means ChaosNexus Anvil uses `./anvil.toml`
/// relative to the current working directory. When ChaosNexus Forge is launched
/// from a different directory, this can cause the instance `name` to be
/// ignored. Searching upward from the binary keeps behavior correct in common
/// repo layouts (e.g. `chaosnexus-anvil/target/*/anvil` -> `chaosnexus-anvil/anvil.toml`).
fn resolve_chaoswrench_config_path_from_binary(bin: &Path) -> Option<PathBuf> {
    let mut dir = bin.parent()?.to_path_buf();
    for _ in 0..=5 {
        let candidate = dir.join("chaosnexus-anvil.toml");
        if candidate.is_file() {
            return Some(candidate);
        }
        dir = dir.parent()?.to_path_buf();
    }
    None
}

/// Emits a status transition to the webview.
fn emit_status(app: &AppHandle, status: &str, detail: Option<String>) {
    let _ = app.emit(
        EVENT_STATUS,
        EngineStatusPayload {
            status: status.to_string(),
            detail,
        },
    );
}

/// Emits a single log line to the webview.
fn emit_log(app: &AppHandle, level: &str, plugin: &str, message: &str) {
    let _ = app.emit(
        EVENT_LOG,
        EngineLogLine {
            level: level.to_string(),
            plugin: plugin.to_string(),
            message: message.to_string(),
        },
    );
}

/// Emits the current CVar snapshot to the webview.
fn emit_cvars(app: &AppHandle, cvars: Vec<EngineCvar>) {
    let _ = app.emit(EVENT_CVARS, cvars);
}

/// Emits the current MCP trace snapshot to the webview.
fn emit_traces(app: &AppHandle, traces: Vec<EngineTraceSpan>) {
    let _ = app.emit(EVENT_TRACES, traces);
}

/// Forwards the child's stdout: the `CHAOSFORGE_READY` marker becomes a
/// `running` status, `CHAOSFORGE_CVARS` lines become an `engine://cvars`
/// snapshot, and everything else is surfaced as an informational log.
fn spawn_stdout_reader(app: AppHandle, stdout: ChildStdout) {
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let cvars_marker = format!("{}\t", CVARS_PREFIX);
        let traces_marker = format!("{}\t", TRACES_PREFIX);
        for line in reader.lines().map_while(Result::ok) {
            // Return-early on the structured CVar snapshot before trimming, as
            // the JSON payload may contain meaningful leading/trailing spaces.
            if let Some(json) = line.strip_prefix(&cvars_marker) {
                match serde_json::from_str::<Vec<EngineCvar>>(json) {
                    Ok(cvars) => emit_cvars(&app, cvars),
                    Err(e) => emit_log(
                        &app,
                        "error",
                        "engine",
                        &format!("Failed to parse CVar snapshot: {}", e),
                    ),
                }
                continue;
            }
            if let Some(json) = line.strip_prefix(&traces_marker) {
                match serde_json::from_str::<Vec<EngineTraceSpan>>(json) {
                    Ok(traces) => emit_traces(&app, traces),
                    Err(e) => emit_log(
                        &app,
                        "error",
                        "engine",
                        &format!("Failed to parse trace snapshot: {}", e),
                    ),
                }
                continue;
            }

            let trimmed = line.trim();
            if trimmed == READY_MARKER {
                emit_status(&app, "running", None);
            } else if !trimmed.is_empty() {
                emit_log(&app, "info", "engine", trimmed);
            }
        }
    });
}

/// Forwards the child's stderr: structured `CHAOSFORGE_LOG` lines are parsed
/// into typed log entries; other lines are surfaced as raw engine output. When
/// the stream closes the process has exited, so a terminal status is emitted.
fn spawn_stderr_reader(app: AppHandle, stderr: ChildStderr, intentional: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
            if let Some(rest) = line.strip_prefix(&format!("{}\t", LOG_PREFIX)) {
                let mut parts = rest.splitn(3, '\t');
                let level = parts.next().unwrap_or("info").to_lowercase();
                let plugin = parts.next().unwrap_or("engine");
                let message = parts.next().unwrap_or("");
                emit_log(&app, &level, plugin, message);
            } else if !line.trim().is_empty() {
                emit_log(&app, "raw", "engine", line.trim());
            }
        }

        // stderr closed => the engine process has exited.
        let status = if intentional.load(Ordering::SeqCst) {
            "stopped"
        } else {
            "crashed"
        };
        emit_status(&app, status, None);
    });
}

/// Starts the supervised ChaosNexus Anvil engine for the given workspace.
///
/// Returns `running` if an engine is already live, otherwise spawns a fresh
/// process and returns `starting`. Status transitions are delivered
/// asynchronously via `engine://status` events.
#[tauri::command]
pub fn engine_start(
    app: AppHandle,
    state: tauri::State<EngineSupervisor>,
    project_path: String,
) -> Result<String, String> {
    let mut inner = state.lock_inner()?;

    // Return-early if a live engine is already running.
    if let Some(child) = inner.child.as_mut() {
        if matches!(child.try_wait(), Ok(None)) {
            return Ok("running".to_string());
        }
    }
    // Clear any exited handle before respawning.
    inner.child = None;
    inner.stdin = None;

    let scripts_root = scripts_root_from_project(&project_path);
    emit_status(&app, "starting", None);

    let engine_settings = crate::settings::load(&app);
    let mut last_err = String::from("no chaosnexus-anvil binary candidates found");
    for bin in chaoswrench_binary_candidates(&app) {
        let mut command = Command::new(&bin);
        crate::settings::apply_engine_env(&mut command, &engine_settings);
        command
            .arg("--supervised")
            .arg("--scripts-dir")
            .arg(&scripts_root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // If we can locate `chaosnexus-anvil.toml`, explicitly pass it so the
        // instance name and any config-dependent behavior are consistent.
        let config_from_canonical = std::fs::canonicalize(&bin)
            .ok()
            .and_then(|p| resolve_chaoswrench_config_path_from_binary(&p));
        let config_from_raw = resolve_chaoswrench_config_path_from_binary(&bin);
        if let Some(config_path) = config_from_canonical.or(config_from_raw) {
            command.arg("--config").arg(config_path);
        }

        match command.spawn() {
            Ok(mut child) => {
                let stdout = child.stdout.take();
                let stderr = child.stderr.take();
                let stdin = child.stdin.take();
                let intentional = Arc::new(AtomicBool::new(false));

                if let Some(out) = stdout {
                    spawn_stdout_reader(app.clone(), out);
                }
                if let Some(err) = stderr {
                    spawn_stderr_reader(app.clone(), err, intentional.clone());
                }

                inner.child = Some(child);
                inner.stdin = stdin;
                inner.intentional_stop = Some(intentional);
                return Ok("starting".to_string());
            }
            Err(e) => last_err = format!("failed to spawn {:?}: {}", bin, e),
        }
    }

    emit_status(&app, "stopped", Some(last_err.clone()));
    Err(format!("Engine start failed. {}", last_err))
}

/// Stops the supervised engine gracefully (sending `stop` and closing stdin),
/// escalating to a kill if it does not exit promptly.
#[tauri::command]
pub fn engine_stop(
    app: AppHandle,
    state: tauri::State<EngineSupervisor>,
) -> Result<String, String> {
    let mut inner = state.lock_inner()?;

    if let Some(flag) = &inner.intentional_stop {
        flag.store(true, Ordering::SeqCst);
    }
    emit_status(&app, "stopping", None);

    // Graceful: request stop and close stdin so the engine's read loop ends.
    if let Some(mut stdin) = inner.stdin.take() {
        let _ = stdin.write_all(b"stop\n");
        let _ = stdin.flush();
    }

    if let Some(mut child) = inner.child.take() {
        // Wait up to ~1s for a clean exit before escalating to a kill.
        let mut exited = false;
        for _ in 0..20 {
            if matches!(child.try_wait(), Ok(Some(_))) {
                exited = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        if !exited {
            let _ = child.kill();
        }
        let _ = child.wait();
    }

    inner.intentional_stop = None;
    Ok("stopped".to_string())
}

/// Triggers an in-process plugin reload without restarting the engine process.
#[tauri::command]
pub fn engine_reload(
    app: AppHandle,
    state: tauri::State<EngineSupervisor>,
) -> Result<String, String> {
    send_command(&state, "reload").map_err(|e| format!("Reload failed: {}", e))?;

    emit_log(&app, "info", "engine", "Reload requested by ChaosNexus Forge");
    Ok("reloading".to_string())
}

/// Returns the current engine status (`running` or `stopped`), reaping any
/// exited child handle as a side effect.
#[tauri::command]
pub fn engine_status(state: tauri::State<EngineSupervisor>) -> Result<String, String> {
    let mut inner = state.lock_inner()?;

    let running = match inner.child.as_mut() {
        Some(child) => matches!(child.try_wait(), Ok(None)),
        None => false,
    };

    if !running {
        inner.child = None;
        inner.stdin = None;
    }

    Ok(if running { "running" } else { "stopped" }.to_string())
}

/// Sends a single tab-delimited command line to the supervised engine's stdin.
/// Shared by the CVar commands so the stdin write/flush stays DRY.
fn send_command(state: &tauri::State<EngineSupervisor>, command: &str) -> Result<(), String> {
    let mut inner = state.lock_inner()?;
    let Some(stdin) = inner.stdin.as_mut() else {
        return Err("Engine is not running".to_string());
    };
    stdin
        .write_all(format!("{}\n", command).as_bytes())
        .map_err(|e| e.to_string())?;
    stdin
        .flush()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Requests a fresh CVar snapshot. The result arrives asynchronously via the
/// `engine://cvars` event.
#[tauri::command]
pub fn engine_cvars_list(state: tauri::State<EngineSupervisor>) -> Result<(), String> {
    send_command(&state, "cvars")
}

/// Updates a CVar live (firing `on_cvar_changed`). Tabs/newlines in the value
/// are sanitized so they cannot corrupt the tab-delimited command protocol. An
/// updated `engine://cvars` snapshot follows automatically.
#[tauri::command]
pub fn engine_cvars_set(
    state: tauri::State<EngineSupervisor>,
    name: String,
    value: String,
) -> Result<(), String> {
    let safe_value = value.replace(['\t', '\n', '\r'], " ");
    send_command(&state, &format!("setcvar\t{}\t{}", name, safe_value))
}

/// Persists the current CVar values to the workspace launch config
/// (`cvars.toml`) so they survive an engine restart.
#[tauri::command]
pub fn engine_cvars_save(state: tauri::State<EngineSupervisor>) -> Result<(), String> {
    send_command(&state, "savecvars")
}

/// Requests a fresh MCP trace snapshot. The result arrives asynchronously via
/// the `engine://traces` event.
#[tauri::command]
pub fn engine_traces_list(state: tauri::State<EngineSupervisor>) -> Result<(), String> {
    send_command(&state, "traces")
}

/// Attaches to a remote engine's SSE stream and proxies the logs to the frontend.
/// This bypasses the browser's CORS restrictions by running the HTTP request in Rust.
#[tauri::command]
pub async fn engine_attach(
    app: AppHandle,
    port: u16,
    token: String,
) -> Result<(), String> {
    let url = format!("http://127.0.0.1:{}/sse?token={}", port, token);
    
    tauri::async_runtime::spawn(async move {
        let client = reqwest::Client::new();
        match client.get(&url).send().await {
            Ok(res) => {
                emit_log(&app, "info", "system", &format!("Successfully attached to remote engine on port {}.", port));
                emit_status(&app, "attached", None);
                
                let mut buffer = String::new();
                use futures_util::StreamExt;
                let mut stream = res.bytes_stream();
                
                while let Some(chunk_result) = stream.next().await {
                    match chunk_result {
                        Ok(chunk) => {
                            if let Ok(text) = std::str::from_utf8(&chunk) {
                                buffer.push_str(text);
                                while let Some(idx) = buffer.find("\n\n") {
                                    let event_block = buffer[..idx].to_string();
                                    buffer = buffer[idx + 2..].to_string();
                                    
                                    for line in event_block.lines() {
                                        let Some(data_str) = line.strip_prefix("data: ") else {
                                            continue;
                                        };
                                        let Ok(data) = serde_json::from_str::<serde_json::Value>(data_str) else {
                                            continue;
                                        };
                                        if data.get("method").and_then(|v| v.as_str()) != Some("notifications/message") {
                                            continue;
                                        }
                                        let Some(params) = data.get("params") else {
                                            continue;
                                        };

                                        let level = params.get("level").and_then(|v| v.as_str()).unwrap_or("info");
                                        let logger = params.get("logger").and_then(|v| v.as_str()).unwrap_or("unknown");
                                        let log_data = params.get("data").map(|v| {
                                            v.as_str().map(|s| s.to_string()).unwrap_or_else(|| v.to_string())
                                        }).unwrap_or_default();
                                        emit_log(&app, level, logger, &log_data);
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            emit_log(&app, "error", "system", &format!("Stream error reading from remote engine: {}", e));
                            break;
                        }
                    }
                }
                emit_log(&app, "error", "system", &format!("Connection to remote engine on port {} lost or closed.", port));
                emit_status(&app, "stopped", None);
            }
            Err(e) => {
                emit_log(&app, "error", "system", &format!("Connection to remote engine on port {} failed: {}", port, e));
                emit_status(&app, "stopped", None);
            }
        }
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::resolve_chaoswrench_config_path_from_binary;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_root() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("chaosforge_cfg_search_test_{unique}"))
    }

    #[test]
    fn resolves_chaoswrench_toml_within_bounded_depth() {
        let root = make_temp_root();
        fs::create_dir_all(&root).expect("create temp root");

        // Layout (bin is at x6/anvil, config is at x2/anvil.toml)
        // temp/
        //   x0/
        //     x1/
        //       x2/
        //         chaosnexus-anvil.toml
        //         x3/
        //           x4/
        //             x5/
        //               x6/anvil
        let config_dir = root.join("x0").join("x1").join("x2");
        let bin_dir = config_dir
            .join("x3")
            .join("x4")
            .join("x5")
            .join("x6");
        fs::create_dir_all(&bin_dir).expect("create bin_dir");

        let bin_path = bin_dir.join("chaosnexus-anvil");
        fs::write(&bin_path, b"") .expect("create bin file");

        let config_path = config_dir.join("chaosnexus-anvil.toml");
        fs::write(&config_path, b"name = \"Test\"").expect("create config file");

        let resolved = resolve_chaoswrench_config_path_from_binary(&bin_path);
        assert_eq!(resolved, Some(config_path));

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn returns_none_when_config_is_outside_search_depth() {
        let root = make_temp_root();
        fs::create_dir_all(&root).expect("create temp root");

        // Layout:
        // - bin parent at x6
        // - config at x0 (6 levels above bin parent), which should be out of
        //   reach for the 0..=5 bounded upward search.
        let base = root.clone();
        let bin_dir = base
            .join("x0")
            .join("x1")
            .join("x2")
            .join("x3")
            .join("x4")
            .join("x5")
            .join("x6");
        fs::create_dir_all(&bin_dir).expect("create bin_dir");

        let bin_path = bin_dir.join("chaosnexus-anvil");
        fs::write(&bin_path, b"").expect("create bin file");

        let config_path = base.join("x0").join("chaosnexus-anvil.toml");
        fs::create_dir_all(config_path.parent().unwrap()).expect("create config parent");
        fs::write(&config_path, b"name = \"OutOfDepth\"").expect("create config file");

        let resolved = resolve_chaoswrench_config_path_from_binary(&bin_path);
        assert_eq!(resolved, None);

        let _ = fs::remove_dir_all(&root);
    }
}
