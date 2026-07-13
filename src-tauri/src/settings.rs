// chaosnexus-forge/src-tauri/src/settings.rs
//
// Persistent Forge application settings stored under the Tauri app config
// directory (`settings.toml`). Engine binary discovery and supervised spawn
// read these values so Start and schema sync work without env-var hacks.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Manager};

/// User-editable settings persisted to `<app_config_dir>/settings.toml`.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct AppSettings {
    /// Absolute path to the ChaosNexus Anvil executable (highest-priority discovery candidate).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chaoswrench_bin: Option<String>,
    /// Optional `CHAOSWRENCH_VALKEY_URL` passed to the supervised engine child.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub valkey_url: Option<String>,
    /// Optional `CHAOSWRENCH_DEBUG_LOG` file path passed to the supervised engine child.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub debug_log: Option<String>,
}

impl AppSettings {
    /// Normalizes empty strings to `None` so blank form fields do not persist
    /// as `""` values in the TOML file.
    pub fn normalized(mut self) -> Self {
        self.chaoswrench_bin = non_empty(self.chaoswrench_bin);
        self.valkey_url = non_empty(self.valkey_url);
        self.debug_log = non_empty(self.debug_log);
        self
    }
}

/// Converts an `Option<String>` containing only whitespace to `None`.
fn non_empty(value: Option<String>) -> Option<String> {
    value.and_then(|s| {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

/// Resolves `<app_config_dir>/settings.toml`.
pub fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let mut path = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve config directory: {}", e))?;
    path.push("settings.toml");
    Ok(path)
}

/// Loads settings from disk, returning defaults when the file is missing or invalid.
pub fn load(app: &AppHandle) -> AppSettings {
    let path = match settings_path(app) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("[settings] {}", e);
            return AppSettings::default();
        }
    };

    if !path.exists() {
        return AppSettings::default();
    }

    let raw = match fs::read_to_string(&path) {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[settings] Failed to read {:?}: {}", path, e);
            return AppSettings::default();
        }
    };
    match toml::from_str::<AppSettings>(&raw) {
        Ok(settings) => settings.normalized(),
        Err(e) => {
            eprintln!("[settings] Failed to parse {:?}: {}", path, e);
            AppSettings::default()
        }
    }
}

/// Persists settings to disk (creates the config directory when needed).
pub fn save(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    let normalized = settings.clone().normalized();
    let body = toml::to_string_pretty(&normalized)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&path, body).map_err(|e| format!("Failed to write settings: {}", e))?;
    Ok(())
}

/// Applies optional engine environment variables from [`AppSettings`] to a
/// child [`Command`] before spawning the supervised ChaosNexus Anvil process.
///
/// Currently sets `CHAOSWRENCH_VALKEY_URL` and `CHAOSWRENCH_DEBUG_LOG` when
/// the corresponding settings are present.
pub fn apply_engine_env(command: &mut Command, settings: &AppSettings) {
    if let Some(url) = settings.valkey_url.as_deref() {
        command.env("CHAOSWRENCH_VALKEY_URL", url);
    }
    if let Some(path) = settings.debug_log.as_deref() {
        command.env("CHAOSWRENCH_DEBUG_LOG", path);
    }
}

/// Tauri command: returns the current [`AppSettings`] loaded from disk.
#[tauri::command]
pub fn get_app_settings(app: AppHandle) -> AppSettings {
    load(&app)
}

/// Tauri command: persists updated [`AppSettings`] to disk.
#[tauri::command]
pub fn set_app_settings(app: AppHandle, settings: AppSettings) -> Result<(), String> {
    save(&app, &settings)
}

/// Verifies that `path` is a runnable ChaosNexus Anvil binary by invoking
/// `--schema-stdout` (the same probe used by schema sync).
#[tauri::command]
pub fn test_chaoswrench_bin(path: String) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Binary path is empty.".to_string());
    }

    match Command::new(trimmed).arg("--schema-stdout").output() {
        Ok(output) if output.status.success() => {
            let preview = String::from_utf8_lossy(&output.stdout);
            let len = preview.len().min(80);
            Ok(format!(
                "ChaosNexus Anvil responded successfully (schema payload ~{} bytes).",
                len
            ))
        }
        Ok(output) => Err(format!(
            "Binary exited with status {}: {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        )),
        Err(e) => Err(format!("Failed to spawn {:?}: {}", trimmed, e)),
    }
}

/// Opens a native file picker for selecting the ChaosNexus Anvil executable.
#[tauri::command]
pub fn pick_file() -> Option<String> {
    rfd::FileDialog::new()
        .pick_file()
        .and_then(|path| path.to_str().map(|s| s.to_string()))
}
