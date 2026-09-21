// chaosnexus-forge/src-tauri/src/llm_bridge.rs

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::Emitter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatChoiceDelta {
    pub content: Option<String>,
    pub role: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatChoice {
    pub index: usize,
    pub message: Option<ChatMessage>,
    pub delta: Option<ChatChoiceDelta>,
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionResponse {
    pub id: Option<String>,
    pub object: Option<String>,
    pub choices: Vec<ChatChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmStreamTokenPayload {
    pub request_id: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmStreamDonePayload {
    pub request_id: String,
    pub full_response: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmStreamErrorPayload {
    pub request_id: String,
    pub error: String,
}

const DEFAULT_ENDPOINT: &str = "http://localhost:8080/v1/chat/completions";
const DEFAULT_MODEL: &str = "granite-4.1-8b";

pub const RHAI_SYSTEM_PROMPT: &str = r#"You are ChaosNexus AI, an expert assistant for the ChaosNexus platform (Anvil engine & Forge IDE).
CRITICAL RHAI ENGINE RULES:
1. Write Rhai scripts, NOT Rust code.
2. DO NOT output Rust imports (`use std::...`), `pub struct`, `fn main()`, `extern crate`, or Rust macros (`println!`, `format!`).
3. Use Rhai native pre-registered functions: `log_info(msg)`, `log_warn(msg)`, `log_error(msg)`, `register_mcp_tool(name, desc, fn)`, `load_config()`, `fs_read(path)`, `run_command(exec, args)`, `mcp_connect(...)`, `mcp_call_tool(...)`.
4. `CONFIG` and `PLUGIN_NAME` are pre-injected immutable globals in Rhai scope. Use `CONFIG.cvars` and `CONFIG.secrets` to access plugin configuration.
"#;

/// Ensures that a system prompt defining Rhai rules is present at the start of conversation messages.
pub fn ensure_system_prompt(mut messages: Vec<ChatMessage>) -> Vec<ChatMessage> {
    let has_system = messages.iter().any(|m| m.role.eq_ignore_ascii_case("system"));
    if !has_system {
        let mut prepended = vec![ChatMessage {
            role: "system".to_string(),
            content: RHAI_SYSTEM_PROMPT.to_string(),
        }];
        prepended.append(&mut messages);
        prepended
    } else {
        messages
    }
}

/// Post-processor that strips hallucinated Rust import statements (`use std::...`) from model output.
pub fn sanitize_rhai_output(output: &str) -> String {
    let mut cleaned_lines = Vec::new();
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("use std::")
            || trimmed.starts_with("use crate::")
            || trimmed.starts_with("extern crate ")
            || (trimmed.starts_with("use ") && trimmed.ends_with(';'))
        {
            // Omit hallucinated Rust import statement
            continue;
        }
        cleaned_lines.push(line);
    }
    cleaned_lines.join("\n")
}

/// Executes a synchronous (non-streaming) chat completion request against an OpenAI-compatible endpoint.
#[tauri::command]
pub async fn llm_chat_completion(
    endpoint_url: Option<String>,
    model: Option<String>,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
) -> Result<String, String> {
    let url = endpoint_url.unwrap_or_else(|| DEFAULT_ENDPOINT.to_string());
    let model_name = model.unwrap_or_else(|| DEFAULT_MODEL.to_string());
    let processed_messages = ensure_system_prompt(messages);

    let payload = ChatCompletionRequest {
        model: model_name,
        messages: processed_messages,
        temperature,
        stream: Some(false),
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let response = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        let err_text = response.text().await.unwrap_or_default();
        return Err(format!("LLM Endpoint returned error: {}", err_text));
    }

    let completion: ChatCompletionResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse LLM JSON response: {}", e))?;

    if let Some(choice) = completion.choices.first() {
        if let Some(msg) = &choice.message {
            return Ok(sanitize_rhai_output(&msg.content));
        }
    }

    Err("No message content returned from LLM endpoint".to_string())
}

/// Streams chat completion tokens via Tauri window events (`llm_token`, `llm_done`, `llm_error`).
#[tauri::command]
pub async fn llm_stream_chat(
    window: tauri::Window,
    request_id: String,
    endpoint_url: Option<String>,
    model: Option<String>,
    messages: Vec<ChatMessage>,
    temperature: Option<f32>,
) -> Result<(), String> {
    let url = endpoint_url.unwrap_or_else(|| DEFAULT_ENDPOINT.to_string());
    let model_name = model.unwrap_or_else(|| DEFAULT_MODEL.to_string());
    let processed_messages = ensure_system_prompt(messages);

    let payload = ChatCompletionRequest {
        model: model_name,
        messages: processed_messages,
        temperature,
        stream: Some(true),
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let req_res = client.post(&url).json(&payload).send().await;

    let response = match req_res {
        Ok(res) => res,
        Err(e) => {
            let _ = window.emit(
                "llm_error",
                LlmStreamErrorPayload {
                    request_id: request_id.clone(),
                    error: format!("HTTP connection error: {}", e),
                },
            );
            return Err(e.to_string());
        }
    };

    if !response.status().is_success() {
        let err_text = response.text().await.unwrap_or_default();
        let _ = window.emit(
            "llm_error",
            LlmStreamErrorPayload {
                request_id: request_id.clone(),
                error: format!("LLM Server status error: {}", err_text),
            },
        );
        return Err(err_text);
    }

    let mut stream = response.bytes_stream();
    let mut full_accumulated = String::new();
    let mut buffer = String::new();

    while let Some(chunk_res) = stream.next().await {
        match chunk_res {
            Ok(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                buffer.push_str(&text);

                while let Some(pos) = buffer.find('\n') {
                    let line = buffer[..pos].trim().to_string();
                    buffer.drain(..pos + 1);

                    if line.starts_with("data: ") {
                        let data_str = line.trim_start_matches("data: ").trim();
                        if data_str == "[DONE]" {
                            break;
                        }
                        if let Ok(parsed) = serde_json::from_str::<ChatCompletionResponse>(data_str)
                        {
                            if let Some(choice) = parsed.choices.first() {
                                if let Some(delta) = &choice.delta {
                                    if let Some(content) = &delta.content {
                                        full_accumulated.push_str(content);
                                        let _ = window.emit(
                                            "llm_token",
                                            LlmStreamTokenPayload {
                                                request_id: request_id.clone(),
                                                token: content.clone(),
                                            },
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                let _ = window.emit(
                    "llm_error",
                    LlmStreamErrorPayload {
                        request_id: request_id.clone(),
                        error: format!("Stream read error: {}", e),
                    },
                );
                return Err(e.to_string());
            }
        }
    }

    let sanitized_full = sanitize_rhai_output(&full_accumulated);

    let _ = window.emit(
        "llm_done",
        LlmStreamDonePayload {
            request_id,
            full_response: sanitized_full,
        },
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ensure_system_prompt_injects_default_when_missing() {
        let messages = vec![ChatMessage {
            role: "user".to_string(),
            content: "Write a tool function".to_string(),
        }];
        let processed = ensure_system_prompt(messages);
        assert_eq!(processed.len(), 2);
        assert_eq!(processed[0].role, "system");
        assert!(processed[0].content.contains("CRITICAL RHAI ENGINE RULES"));
    }

    #[test]
    fn test_ensure_system_prompt_retains_existing_system_prompt() {
        let messages = vec![
            ChatMessage {
                role: "system".to_string(),
                content: "Custom system prompt".to_string(),
            },
            ChatMessage {
                role: "user".to_string(),
                content: "Hello".to_string(),
            },
        ];
        let processed = ensure_system_prompt(messages);
        assert_eq!(processed.len(), 2);
        assert_eq!(processed[0].content, "Custom system prompt");
    }

    #[test]
    fn test_sanitize_rhai_output_removes_rust_imports() {
        let raw = "use std::collections::HashMap;\nfn execute() {\n  let a = 1;\n}\nuse std::fs;";
        let cleaned = sanitize_rhai_output(raw);
        assert!(!cleaned.contains("use std::"));
        assert!(cleaned.contains("fn execute() {"));
    }
}
