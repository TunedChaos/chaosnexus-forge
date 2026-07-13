use std::collections::HashMap;
use std::io::Result as IoResult;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::sync::{mpsc, RwLock};
use tower_lsp::jsonrpc::Result;
use tower_lsp::lsp_types::*;
use tower_lsp::{Client, LanguageServer, LspService, Server};

#[derive(Debug, Clone, serde::Deserialize)]
pub struct SchemaFnParam {
    pub name: String,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct SchemaFunction {
    pub name: String,
    pub signature: Option<String>,
    pub description: Option<String>,
    pub docs_url: Option<String>,
    pub parameters: Option<Vec<SchemaFnParam>>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct SchemaModule {
    pub functions: Option<Vec<SchemaFunction>>,
}

#[derive(Debug, Clone, serde::Deserialize)]
pub struct EngineSchema {
    pub modules: Option<HashMap<String, SchemaModule>>,
}

#[derive(Debug, Clone)]
pub struct BuiltinDoc {
    pub signature: String,
    pub insert_text: String,
    pub description: String,
    pub docs_url: Option<String>,
}

#[derive(Debug)]
pub struct RhaiLanguageServer {
    pub client: Client,
    pub documents: Arc<RwLock<HashMap<Url, String>>>,
    pub builtins: Arc<RwLock<HashMap<String, BuiltinDoc>>>,
    pub app_handle: AppHandle,
}

impl RhaiLanguageServer {
    async fn load_schema(&self) {
        if let Ok(config_dir) = self.app_handle.path().app_config_dir() {
            let schema_path = config_dir.join("chaos_schema.json");
            if let Ok(content) = std::fs::read_to_string(&schema_path) {
                if let Ok(schema) = serde_json::from_str::<EngineSchema>(&content) {
                    let mut builtins = HashMap::new();
                    if let Some(modules) = schema.modules {
                        for (_, module) in modules {
                            if let Some(functions) = module.functions {
                                for func in functions {
                                    if func.name.starts_with('_') { continue; }
                                    let signature = func.signature.unwrap_or_else(|| format!("{}(...)", func.name));
                                    let mut insert_text = format!("{}(...)", func.name);
                                    if let Some(params) = &func.parameters {
                                        let param_strings: Vec<String> = params.iter().enumerate().map(|(i, p)| format!("${{{}:{}}}", i + 1, p.name)).collect();
                                        insert_text = format!("{}({})", func.name, param_strings.join(", "));
                                    }
                                    
                                    builtins.insert(func.name.clone(), BuiltinDoc {
                                        signature,
                                        insert_text,
                                        description: func.description.unwrap_or_default(),
                                        docs_url: func.docs_url,
                                    });
                                }
                            }
                        }
                    }
                    *self.builtins.write().await = builtins;
                    self.client.log_message(MessageType::INFO, "Rhai LSP schema loaded.").await;
                }
            }
        }
    }

    async fn parse_and_publish_diagnostics(&self, uri: Url, text: String, version: Option<i32>) {
        let parser = rhai_rowan::Parser::new(&text);
        let parse = parser.parse_script();
        
        let diagnostics: Vec<Diagnostic> = parse.errors.into_iter().map(|err| {
            let start = get_position(&text, err.range.start().into());
            let end = get_position(&text, err.range.end().into());
            Diagnostic::new(
                Range::new(start, end),
                Some(DiagnosticSeverity::ERROR),
                None,
                None,
                err.kind.to_string(),
                None,
                None,
            )
        }).collect();
        
        self.client.publish_diagnostics(uri, diagnostics, version).await;
    }
}

fn get_position(text: &str, byte_offset: u32) -> Position {
    let mut line = 0;
    let mut character = 0;
    for (idx, c) in text.char_indices() {
        if idx as u32 >= byte_offset {
            break;
        }
        if c == '\n' {
            line += 1;
            character = 0;
        } else {
            character += c.len_utf16() as u32;
        }
    }
    Position::new(line, character)
}

#[tower_lsp::async_trait]
impl LanguageServer for RhaiLanguageServer {
    async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
        Ok(InitializeResult {
            server_info: None,
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(TextDocumentSyncKind::FULL)),
                completion_provider: Some(CompletionOptions {
                    resolve_provider: Some(false),
                    trigger_characters: Some(vec![".".to_string(), ":".to_string()]),
                    work_done_progress_options: Default::default(),
                    all_commit_characters: None,
                    completion_item: None,
                }),
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                ..ServerCapabilities::default()
            },
            ..Default::default()
        })
    }

    async fn initialized(&self, _: InitializedParams) {
        self.client
            .log_message(MessageType::INFO, "Rhai LSP server initialized inside Tauri!")
            .await;
        self.load_schema().await;
    }

    async fn shutdown(&self) -> Result<()> {
        Ok(())
    }

    async fn did_open(&self, params: DidOpenTextDocumentParams) {
        let uri = params.text_document.uri.clone();
        let text = params.text_document.text.clone();
        self.documents.write().await.insert(uri.clone(), text.clone());
        self.parse_and_publish_diagnostics(uri, text, Some(params.text_document.version)).await;
    }

    async fn did_change(&self, params: DidChangeTextDocumentParams) {
        if let Some(change) = params.content_changes.into_iter().last() {
            let uri = params.text_document.uri.clone();
            let text = change.text.clone();
            self.documents.write().await.insert(uri.clone(), text.clone());
            self.parse_and_publish_diagnostics(uri, text, Some(params.text_document.version)).await;
        }
    }

    async fn hover(&self, params: HoverParams) -> Result<Option<Hover>> {
        let uri = params.text_document_position_params.text_document.uri;
        let position = params.text_document_position_params.position;
        
        let docs = self.documents.read().await;
        if let Some(text) = docs.get(&uri) {
            // Very naive word extraction
            if let Some(word) = extract_word_at_position(text, position) {
                let builtins = self.builtins.read().await;
                if let Some(doc) = builtins.get(&word) {
                    let mut value = format!("```rhai\n{}\n```\n{}", doc.signature, doc.description);
                    if let Some(url) = &doc.docs_url {
                        value.push_str(&format!("\n\n**Docs:** [View documentation]({})", url));
                    }
                    return Ok(Some(Hover {
                        contents: HoverContents::Scalar(MarkedString::LanguageString(LanguageString {
                            language: "rhai".to_string(),
                            value,
                        })),
                        range: None,
                    }));
                }
            }
        }
        Ok(None)
    }

    async fn completion(&self, _: CompletionParams) -> Result<Option<CompletionResponse>> {
        let builtins = self.builtins.read().await;
        let mut items = Vec::new();
        
        for (name, doc) in builtins.iter() {
            let mut value = format!("**{}**\n\n{}", doc.signature, doc.description);
            if let Some(url) = &doc.docs_url {
                value.push_str(&format!("\n\n**Docs:** [View documentation]({})", url));
            }
            
            items.push(CompletionItem {
                label: name.clone(),
                kind: Some(CompletionItemKind::FUNCTION),
                detail: Some("Engine API".to_string()),
                documentation: Some(Documentation::MarkupContent(MarkupContent {
                    kind: MarkupKind::Markdown,
                    value,
                })),
                insert_text: Some(doc.insert_text.clone()),
                insert_text_format: Some(InsertTextFormat::SNIPPET),
                ..Default::default()
            });
        }
        
        // Add basic keywords
        let keywords = vec!["fn", "let", "const", "if", "else", "for", "while", "loop", "return", "break", "continue", "try", "catch", "throw", "print", "type_of", "import", "as", "true", "false"];
        for kw in keywords {
            items.push(CompletionItem {
                label: kw.to_string(),
                kind: Some(CompletionItemKind::KEYWORD),
                detail: Some("Rhai keyword".to_string()),
                insert_text: Some(kw.to_string()),
                ..Default::default()
            });
        }
        
        Ok(Some(CompletionResponse::Array(items)))
    }
}

fn extract_word_at_position(text: &str, position: Position) -> Option<String> {
    let mut current_line = 0;
    for line_text in text.lines() {
        if current_line == position.line {
            let char_idx = position.character as usize;
            if char_idx > line_text.len() { return None; }
            // Find word boundaries
            let mut start = char_idx;
            while start > 0 && is_ident_char(line_text.as_bytes()[start - 1]) {
                start -= 1;
            }
            let mut end = char_idx;
            while end < line_text.len() && is_ident_char(line_text.as_bytes()[end]) {
                end += 1;
            }
            if start < end {
                return Some(line_text[start..end].to_string());
            }
        }
        current_line += 1;
    }
    None
}

fn is_ident_char(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'_'
}

// --- IPC Bridge Adapters ---

pub struct LspIpcReader {
    receiver: mpsc::Receiver<Vec<u8>>,
    buffer: Vec<u8>,
}

impl LspIpcReader {
    pub fn new(receiver: mpsc::Receiver<Vec<u8>>) -> Self {
        Self {
            receiver,
            buffer: Vec::new(),
        }
    }
}

impl AsyncRead for LspIpcReader {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<IoResult<()>> {
        if !self.buffer.is_empty() {
            let len = std::cmp::min(self.buffer.len(), buf.remaining());
            buf.put_slice(&self.buffer[..len]);
            self.buffer.drain(0..len);
            return Poll::Ready(Ok(()));
        }

        match Pin::new(&mut self.receiver).poll_recv(cx) {
            Poll::Ready(Some(data)) => {
                let len = std::cmp::min(data.len(), buf.remaining());
                buf.put_slice(&data[..len]);
                if len < data.len() {
                    self.buffer.extend_from_slice(&data[len..]);
                }
                Poll::Ready(Ok(()))
            }
            Poll::Ready(None) => Poll::Ready(Ok(())), // EOF
            Poll::Pending => Poll::Pending,
        }
    }
}

pub struct LspIpcWriter {
    app_handle: AppHandle,
}

impl LspIpcWriter {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }
}

impl AsyncWrite for LspIpcWriter {
    fn poll_write(
        self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<IoResult<usize>> {
        let payload = String::from_utf8_lossy(buf).to_string();
        if let Err(e) = self.app_handle.emit("lsp_server_to_client", payload) {
            eprintln!("Failed to emit LSP message to client: {}", e);
        }
        Poll::Ready(Ok(buf.len()))
    }

    fn poll_flush(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<IoResult<()>> {
        Poll::Ready(Ok(()))
    }

    fn poll_shutdown(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<IoResult<()>> {
        Poll::Ready(Ok(()))
    }
}

pub struct LspSender(pub tokio::sync::mpsc::Sender<Vec<u8>>);

#[tauri::command]
pub async fn lsp_client_to_server(
    payload: String,
    state: tauri::State<'_, LspSender>,
) -> std::result::Result<(), String> {
    state.0.send(payload.into_bytes()).await.map_err(|e| e.to_string())
}

pub fn spawn_lsp_server(app_handle: AppHandle) -> mpsc::Sender<Vec<u8>> {
    let (tx, rx) = mpsc::channel(100);
    
    let reader = LspIpcReader::new(rx);
    let writer = LspIpcWriter::new(app_handle.clone());

    tauri::async_runtime::spawn(async move {
        let (service, socket) = LspService::new(|client| RhaiLanguageServer { 
            client,
            documents: Arc::new(RwLock::new(HashMap::new())),
            builtins: Arc::new(RwLock::new(HashMap::new())),
            app_handle,
        });
        Server::new(reader, writer, socket)
            .serve(service)
            .await;
    });

    tx
}
