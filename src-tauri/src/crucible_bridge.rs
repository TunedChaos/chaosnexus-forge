use serde::{Deserialize, Serialize};
use reqwest::Client;

#[derive(Debug, Serialize, Deserialize)]
pub struct LlmRequest {
    pub prompt: String,
    pub model: Option<String>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LlmResponse {
    pub text: String,
}

#[tauri::command]
pub async fn crucible_generate(request: LlmRequest) -> Result<String, String> {
    let client = Client::new();
    // Assuming Crucible is running on 127.0.0.1:3000 as set up in axum
    let res = client
        .post("http://127.0.0.1:3000/generate")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Crucible: {}", e))?;

    if res.status().is_success() {
        let response: LlmResponse = res
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;
        Ok(response.text)
    } else {
        Err(format!("Crucible returned an error: {}", res.status()))
    }
}
