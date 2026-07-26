// chaosnexus-forge/src-tauri/src/cli_agent_bridge.rs

use std::collections::HashMap;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

/// Profile describing how to launch an external CLI agent process.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentProfile {
    pub id: String,
    pub name: String,
    pub binary: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliAgentStreamOutputPayload {
    pub request_id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliAgentStreamDiagnosticsPayload {
    pub request_id: String,
    pub line: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliAgentStreamDonePayload {
    pub request_id: String,
    pub exit_code: i32,
    pub full_output: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliAgentStreamErrorPayload {
    pub request_id: String,
    pub error: String,
}

/// Global registry tracking active running child process handles for cancellation.
#[derive(Default)]
pub struct CliAgentProcessRegistry {
    processes: Arc<Mutex<HashMap<String, Child>>>,
}

impl CliAgentProcessRegistry {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

/// Returns default preset agent profiles (Goose CLI, Antigravity CLI, Custom CLI).
#[tauri::command]
pub fn list_agent_profiles() -> Vec<AgentProfile> {
    vec![
        AgentProfile {
            id: "goose".to_string(),
            name: "Goose CLI Agent".to_string(),
            binary: "goose".to_string(),
            args: vec!["run".to_string(), "--text".to_string(), "{prompt}".to_string()],
            env: HashMap::new(),
            description: "Block's open-source autonomous CLI agent.".to_string(),
        },
        AgentProfile {
            id: "agy".to_string(),
            name: "Antigravity CLI (agy)".to_string(),
            binary: "agy".to_string(),
            args: vec!["exec".to_string(), "--prompt".to_string(), "{prompt}".to_string()],
            env: HashMap::new(),
            description: "Antigravity autonomous agent CLI.".to_string(),
        },
        AgentProfile {
            id: "custom".to_string(),
            name: "Custom CLI Script".to_string(),
            binary: "sh".to_string(),
            args: vec!["-c".to_string(), "{prompt}".to_string()],
            env: HashMap::new(),
            description: "Custom shell command or script runner.".to_string(),
        },
    ]
}

/// Spawns a managed external CLI agent process, streaming stdout and stderr via Tauri events.
#[tauri::command]
pub async fn spawn_cli_agent(
    window: tauri::Window,
    registry: tauri::State<'_, CliAgentProcessRegistry>,
    request_id: String,
    profile: AgentProfile,
    prompt: String,
    cwd: Option<String>,
) -> Result<(), String> {
    let mut cmd_args = Vec::new();
    for arg in &profile.args {
        if arg.contains("{prompt}") {
            cmd_args.push(arg.replace("{prompt}", &prompt));
        } else {
            cmd_args.push(arg.clone());
        }
    }

    let has_bwrap = std::process::Command::new("which")
        .arg("bwrap")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    let target_dir = cwd.as_deref().unwrap_or(".");
    let (binary, final_args) = if has_bwrap && cfg!(target_os = "linux") {
        let mut bwrap_args = vec![
            "--ro-bind".to_string(), "/".to_string(), "/".to_string(),
            "--dev".to_string(), "/dev".to_string(),
            "--proc".to_string(), "/proc".to_string(),
        ];
        if !target_dir.trim().is_empty() && std::path::Path::new(target_dir).exists() {
            bwrap_args.push("--bind".to_string());
            bwrap_args.push(target_dir.to_string());
            bwrap_args.push(target_dir.to_string());
            bwrap_args.push("--chdir".to_string());
            bwrap_args.push(target_dir.to_string());
        }
        bwrap_args.push(profile.binary.clone());
        bwrap_args.extend(cmd_args);
        ("bwrap".to_string(), bwrap_args)
    } else {
        (profile.binary.clone(), cmd_args)
    };

    let mut command = Command::new(&binary);
    command.args(&final_args);
    command.envs(&profile.env);
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());

    if let Some(dir) = cwd {
        if !dir.trim().is_empty() {
            command.current_dir(dir);
        }
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to spawn CLI binary '{}': {}", profile.binary, e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture child process stdout".to_string())?;

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture child process stderr".to_string())?;

    // Register child process handle for cancellation
    {
        let mut map = registry.processes.lock().unwrap();
        map.insert(request_id.clone(), child);
    }

    let window_stdout = window.clone();
    let req_id_stdout = request_id.clone();
    let (stdout_tx, mut stdout_rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    // Spawn reader for stdout
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        let mut full_accum = String::new();
        while let Ok(Some(line)) = reader.next_line().await {
            full_accum.push_str(&line);
            full_accum.push('\n');
            let _ = window_stdout.emit(
                "agent_stream_output",
                CliAgentStreamOutputPayload {
                    request_id: req_id_stdout.clone(),
                    text: format!("{}\n", line),
                },
            );
        }
        let _ = stdout_tx.send(full_accum);
    });

    let window_stderr = window.clone();
    let req_id_stderr = request_id.clone();

    // Spawn reader for stderr
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = window_stderr.emit(
                "agent_stream_diagnostics",
                CliAgentStreamDiagnosticsPayload {
                    request_id: req_id_stderr.clone(),
                    line,
                },
            );
        }
    });

    let registry_arc = registry.processes.clone();
    let req_id_wait = request_id.clone();

    // Wait for child process exit in background task
    tokio::spawn(async move {
        let full_output = stdout_rx.recv().await.unwrap_or_default();

        let child_opt = {
            let mut map = registry_arc.lock().unwrap();
            map.remove(&req_id_wait)
        };

        if let Some(mut child) = child_opt {
            match child.wait().await {
                Ok(status) => {
                    let code = status.code().unwrap_or(-1);
                    let _ = window.emit(
                        "agent_stream_done",
                        CliAgentStreamDonePayload {
                            request_id: req_id_wait,
                            exit_code: code,
                            full_output,
                        },
                    );
                }
                Err(e) => {
                    let _ = window.emit(
                        "agent_stream_error",
                        CliAgentStreamErrorPayload {
                            request_id: req_id_wait,
                            error: format!("Process wait error: {}", e),
                        },
                    );
                }
            }
        }
    });

    Ok(())
}

/// Terminates a running CLI agent process by its request_id.
#[tauri::command]
pub async fn stop_cli_agent(
    registry: tauri::State<'_, CliAgentProcessRegistry>,
    request_id: String,
) -> Result<bool, String> {
    let child_opt = {
        let mut map = registry.processes.lock().unwrap();
        map.remove(&request_id)
    };

    if let Some(mut child) = child_opt {
        let _ = child.kill().await;
        Ok(true)
    } else {
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_agent_profiles_contains_defaults() {
        let profiles = list_agent_profiles();
        assert!(profiles.iter().any(|p| p.id == "goose"));
        assert!(profiles.iter().any(|p| p.id == "agy"));
        assert!(profiles.iter().any(|p| p.id == "custom"));
    }
}
