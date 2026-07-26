// chaosnexus-forge/src-tauri/src/crucible_supervisor.rs
//! Supervises the ChaosNexus Crucible LLM HTTP process from Forge.
//!
//! Crucible is a separate process so the agent UI can stay up across LLM
//! restarts. Lifecycle mirrors Anvil's engine supervisor (spawn / health / stop)
//! but uses HTTP `/health` instead of a stdin ready marker.

use serde::Serialize;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

/// Event name for Crucible lifecycle status transitions.
pub const EVENT_STATUS: &str = "crucible://status";

/// Payload emitted on `crucible://status`.
#[derive(Clone, Serialize)]
pub struct CrucibleStatusPayload {
    /// One of: `starting`, `running`, `stopping`, `stopped`, `crashed`.
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    /// HTTP base URL when known (e.g. `http://127.0.0.1:8080`).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
}

/// Managed Tauri state for the Crucible child process.
#[derive(Default)]
pub struct CrucibleSupervisor {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    child: Option<Child>,
    port: u16,
    intentional_stop: bool,
}

impl CrucibleSupervisor {
    fn lock_inner(&self) -> Result<std::sync::MutexGuard<'_, Inner>, String> {
        self.inner.lock().map_err(|e| e.to_string())
    }
}

fn emit_status(app: &AppHandle, status: &str, detail: Option<String>, base_url: Option<String>) {
    let _ = app.emit(
        EVENT_STATUS,
        CrucibleStatusPayload {
            status: status.to_string(),
            detail,
            base_url,
        },
    );
}

/// Default Crucible listen port (matches chaosnexus-crucible config default).
pub fn default_port() -> u16 {
    8080
}

/// Ordered candidate paths for the Crucible binary.
pub fn crucible_binary_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();
    let settings = crate::settings::load(app);
    if let Some(bin) = settings.crucible_bin {
        candidates.push(PathBuf::from(bin));
    }
    if let Ok(custom) = std::env::var("CHAOSNEXUS_CRUCIBLE_BIN") {
        candidates.push(PathBuf::from(custom));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for profile in ["debug", "release"] {
                candidates.push(
                    dir.join("../../../chaosnexus-crucible/target")
                        .join(profile)
                        .join("chaosnexus-crucible"),
                );
            }
        }
    }
    candidates.push(PathBuf::from("chaosnexus-crucible"));
    candidates
}

fn base_url_for_port(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}

/// Probe Crucible `/health` until ready or timeout.
fn wait_for_health(port: u16, timeout: Duration) -> Result<(), String> {
    let url = format!("{}/health", base_url_for_port(port));
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|e| e.to_string())?;
    let deadline = std::time::Instant::now() + timeout;
    let mut last_err = String::from("health check not attempted");
    while std::time::Instant::now() < deadline {
        match client.get(&url).send() {
            Ok(res) if res.status().is_success() => return Ok(()),
            Ok(res) => last_err = format!("HTTP {}", res.status()),
            Err(e) => last_err = e.to_string(),
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    Err(format!("Crucible health timed out: {last_err}"))
}

/// Start Crucible if not already running.
#[tauri::command]
pub fn crucible_start(
    app: AppHandle,
    state: tauri::State<CrucibleSupervisor>,
) -> Result<String, String> {
    let settings = crate::settings::load(&app);
    let port = settings.crucible_port.unwrap_or_else(default_port);

    {
        let mut inner = state.lock_inner()?;
        if let Some(child) = inner.child.as_mut() {
            if matches!(child.try_wait(), Ok(None)) {
                // Already running — refresh health.
                if wait_for_health(inner.port, Duration::from_secs(3)).is_ok() {
                    emit_status(
                        &app,
                        "running",
                        None,
                        Some(base_url_for_port(inner.port)),
                    );
                    return Ok("running".to_string());
                }
            }
        }
        inner.child = None;
        inner.port = port;
        inner.intentional_stop = false;
    }

    emit_status(&app, "starting", None, Some(base_url_for_port(port)));

    // If something is already healthy on the port (external Crucible), attach.
    if wait_for_health(port, Duration::from_secs(1)).is_ok() {
        emit_status(&app, "running", Some("attached to existing process".into()), Some(base_url_for_port(port)));
        return Ok("running".to_string());
    }

    let mut last_err = String::from("no chaosnexus-crucible binary candidates found");
    for bin in crucible_binary_candidates(&app) {
        let model_id = settings
            .crucible_model_id
            .clone()
            .unwrap_or_else(|| "TunedChaos/ChaosNexus_Tuned_v1-GGUF".to_string());
        // Prefer candle when a real model is configured; allow explicit stub override.
        let backend = settings
            .crucible_backend
            .clone()
            .unwrap_or_else(|| "candle".to_string());

        let mut command = Command::new(&bin);
        command
            .env("RUST_LOG", "info")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(token) = settings.hf_token.as_deref() {
            if !token.trim().is_empty() {
                command.env("HF_TOKEN", token);
            }
        }

        let home_models = directories::UserDirs::new()
            .map(|u| {
                u.home_dir()
                    .join(".chaosnexus")
                    .join("crucible")
                    .join("models")
            })
            .unwrap_or_else(|| PathBuf::from(".chaosnexus/crucible/models"));
        let _ = std::fs::create_dir_all(&home_models);
        let hf_home = home_models.join(".hf");
        let _ = std::fs::create_dir_all(&hf_home);
        command.env("HF_HOME", &hf_home);

        let config_dir = app
            .path()
            .app_config_dir()
            .map_err(|e| format!("config dir: {e}"))?
            .join("crucible");
        std::fs::create_dir_all(&config_dir)
            .map_err(|e| format!("create crucible config dir: {e}"))?;

        let models_dir = home_models.to_string_lossy().replace('\\', "\\\\");
        let gguf_line = settings
            .crucible_gguf_file
            .as_ref()
            .map(|f| format!("gguf_file = \"{f}\"\n"))
            .unwrap_or_default();
        let config_body = format!(
            "backend = \"{backend}\"\nport = {port}\nmodel_id = \"{model_id}\"\nmodels_dir = \"{models_dir}\"\n{gguf_line}"
        );
        let config_path = config_dir.join("crucible.toml");
        std::fs::write(&config_path, config_body)
            .map_err(|e| format!("write crucible.toml: {e}"))?;
        command.current_dir(&config_dir);

        match command.spawn() {
            Ok(child) => {
                {
                    let mut inner = state.lock_inner()?;
                    inner.child = Some(child);
                    inner.port = port;
                }
                match wait_for_health(port, Duration::from_secs(120)) {
                    Ok(()) => {
                        emit_status(
                            &app,
                            "running",
                            None,
                            Some(base_url_for_port(port)),
                        );
                        return Ok("starting".to_string());
                    }
                    Err(e) => {
                        kill_child_locked(&state);
                        last_err = e;
                    }
                }
            }
            Err(e) => last_err = format!("failed to spawn {:?}: {e}", bin),
        }
    }

    emit_status(&app, "stopped", Some(last_err.clone()), None);
    Err(format!("Crucible start failed. {last_err}"))
}

fn kill_child_locked(state: &tauri::State<CrucibleSupervisor>) {
    if let Ok(mut inner) = state.lock_inner() {
        if let Some(mut child) = inner.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Stop the supervised Crucible process.
#[tauri::command]
pub fn crucible_stop(
    app: AppHandle,
    state: tauri::State<CrucibleSupervisor>,
) -> Result<String, String> {
    {
        let mut inner = state.lock_inner()?;
        inner.intentional_stop = true;
    }
    emit_status(&app, "stopping", None, None);
    kill_child_locked(&state);
    emit_status(&app, "stopped", None, None);
    Ok("stopped".to_string())
}

/// Restart Crucible (stop then start). Used after Anvil MCP config changes.
#[tauri::command]
pub fn crucible_restart(
    app: AppHandle,
    state: tauri::State<CrucibleSupervisor>,
) -> Result<String, String> {
    let _ = crucible_stop(app.clone(), state.clone());
    crucible_start(app, state)
}

/// Current status string plus base URL.
#[tauri::command]
pub fn crucible_status(
    app: AppHandle,
    state: tauri::State<CrucibleSupervisor>,
) -> Result<CrucibleStatusPayload, String> {
    let settings = crate::settings::load(&app);
    let port = {
        let mut inner = state.lock_inner()?;
        if let Some(child) = inner.child.as_mut() {
            match child.try_wait() {
                Ok(None) => {
                    return Ok(CrucibleStatusPayload {
                        status: "running".into(),
                        detail: None,
                        base_url: Some(base_url_for_port(inner.port)),
                    });
                }
                Ok(Some(_)) => {
                    inner.child = None;
                }
                Err(_) => {}
            }
        }
        settings.crucible_port.unwrap_or_else(default_port)
    };

    // External process may still be healthy.
    if wait_for_health(port, Duration::from_millis(500)).is_ok() {
        return Ok(CrucibleStatusPayload {
            status: "running".into(),
            detail: Some("external".into()),
            base_url: Some(base_url_for_port(port)),
        });
    }

    Ok(CrucibleStatusPayload {
        status: "stopped".into(),
        detail: None,
        base_url: Some(base_url_for_port(port)),
    })
}

/// Resolved HTTP base URL for Crucible (settings port).
pub fn crucible_base_url(app: &AppHandle) -> String {
    let settings = crate::settings::load(app);
    let port = settings.crucible_port.unwrap_or_else(default_port);
    base_url_for_port(port)
}
