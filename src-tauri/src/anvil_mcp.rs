// chaosnexus-forge/src-tauri/src/anvil_mcp.rs
//! Forge UI backend for Anvil external MCP servers (`[mcp_servers]` in
//! `chaosnexus-anvil.toml`). Distinct from the Mesh MCP registry used for Rhai codegen.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;

use crate::engine_supervisor::{chaoswrench_binary_candidates, scripts_root_from_project};

/// One Anvil-proxied MCP server entry.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AnvilMcpServer {
    /// Map key in `[mcp_servers.<name>]`.
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prefix: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
struct McpServerToml {
    command: String,
    #[serde(default)]
    args: Vec<String>,
    #[serde(default)]
    prefix: Option<String>,
}

/// Resolve the Anvil config file Forge should edit (user home, then binary-adjacent, then project).
pub fn resolve_anvil_config_path(app: &AppHandle, project_path: Option<String>) -> Result<PathBuf, String> {
    // 1) Prefer ~/.chaosnexus/anvil/chaosnexus-anvil.toml when present.
    if let Some(home) = directories::UserDirs::new() {
        let user = home.home_dir().join(".chaosnexus/anvil/chaosnexus-anvil.toml");
        if user.is_file() {
            return Ok(user);
        }
        let legacy = home
            .home_dir()
            .join(".chaosnexus/chaosnexus-anvil/chaosnexus-anvil.toml");
        if legacy.is_file() {
            return Ok(legacy);
        }
    }

    // 2) Binary-adjacent config (same discovery as engine_supervisor).
    for bin in chaoswrench_binary_candidates(app) {
        if let Some(cfg) = walk_up_for_config(&bin) {
            return Ok(cfg);
        }
    }

    // 3) Project / scripts root.
    if let Some(project) = project_path {
        let root = scripts_root_from_project(&project);
        let candidate = PathBuf::from(&root).join("chaosnexus-anvil.toml");
        if candidate.is_file() {
            return Ok(candidate);
        }
        // Create under scripts root if missing.
        return Ok(candidate);
    }

    // 4) Create under ~/.chaosnexus/anvil/
    if let Some(home) = directories::UserDirs::new() {
        let dir = home.home_dir().join(".chaosnexus/anvil");
        fs::create_dir_all(&dir).map_err(|e| format!("create anvil config dir: {e}"))?;
        return Ok(dir.join("chaosnexus-anvil.toml"));
    }

    Err("Could not resolve a path for chaosnexus-anvil.toml".into())
}

fn walk_up_for_config(bin: &std::path::Path) -> Option<PathBuf> {
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

fn read_toml_value(path: &PathBuf) -> Result<toml::Value, String> {
    if !path.exists() {
        return Ok(toml::Value::Table(toml::map::Map::new()));
    }
    let raw = fs::read_to_string(path).map_err(|e| format!("read {:?}: {e}", path))?;
    if raw.trim().is_empty() {
        return Ok(toml::Value::Table(toml::map::Map::new()));
    }
    toml::from_str(&raw).map_err(|e| format!("parse {:?}: {e}", path))
}

fn write_toml_value(path: &PathBuf, value: &toml::Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create dir: {e}"))?;
    }
    let body = toml::to_string_pretty(value).map_err(|e| format!("serialize: {e}"))?;
    fs::write(path, body).map_err(|e| format!("write {:?}: {e}", path))
}

fn mcp_table_mut(root: &mut toml::Value) -> &mut toml::map::Map<String, toml::Value> {
    if !root.is_table() {
        *root = toml::Value::Table(toml::map::Map::new());
    }
    let table = root.as_table_mut().unwrap();
    if !table.contains_key("mcp_servers") {
        table.insert(
            "mcp_servers".into(),
            toml::Value::Table(toml::map::Map::new()),
        );
    }
    // Ensure mcp_servers is a table
    if !table.get("mcp_servers").map(|v| v.is_table()).unwrap_or(false) {
        table.insert(
            "mcp_servers".into(),
            toml::Value::Table(toml::map::Map::new()),
        );
    }
    table.get_mut("mcp_servers").unwrap().as_table_mut().unwrap()
}

/// List configured Anvil MCP servers.
#[tauri::command]
pub fn anvil_mcp_list(
    app: AppHandle,
    project_path: Option<String>,
) -> Result<Vec<AnvilMcpServer>, String> {
    let path = resolve_anvil_config_path(&app, project_path)?;
    let root = read_toml_value(&path)?;
    let mut out = Vec::new();
    if let Some(servers) = root.get("mcp_servers").and_then(|v| v.as_table()) {
        for (name, val) in servers {
            let parsed: McpServerToml = val
                .clone()
                .try_into()
                .map_err(|e| format!("server `{name}`: {e}"))?;
            out.push(AnvilMcpServer {
                name: name.clone(),
                command: parsed.command,
                args: parsed.args,
                prefix: parsed.prefix,
            });
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// Upsert a single Anvil MCP server entry and return the config path written.
#[tauri::command]
pub fn anvil_mcp_upsert(
    app: AppHandle,
    project_path: Option<String>,
    server: AnvilMcpServer,
) -> Result<String, String> {
    let name = server.name.trim().to_string();
    if name.is_empty() {
        return Err("server name is required".into());
    }
    if server.command.trim().is_empty() {
        return Err("command is required".into());
    }
    let path = resolve_anvil_config_path(&app, project_path)?;
    let mut root = read_toml_value(&path)?;
    let table = mcp_table_mut(&mut root);
    let mut entry = toml::map::Map::new();
    entry.insert(
        "command".into(),
        toml::Value::String(server.command.trim().to_string()),
    );
    entry.insert(
        "args".into(),
        toml::Value::Array(
            server
                .args
                .into_iter()
                .map(toml::Value::String)
                .collect(),
        ),
    );
    if let Some(prefix) = server.prefix.filter(|p| !p.trim().is_empty()) {
        entry.insert("prefix".into(), toml::Value::String(prefix));
    }
    table.insert(name, toml::Value::Table(entry));
    write_toml_value(&path, &root)?;
    Ok(path.to_string_lossy().to_string())
}

/// Remove an Anvil MCP server by name.
#[tauri::command]
pub fn anvil_mcp_remove(
    app: AppHandle,
    project_path: Option<String>,
    name: String,
) -> Result<String, String> {
    let path = resolve_anvil_config_path(&app, project_path)?;
    let mut root = read_toml_value(&path)?;
    let table = mcp_table_mut(&mut root);
    if table.remove(name.trim()).is_none() {
        return Err(format!("server `{name}` not found"));
    }
    write_toml_value(&path, &root)?;
    Ok(path.to_string_lossy().to_string())
}

/// Path currently used for Anvil MCP config (for UI display).
#[tauri::command]
pub fn anvil_mcp_config_path(
    app: AppHandle,
    project_path: Option<String>,
) -> Result<String, String> {
    resolve_anvil_config_path(&app, project_path).map(|p| p.to_string_lossy().to_string())
}

/// Apply MCP config changes: restart Anvil (if running) then Crucible.
#[tauri::command]
pub fn anvil_mcp_apply_restart(
    app: AppHandle,
    engine: tauri::State<'_, crate::engine_supervisor::EngineSupervisor>,
    crucible: tauri::State<'_, crate::crucible_supervisor::CrucibleSupervisor>,
    project_path: Option<String>,
) -> Result<String, String> {
    // Restart Anvil when a project path is known and the engine was live.
    if let Some(project) = project_path {
        let status = crate::engine_supervisor::engine_status(engine.clone())?;
        if status == "running" {
            let _ = crate::engine_supervisor::engine_stop(app.clone(), engine.clone())?;
            let _ = crate::engine_supervisor::engine_start(app.clone(), engine, project)?;
        }
    }
    let _ = crate::crucible_supervisor::crucible_restart(app, crucible)?;
    Ok("restarted".into())
}

/// Convenience: export server map for debugging.
#[allow(dead_code)]
pub fn servers_as_map(list: Vec<AnvilMcpServer>) -> BTreeMap<String, AnvilMcpServer> {
    list.into_iter().map(|s| (s.name.clone(), s)).collect()
}
