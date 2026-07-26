// chaosnexus-forge/src-tauri/src/mcp_registry.rs
//
// MCP Registry: a Forge-native client for managing downstream (external) MCP
// servers from the ChaosNexus Forge IDE, independent of the ChaosNexus Anvil engine
// lifecycle (the engine's own connections are script-driven and per-plugin).
//
// Responsibilities:
//   * Persist a per-workspace connection registry to
//     `<scripts_root>/.chaosnexus-forge/mcp_registry.toml` (parallel to cvars.toml).
//   * Test a connection by launching it over stdio, performing the MCP
//     handshake, and listing its tools (health check + proxy-node palette).
//   * Enforce permission scopes at connection time: a `No-Network` connection
//     is refused before any process is spawned.
//
// Because the MCP SDK is async and Tauri commands here are synchronous, every
// SDK call is driven on a dedicated multi-threaded Tokio runtime via
// [`run_async`] (Forge's analog of chaosnexus-anvil's scripting::utils::run_async).

use std::path::PathBuf;
use std::sync::OnceLock;

use rust_mcp_sdk::mcp_client::{ClientHandler, McpClientOptions, client_runtime::create_client};
use rust_mcp_sdk::schema::{
    ClientCapabilities, Implementation, InitializeRequestParams, ProtocolVersion,
};
use rust_mcp_sdk::{McpClient, ToMcpClientHandler};
use rust_mcp_transport::{StdioTransport, TransportOptions};
use serde::{Deserialize, Serialize};

use crate::engine_supervisor::scripts_root_from_project;

/// Registry filename, resolved under the workspace `.chaosnexus-forge` directory.
const REGISTRY_FILENAME: &str = "mcp_registry.toml";

/// Permission scope for a downstream connection. Serialized in kebab-case so the
/// TOML/JSON contract reads naturally (`scope = "read-only"`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum McpScope {
    /// May be connected and read from; write-style tools are flagged in the UI
    /// and excluded from generated proxy calls.
    #[default]
    ReadOnly,
    /// Full access: any tool may be called or code-generated.
    ReadWrite,
    /// Declared but inert: refused at connection time (no process is spawned).
    NoNetwork,
}

/// A single registered downstream MCP server (launched over stdio).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct McpConnection {
    /// Stable identifier (used as the `conn_id` in generated Rhai).
    pub id: String,
    /// Human-friendly label shown in the registry list.
    #[serde(default)]
    pub label: String,
    /// Executable that launches the server (e.g. `npx`).
    pub command: String,
    /// Arguments passed to the executable.
    #[serde(default)]
    pub args: Vec<String>,
    /// Permission scope enforced at connection time.
    #[serde(default)]
    pub scope: McpScope,
}

/// A tool exposed by a downstream server, captured for the proxy-node palette.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct McpToolSchema {
    /// The name of the tool as exposed by the MCP server.
    pub name: String,
    /// A human-readable description of what the tool does.
    #[serde(default)]
    pub description: String,
    /// JSON Schema describing the tool's arguments (`inputSchema`).
    pub input_schema: serde_json::Value,
}

/// Result of testing a connection: health plus the discovered tool schemas.
#[derive(Clone, Debug, Serialize)]
pub struct McpHealthReport {
    /// Whether the connection test was successful.
    pub ok: bool,
    /// A status message providing more details about the connection attempt.
    pub message: String,
    /// The list of tools discovered on the downstream MCP server.
    pub tools: Vec<McpToolSchema>,
}

/// On-disk shape of the registry file (`[[connections]]` array of tables).
#[derive(Default, Serialize, Deserialize)]
struct RegistryFile {
    #[serde(default)]
    connections: Vec<McpConnection>,
}

/// Minimal client handler; outbound tool/resource calls need no server-initiated
/// request handling, so every method uses the SDK default.
struct ForgeClientHandler;

#[async_trait::async_trait]
impl ClientHandler for ForgeClientHandler {}

/// Dedicated multi-threaded runtime for driving async MCP SDK calls from the
/// synchronous Tauri command layer. Created once on first use.
fn runtime() -> &'static tokio::runtime::Runtime {
    static RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RUNTIME.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("failed to build MCP registry runtime")
    })
}

/// Blocks on `fut`, running it to completion on the registry runtime.
fn run_async<F, R>(fut: F) -> R
where
    F: std::future::Future<Output = R>,
{
    runtime().block_on(fut)
}

/// Resolves `<scripts_root>/.chaosnexus-forge/mcp_registry.toml` for a workspace.
fn registry_path(project_path: &str) -> PathBuf {
    PathBuf::from(scripts_root_from_project(project_path))
        .join(".chaosnexus-forge")
        .join(REGISTRY_FILENAME)
}

/// Loads the persisted registry, returning an empty list when absent or
/// unparseable (a missing/corrupt registry must never block the IDE).
fn load_registry(project_path: &str) -> Vec<McpConnection> {
    let path = registry_path(project_path);
    if !path.exists() {
        return Vec::new();
    }
    let body = match std::fs::read_to_string(&path) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("[chaosnexus-forge] Failed to read {:?}: {}", path, e);
            return Vec::new();
        }
    };
    match toml::from_str::<RegistryFile>(&body) {
        Ok(f) => f.connections,
        Err(e) => {
            eprintln!("[chaosnexus-forge] Failed to parse {:?}: {}", path, e);
            Vec::new()
        }
    }
}

/// Persists the registry, creating the `.chaosnexus-forge` directory as needed.
fn save_registry(project_path: &str, connections: &[McpConnection]) -> Result<(), String> {
    let path = registry_path(project_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create .chaosnexus-forge directory: {}", e))?;
    }
    let header = "# mcp_registry.toml - ChaosNexus Forge MCP Mesh registry\n\
                  # Auto-managed by ChaosNexus Forge; lists downstream MCP servers for this workspace.\n\n";
    let body = toml::to_string_pretty(&RegistryFile {
        connections: connections.to_vec(),
    })
    .map_err(|e| format!("Failed to serialize registry: {}", e))?;
    std::fs::write(&path, format!("{}{}", header, body))
        .map_err(|e| format!("Failed to write {:?}: {}", path, e))
}

/// Validates a connection's identifier and launch command before use.
fn validate_connection(conn: &McpConnection) -> Result<(), String> {
    let id = conn.id.trim();
    if id.is_empty() {
        return Err("Connection id is required.".to_string());
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        return Err("Connection id may only contain letters, numbers, '_' and '-'.".to_string());
    }
    if conn.command.trim().is_empty() {
        return Err("Launch command is required.".to_string());
    }
    Ok(())
}

/// Initialize params advertised to downstream servers during the handshake.
fn client_details() -> InitializeRequestParams {
    InitializeRequestParams {
        capabilities: ClientCapabilities::default(),
        client_info: Implementation {
            name: "chaosnexus-forge".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            title: Some("ChaosNexus Forge".to_string()),
            description: Some("ChaosNexus Forge MCP registry client".to_string()),
            icons: vec![],
            website_url: None,
        },
        protocol_version: ProtocolVersion::V2025_11_25.into(),
        meta: None,
    }
}

/// Connects to a downstream server, lists its tools, and shuts down. Returns the
/// discovered tool schemas or a transport/handshake error string.
fn probe_tools(conn: &McpConnection) -> Result<Vec<McpToolSchema>, String> {
    let command = conn.command.clone();
    let args = conn.args.clone();

    run_async(async move {
        let transport = StdioTransport::create_with_server_launch(
            command,
            args,
            None,
            TransportOptions::default(),
        )
        .map_err(|e| format!("transport launch error: {}", e))?;

        let client = create_client(McpClientOptions {
            client_details: client_details(),
            transport,
            handler: ForgeClientHandler.to_mcp_client_handler(),
            task_store: None,
            server_task_store: None,
            message_observer: None,
        });

        client
            .clone()
            .start()
            .await
            .map_err(|e| format!("client start error: {}", e))?;

        let list = client
            .request_tool_list(None)
            .await
            .map_err(|e| format!("list_tools error: {}", e));

        // Always attempt a clean shutdown, even if listing failed.
        let _ = client.shut_down().await;

        let tools = list?
            .tools
            .into_iter()
            .map(|t| McpToolSchema {
                name: t.name.clone(),
                description: t.description.clone().unwrap_or_default(),
                input_schema: serde_json::to_value(&t.input_schema)
                    .unwrap_or(serde_json::Value::Null),
            })
            .collect();

        Ok::<_, String>(tools)
    })
}

/// Lists the persisted connections for a workspace.
#[tauri::command]
pub fn mcp_registry_list(project_path: String) -> Result<Vec<McpConnection>, String> {
    Ok(load_registry(&project_path))
}

/// Adds or updates a connection (upsert by id) and persists the registry.
#[tauri::command]
pub fn mcp_registry_add(
    project_path: String,
    connection: McpConnection,
) -> Result<Vec<McpConnection>, String> {
    validate_connection(&connection)?;
    let mut connections = load_registry(&project_path);
    match connections.iter_mut().find(|c| c.id == connection.id) {
        Some(existing) => *existing = connection,
        None => connections.push(connection),
    }
    save_registry(&project_path, &connections)?;
    Ok(connections)
}

/// Removes a connection by id and persists the registry.
#[tauri::command]
pub fn mcp_registry_remove(project_path: String, id: String) -> Result<Vec<McpConnection>, String> {
    let mut connections = load_registry(&project_path);
    connections.retain(|c| c.id != id);
    save_registry(&project_path, &connections)?;
    Ok(connections)
}

/// Tests a connection: enforces the `No-Network` scope, otherwise launches the
/// server and reports health plus the discovered tool schemas.
#[tauri::command]
pub fn mcp_registry_test(connection: McpConnection) -> Result<McpHealthReport, String> {
    validate_connection(&connection)?;

    // Connection-time scope enforcement: a No-Network connection is inert.
    if connection.scope == McpScope::NoNetwork {
        return Ok(McpHealthReport {
            ok: false,
            message: "Connection scope is No-Network; enable network access to test.".to_string(),
            tools: Vec::new(),
        });
    }

    match probe_tools(&connection) {
        Ok(tools) => Ok(McpHealthReport {
            ok: true,
            message: format!("Connected. {} tool(s) discovered.", tools.len()),
            tools,
        }),
        Err(e) => Ok(McpHealthReport {
            ok: false,
            message: e,
            tools: Vec::new(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn conn(id: &str) -> McpConnection {
        McpConnection {
            id: id.to_string(),
            label: format!("{} label", id),
            command: "echo".to_string(),
            args: vec!["hi".to_string()],
            scope: McpScope::ReadWrite,
        }
    }

    #[test]
    fn validate_rejects_bad_ids() {
        let mut c = conn("ok_id-1");
        assert!(validate_connection(&c).is_ok());
        c.id = "bad id!".to_string();
        assert!(validate_connection(&c).is_err());
        c.id = String::new();
        assert!(validate_connection(&c).is_err());
    }

    #[test]
    fn add_list_remove_roundtrips() {
        let dir = std::env::temp_dir().join("cf_mcp_registry_test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let project = dir.to_string_lossy().to_string();

        let after_add = mcp_registry_add(project.clone(), conn("github")).unwrap();
        assert_eq!(after_add.len(), 1);

        // Upsert: same id replaces rather than duplicates.
        let mut updated = conn("github");
        updated.label = "Updated".to_string();
        let after_update = mcp_registry_add(project.clone(), updated).unwrap();
        assert_eq!(after_update.len(), 1);
        assert_eq!(after_update[0].label, "Updated");

        let listed = mcp_registry_list(project.clone()).unwrap();
        assert_eq!(listed.len(), 1);

        let after_remove = mcp_registry_remove(project.clone(), "github".to_string()).unwrap();
        assert!(after_remove.is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn no_network_scope_is_refused() {
        let mut c = conn("offline");
        c.scope = McpScope::NoNetwork;
        let report = mcp_registry_test(c).unwrap();
        assert!(!report.ok);
        assert!(report.message.contains("No-Network"));
    }
}
