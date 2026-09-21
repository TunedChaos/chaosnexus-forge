// chaosnexus-forge/src-tauri/src/pending_plugins.rs
//
// Tauri commands for quarantined plugin approval (HITL gate).

use std::path::Path;

use crate::engine_supervisor::scripts_root_from_project;
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, mpsc};
use tauri::{AppHandle, Emitter, Manager, State};

/// Managed Tauri state holding the active filesystem watcher for the pending
/// plugins quarantine directory. Dropping the inner watcher automatically
/// stops monitoring.
#[derive(Default)]
pub struct PendingWatcherState {
    /// The active [`notify::RecommendedWatcher`], if any. Set to `None` when
    /// no workspace is being watched.
    pub watcher: Mutex<Option<RecommendedWatcher>>,
}

/// Summary of a quarantined plugin awaiting human approval.
///
/// Displayed in the ChaosNexus Forge review sidebar so the operator can inspect
/// capabilities before promoting or rejecting the plugin.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingPluginSummary {
    /// Directory name of the pending plugin.
    pub name: String,
    /// Name of the MCP tool the plugin intends to register.
    pub tool_name: String,
    /// Human-readable description of what the plugin does.
    pub description: String,
    /// Capability labels the plugin requests (e.g. `"net"`, `"fs"`).
    pub requested_capabilities: Vec<String>,
    /// ISO-8601 timestamp of when the plugin was quarantined.
    pub created_at: String,
}

/// Full pending plugin payload returned to the review UI.
///
/// Extends [`PendingPluginSummary`] with the actual source artifacts so the
/// operator can audit the Rhai script and plugin manifest before approval.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingPluginDetail {
    /// Metadata summary for this pending plugin.
    pub summary: PendingPluginSummary,
    /// Raw Rhai source code of the plugin's primary script.
    pub rhai_source: String,
    /// Raw `plugin.toml` manifest content.
    pub plugin_toml: String,
    /// JSON-encoded canvas layout sidecar generated from the Rhai AST.
    pub canvas_sidecar: String,
}

/// Resolves the `.pending/` quarantine directory for the given workspace.
fn pending_root(project_path: &str) -> PathBuf {
    PathBuf::from(scripts_root_from_project(project_path)).join(".pending")
}

/// Reads and parses the `pending_manifest.toml` from a quarantined plugin directory.
fn read_manifest(dir: &Path) -> Result<chaosnexus_anvil::scripting::scaffold::PendingManifest, String> {
    let path = dir.join(chaosnexus_anvil::scripting::scaffold::PENDING_MANIFEST);
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read pending manifest: {e}"))?;
    toml::from_str(&content).map_err(|e| format!("Failed to parse pending manifest: {e}"))
}

/// Lists all quarantined plugins in the workspace's `.pending/` directory.
///
/// Returns an alphabetically sorted list of summaries. Missing or unreadable
/// entries are silently skipped so the UI always gets a valid response.
#[tauri::command]
pub fn list_pending_plugins(project_path: &str) -> Result<Vec<PendingPluginSummary>, String> {
    let root = pending_root(project_path);
    if !root.is_dir() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(&root).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Ok(manifest) = read_manifest(&path) else { continue; };
        out.push(PendingPluginSummary {
            name: manifest.plugin_name,
            tool_name: manifest.tool_name,
            description: manifest.description,
            requested_capabilities: manifest.requested_capabilities,
            created_at: manifest.created_at,
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// Reads the full review payload for a single quarantined plugin.
///
/// Includes the Rhai source, `plugin.toml` content, and an auto-generated
/// canvas layout sidecar so the operator can review the plugin's behaviour
/// before approving or rejecting it.
#[tauri::command]
pub fn read_pending_plugin(
    project_path: &str,
    plugin_name: &str,
) -> Result<PendingPluginDetail, String> {
    chaosnexus_anvil::scripting::scaffold::validate_plugin_name(plugin_name)?;
    let dir = pending_root(project_path).join(plugin_name);
    if !dir.is_dir() {
        return Err(format!("Pending plugin '{plugin_name}' not found."));
    }
    let manifest = read_manifest(&dir)?;
    let script_path = dir.join(format!("{plugin_name}_tool.rhai"));
    let rhai_source =
        fs::read_to_string(&script_path).map_err(|e| format!("Failed to read Rhai source: {e}"))?;
    let plugin_toml = fs::read_to_string(dir.join("plugin.toml"))
        .map_err(|e| format!("Failed to read plugin.toml: {e}"))?;

    let sidecar_path = dir.join(".chaosnexus-forge").join(format!("{plugin_name}_tool.rhai.canvas.json"));
    let canvas_sidecar = if sidecar_path.exists() {
        fs::read_to_string(&sidecar_path).unwrap_or_else(|_| "{}".to_string())
    } else {
        let canvas_doc = crate::visualizer::generate_visual_canvas(&rhai_source);
        serde_json::to_string(&canvas_doc).unwrap_or_else(|_| "{}".to_string())
    };

    Ok(PendingPluginDetail {
        summary: PendingPluginSummary {
            name: manifest.plugin_name,
            tool_name: manifest.tool_name,
            description: manifest.description,
            requested_capabilities: manifest.requested_capabilities,
            created_at: manifest.created_at,
        },
        rhai_source,
        plugin_toml,
        canvas_sidecar,
    })
}

/// Writes a status event JSON to the `.chaoswrench_data/events/` directory so
/// the running engine can detect approval/rejection side-effects.
fn write_plugin_event(project_path: &str, plugin_name: &str, status: &str) {
    let events_dir = PathBuf::from(scripts_root_from_project(project_path))
        .join(".chaoswrench_data")
        .join("events");
    if !events_dir.exists() {
        let _ = fs::create_dir_all(&events_dir);
    }
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let file_path = events_dir.join(format!("event_{}.json", timestamp));
    let payload = serde_json::json!({
        "type": "plugin_status",
        "plugin_name": plugin_name,
        "status": status,
    });
    let _ = fs::write(
        file_path,
        serde_json::to_string(&payload).unwrap_or_default(),
    );
}

/// Approves a quarantined plugin: promotes it to the live `plugins/` directory
/// with the granted capabilities and environment allowlist, writes an approval
/// event, and triggers an engine reload so the new plugin is picked up.
#[tauri::command]
pub fn approve_pending_plugin(
    app: tauri::AppHandle,
    project_path: &str,
    plugin_name: &str,
    granted_capabilities: Vec<String>,
    env_allowlist: Vec<String>,
) -> Result<String, String> {
    chaosnexus_anvil::scripting::paths::init(scripts_root_from_project(project_path));
    chaosnexus_anvil::scripting::scaffold::promote_pending_plugin(
        plugin_name,
        &granted_capabilities,
        &env_allowlist,
    )?;

    write_plugin_event(project_path, plugin_name, "approved");

    let app_handle = app.clone();
    let state = app_handle.state::<crate::engine_supervisor::EngineSupervisor>();
    let _ = crate::engine_supervisor::engine_reload(app, state);

    Ok(format!(
        "Approved and promoted plugin '{plugin_name}'. Engine reload requested."
    ))
}

/// Rejects a quarantined plugin, removing it from the `.pending/` directory
/// and writing a rejection event.
#[tauri::command]
pub fn reject_pending_plugin(project_path: &str, plugin_name: &str) -> Result<(), String> {
    chaosnexus_anvil::scripting::paths::init(scripts_root_from_project(project_path));
    chaosnexus_anvil::scripting::scaffold::reject_pending_plugin(plugin_name)?;
    write_plugin_event(project_path, plugin_name, "rejected");
    Ok(())
}

/// Updates the Rhai source code of a quarantined plugin in-place.
#[tauri::command]
pub fn update_pending_plugin(
    project_path: &str,
    plugin_name: &str,
    new_source: &str,
    canvas_sidecar: Option<String>,
) -> Result<(), String> {
    let target_dir = pending_root(project_path).join(plugin_name);
    let script_path = target_dir.join(format!("{plugin_name}_tool.rhai"));
    std::fs::write(&script_path, new_source).map_err(|e| format!("Failed to update pending plugin: {}", e))?;
    
    if let Some(canvas_str) = canvas_sidecar {
        let chaosforge_dir = target_dir.join(".chaosnexus-forge");
        std::fs::create_dir_all(&chaosforge_dir).map_err(|e| format!("Failed to create .chaosnexus-forge dir: {}", e))?;
        let sidecar_path = chaosforge_dir.join(format!("{plugin_name}_tool.rhai.canvas.json"));
        std::fs::write(&sidecar_path, canvas_str).map_err(|e| format!("Failed to write pending canvas sidecar: {}", e))?;
    }
    
    Ok(())
}

/// Starts watching the workspace's `.pending/` directory for filesystem
/// changes. Emits a `pending_plugins_changed` Tauri event whenever a plugin
/// is added, modified, or removed so the frontend can refresh the review list.
///
/// Replaces any previously active watcher for the same workspace.
#[tauri::command]
pub fn watch_pending_plugins(
    app: AppHandle,
    state: State<PendingWatcherState>,
    project_path: String,
) -> Result<(), String> {
    let mut watcher_guard = state.watcher.lock().map_err(|e| e.to_string())?;

    // Drop any existing watcher
    *watcher_guard = None;

    let target_dir = pending_root(&project_path);
    if !target_dir.exists() {
        std::fs::create_dir_all(&target_dir).ok();
    }

    let (tx, rx) = mpsc::channel();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(event) = res {
            if matches!(
                event.kind,
                EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(_)
            ) {
                let _ = tx.send(());
            }
        }
    })
    .map_err(|e| format!("Failed to create watcher: {e}"))?;

    watcher
        .watch(&target_dir, RecursiveMode::Recursive)
        .map_err(|e| format!("Failed to watch directory: {e}"))?;

    *watcher_guard = Some(watcher);

    let app_clone = app.clone();
    std::thread::spawn(move || {
        // Run as long as the channel is open (which it is until the watcher is dropped)
        while rx.recv().is_ok() {
            let _ = app_clone.emit("pending_plugins_changed", ());
            // Debounce rapid events like writes to a new .rhai and .toml file simultaneously.
            std::thread::sleep(std::time::Duration::from_millis(150));
            while rx.try_recv().is_ok() {}
        }
    });

    Ok(())
}
