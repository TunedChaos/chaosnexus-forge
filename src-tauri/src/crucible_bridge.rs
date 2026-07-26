// chaosnexus-forge/src-tauri/src/crucible_bridge.rs
//! HTTP client bridge from Forge to ChaosNexus Crucible (`/generate`, sessions).

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub struct LlmRequest {
    pub prompt: String,
    #[serde(default)]
    pub project: Option<String>,
    pub model: Option<String>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
    pub anvil_port: Option<u16>,
    pub anvil_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CrucibleGenerateBody {
    prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    project: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_new_tokens: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    anvil_port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    anvil_token: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct CrucibleGenerateResponse {
    result: String,
}

fn base_url(app: &AppHandle) -> String {
    crate::crucible_supervisor::crucible_base_url(app)
}

/// POST `/generate` against the supervised (or attached) Crucible instance.
#[tauri::command]
pub async fn crucible_generate(app: AppHandle, request: LlmRequest) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/generate", base_url(&app));
    let body = CrucibleGenerateBody {
        prompt: request.prompt,
        project: request.project,
        max_new_tokens: request.max_tokens.map(|n| n as usize),
        temperature: request.temperature,
        anvil_port: request.anvil_port,
        anvil_token: request.anvil_token,
    };

    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Crucible: {e}"))?;

    if res.status().is_success() {
        let response: CrucibleGenerateResponse = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse Crucible response: {e}"))?;
        Ok(response.result)
    } else {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        Err(format!("Crucible returned an error: {status} — {text}"))
    }
}

/// List sessions for a project via Crucible HTTP API.
#[tauri::command]
pub async fn crucible_sessions_list(
    app: AppHandle,
    project: String,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "{}/sessions?project={}",
        base_url(&app),
        urlencoding_encode(&project)
    );
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Crucible sessions list failed: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("Crucible sessions list HTTP {}", res.status()));
    }
    res.json()
        .await
        .map_err(|e| format!("parse sessions: {e}"))
}

/// Create a session under a project.
#[tauri::command]
pub async fn crucible_sessions_create(
    app: AppHandle,
    project: String,
    title: Option<String>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/sessions", base_url(&app));
    let body = serde_json::json!({ "project": project, "title": title });
    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Crucible create session failed: {e}"))?;
    if !res.status().is_success() {
        let t = res.text().await.unwrap_or_default();
        return Err(format!("create session failed: {t}"));
    }
    res.json()
        .await
        .map_err(|e| format!("parse session: {e}"))
}

/// Load a full session.
#[tauri::command]
pub async fn crucible_sessions_get(
    app: AppHandle,
    project: String,
    id: String,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "{}/sessions/{}?project={}",
        base_url(&app),
        id,
        urlencoding_encode(&project)
    );
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Crucible get session failed: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("get session HTTP {}", res.status()));
    }
    res.json()
        .await
        .map_err(|e| format!("parse session: {e}"))
}

/// Persist session messages / title.
#[tauri::command]
pub async fn crucible_sessions_update(
    app: AppHandle,
    project: String,
    id: String,
    title: Option<String>,
    messages: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "{}/sessions/{}?project={}",
        base_url(&app),
        id,
        urlencoding_encode(&project)
    );
    let mut body = serde_json::Map::new();
    if let Some(t) = title {
        body.insert("title".into(), serde_json::Value::String(t));
    }
    if let Some(m) = messages {
        body.insert("messages".into(), m);
    }
    let res = client
        .put(&url)
        .json(&serde_json::Value::Object(body))
        .send()
        .await
        .map_err(|e| format!("Crucible update session failed: {e}"))?;
    if !res.status().is_success() {
        let t = res.text().await.unwrap_or_default();
        return Err(format!("update session failed: {t}"));
    }
    res.json()
        .await
        .map_err(|e| format!("parse session: {e}"))
}

/// Delete a session.
#[tauri::command]
pub async fn crucible_sessions_delete(
    app: AppHandle,
    project: String,
    id: String,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let url = format!(
        "{}/sessions/{}?project={}",
        base_url(&app),
        id,
        urlencoding_encode(&project)
    );
    let res = client
        .delete(&url)
        .send()
        .await
        .map_err(|e| format!("Crucible delete session failed: {e}"))?;
    if res.status().is_success() || res.status().as_u16() == 204 {
        Ok(())
    } else {
        Err(format!("delete session HTTP {}", res.status()))
    }
}

fn urlencoding_encode(s: &str) -> String {
    // Minimal query encoding without adding a dependency.
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                out.push(b as char);
            }
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// GET `/models/status`.
#[tauri::command]
pub async fn crucible_models_status(app: AppHandle) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/models/status", base_url(&app));
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("models status: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("models status HTTP {}", res.status()));
    }
    res.json()
        .await
        .map_err(|e| format!("parse status: {e}"))
}

/// POST `/models/pull`.
#[tauri::command]
pub async fn crucible_models_pull(
    app: AppHandle,
    model_id: Option<String>,
    gguf_file: Option<String>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/models/pull", base_url(&app));
    let body = serde_json::json!({
        "modelId": model_id,
        "ggufFile": gguf_file,
    });
    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("models pull: {e}"))?;
    if !res.status().is_success() {
        let t = res.text().await.unwrap_or_default();
        return Err(format!("models pull failed: {t}"));
    }
    res.json()
        .await
        .map_err(|e| format!("parse pull: {e}"))
}

/// GET `/models/list`.
#[tauri::command]
pub async fn crucible_models_list(app: AppHandle) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/models/list", base_url(&app));
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("models list: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("models list HTTP {}", res.status()));
    }
    res.json()
        .await
        .map_err(|e| format!("parse list: {e}"))
}
