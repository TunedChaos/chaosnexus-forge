// chaosnexus-forge/src-tauri/src/visualizer.rs
//
// Semantic Rhai → canvas converter for ChaosNexus Forge. Walks source with a
// block stack so if/else, for-each, and function lanes become typed nodes with
// true/false/item/completed exec wires (not a flat statement strip).

use chaosnexus_anvil::scripting::graph::canvas::{CanvasDocument, CanvasNode, CanvasWire};
use regex::Regex;
use std::sync::OnceLock;

/// Compiled regex for `fn name(` / `private fn name(` declarations.
fn fn_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^\s*(?:private\s+)?fn\s+([a-zA-Z_]\w*)\s*\(").unwrap())
}

/// Compiled regex for `for x in y` loops.
fn for_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"^\s*for\s+([a-zA-Z_]\w*)\s+in\s+(.+?)\s*\{?\s*$").unwrap()
    })
}

/// Compiled regex for `if cond` (not else-if).
fn if_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^\s*if\s+(.+?)\s*\{?\s*$").unwrap())
}

/// Compiled regex for `} else if cond {`.
fn else_if_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"^\s*\}\s*else\s+if\s+(.+?)\s*\{?\s*$").unwrap()
    })
}

/// Compiled regex for `} else {`.
fn else_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^\s*\}\s*else\s*\{?\s*$").unwrap())
}

/// Compiled regex for bare block close `}`.
fn close_brace_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^\s*\}\s*$").unwrap())
}

/// Compiled regex for `let name = expr` bindings.
fn let_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"^\s*let\s+([a-zA-Z_]\w*)\s*=\s*(.+?);?\s*$").unwrap()
    })
}

/// Compiled regex for simple assignments `name = expr`.
fn assign_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"^\s*([a-zA-Z_]\w*)\s*([+\-*/]?=)\s*(.+?);?\s*$").unwrap()
    })
}

/// Compiled regex for `return expr`.
fn return_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^\s*return\s+(.+?);?\s*$").unwrap())
}

/// Known native / plugin helpers surfaced as labeled function or script nodes.
fn native_call_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(
            r"\b(db_execute|db_query|fs_read|fs_read_string|fs_write|mcp_call_tool|http_get|http_post|run_command|run|log_info|log_error|log_warn|register_mcp_tool|load_config|sys_os|get_env|print|spawn_command)\b",
        )
        .unwrap()
    })
}

/// Generic `name(...)` call capture for labeling.
fn call_name_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\b([a-zA-Z_]\w*)\s*\(").unwrap())
}

/// Open control-flow frame on the block stack.
#[derive(Debug, Clone)]
enum BlockFrame {
    /// Plugin/lifecycle function body rooted at an event node.
    Function {
        /// Event node id that roots this function lane (retained for debugging).
        #[allow(dead_code)]
        event_id: String,
        chain_tail: Option<String>,
    },
    /// `if` / `else if` arm tracking.
    If {
        branch_id: String,
        /// Last node on the true arm (None until first statement).
        true_tail: Option<String>,
        /// Last node on the false arm.
        false_tail: Option<String>,
        /// Whether subsequent statements belong to the false arm.
        in_false: bool,
        /// True arm already received its first `true` edge from the branch.
        true_started: bool,
        /// False arm already received its first `false` edge from the branch.
        false_started: bool,
    },
    /// `for x in y` body.
    For {
        loop_id: String,
        body_tail: Option<String>,
        body_started: bool,
    },
}

/// Pending `let` lines coalesced into the next call node's script body.
#[derive(Debug, Clone)]
struct PendingLet {
    name: String,
    line: String,
}

/// True when a statement is part of MCP tool-name prefix stripping.
fn is_tool_name_normalize_line(trimmed: &str) -> bool {
    let t = trimmed.trim();
    t.contains("tool_name")
        || t.contains("prefix")
        || t.contains("legacy_prefix")
        || t.contains("starts_with")
        || t.contains("sub_string")
        || (t.starts_with("key =") || t.starts_with("let key"))
}

/// Mutable parse state for canvas generation.
#[derive(Debug)]
struct ParseState {
    nodes: Vec<CanvasNode>,
    edges: Vec<CanvasWire>,
    node_counter: usize,
    stack: Vec<BlockFrame>,
    pending_lets: Vec<PendingLet>,
    /// When true, accumulate tool-name prefix-strip lines into `normalize_buf`.
    folding_normalize: bool,
    normalize_buf: Vec<String>,
    /// Brace depth relative to fold start (for nested ifs inside the strip block).
    normalize_depth: i32,
}

impl ParseState {
    /// Allocates the next unique node id with the given prefix.
    fn next_id(&mut self, prefix: &str) -> String {
        self.node_counter += 1;
        format!("{}_{}", prefix, self.node_counter)
    }

    /// Adds an exec edge between two nodes.
    fn add_exec_edge(&mut self, source: &str, target: &str, source_handle: &str) {
        let edge_id = format!("wire_{}_{}_{}", source, target, source_handle);
        // Avoid duplicate identical wires from join fan-in.
        if self.edges.iter().any(|e| {
            e.source == source
                && e.target == target
                && e.source_handle.as_deref() == Some(source_handle)
        }) {
            return;
        }
        self.edges.push(CanvasWire {
            id: edge_id,
            source: source.to_string(),
            target: target.to_string(),
            source_handle: Some(source_handle.to_string()),
            target_handle: Some("exec_in".to_string()),
            kind: Some("exec".to_string()),
        });
    }

    /// Adds a data edge (e.g. items into for-each).
    fn add_data_edge(
        &mut self,
        source: &str,
        target: &str,
        source_handle: &str,
        target_handle: &str,
    ) {
        let edge_id = format!(
            "wire_data_{}_{}_{}_{}",
            source, target, source_handle, target_handle
        );
        self.edges.push(CanvasWire {
            id: edge_id,
            source: source.to_string(),
            target: target.to_string(),
            source_handle: Some(source_handle.to_string()),
            target_handle: Some(target_handle.to_string()),
            kind: Some("data".to_string()),
        });
    }

    /// Pushes a typed canvas node.
    fn push_node(&mut self, node: CanvasNode) {
        self.nodes.push(node);
    }

    /// Returns the kind of a node by id, if known.
    fn node_kind(&self, id: &str) -> Option<&str> {
        self.nodes
            .iter()
            .find(|n| n.id == id)
            .and_then(|n| n.kind.as_deref())
    }

    /// Default outbound handle for chaining from `source_id`.
    fn default_out_handle(&self, source_id: &str) -> &'static str {
        match self.node_kind(source_id) {
            Some("branch") => "true",
            Some("for-each") => "item",
            Some("event") => "then",
            // Catalog script / set-variable / function natives expose `exec_out`.
            _ => "exec_out",
        }
    }

    /// Wires `target` from the current block's chain tail (or control pin).
    fn link_from_current(&mut self, target: &str) {
        let link = self.take_link_info();
        if let Some((source, handle)) = link {
            self.add_exec_edge(&source, target, &handle);
        }
    }

    /// Computes (source, handle) for the next statement without mutating tails.
    fn peek_link_info(&self) -> Option<(String, String)> {
        let frame = self.stack.last()?;
        match frame {
            BlockFrame::Function { chain_tail, .. } => {
                let src = chain_tail.as_ref()?;
                Some((src.clone(), self.default_out_handle(src).to_string()))
            }
            BlockFrame::If {
                branch_id,
                true_tail,
                false_tail,
                in_false,
                true_started,
                false_started,
                ..
            } => {
                if *in_false {
                    if !*false_started {
                        Some((branch_id.clone(), "false".to_string()))
                    } else {
                        let src = false_tail.as_ref()?;
                        Some((src.clone(), self.default_out_handle(src).to_string()))
                    }
                } else if !*true_started {
                    Some((branch_id.clone(), "true".to_string()))
                } else {
                    let src = true_tail.as_ref()?;
                    Some((src.clone(), self.default_out_handle(src).to_string()))
                }
            }
            BlockFrame::For {
                loop_id,
                body_tail,
                body_started,
                ..
            } => {
                if !*body_started {
                    Some((loop_id.clone(), "item".to_string()))
                } else {
                    let src = body_tail.as_ref()?;
                    Some((src.clone(), self.default_out_handle(src).to_string()))
                }
            }
        }
    }

    /// Like peek, but marks arm/body as started when linking from control pins.
    fn take_link_info(&mut self) -> Option<(String, String)> {
        let info = self.peek_link_info()?;
        if let Some(frame) = self.stack.last_mut() {
            match frame {
                BlockFrame::If {
                    in_false,
                    true_started,
                    false_started,
                    ..
                } => {
                    if *in_false {
                        *false_started = true;
                    } else {
                        *true_started = true;
                    }
                }
                BlockFrame::For { body_started, .. } => {
                    *body_started = true;
                }
                _ => {}
            }
        }
        Some(info)
    }

    /// Updates the current block's chain tail after emitting `node_id`.
    fn set_chain_tail(&mut self, node_id: &str) {
        if let Some(frame) = self.stack.last_mut() {
            match frame {
                BlockFrame::Function { chain_tail, .. } => {
                    *chain_tail = Some(node_id.to_string());
                }
                BlockFrame::If {
                    true_tail,
                    false_tail,
                    in_false,
                    ..
                } => {
                    if *in_false {
                        *false_tail = Some(node_id.to_string());
                    } else {
                        *true_tail = Some(node_id.to_string());
                    }
                }
                BlockFrame::For { body_tail, .. } => {
                    *body_tail = Some(node_id.to_string());
                }
            }
        }
    }

}

/// Builds a blank CanvasNode skeleton with required fields.
fn base_node(id: String, label: String, kind: &str) -> CanvasNode {
    CanvasNode {
        id,
        label,
        r#fn: None,
        kind: Some(kind.to_string()),
        r#type: None,
        value: None,
        value_type: None,
        pins: None,
        script_body: None,
        operator_id: None,
        var_name: None,
        event_id: None,
    }
}

/// Strips a trailing `{` from a condition / expression fragment.
fn strip_trailing_brace(s: &str) -> String {
    s.trim()
        .trim_end_matches('{')
        .trim()
        .trim_end_matches(';')
        .trim()
        .to_string()
}

/// True when a `let` is scaffolding that should fold into a following call.
fn is_scaffolding_let(name: &str, line: &str) -> bool {
    matches!(name, "desc" | "schema_str" | "schema")
        || line.contains("schema")
        || (name == "desc" && line.contains("description"))
}

/// Short label for a statement / expression.
fn label_for_expr(expr: &str) -> String {
    let t = strip_trailing_brace(expr);
    if t.len() <= 48 {
        return t;
    }
    format!("{}…", &t[..45])
}

/// Extracts a call name from an expression when present.
fn extract_call_name(expr: &str) -> Option<String> {
    if let Some(caps) = native_call_regex().captures(expr) {
        return Some(caps.get(1)?.as_str().to_string());
    }
    // Prefer the rightmost/outer call-ish token for `let x = foo(...)`.
    call_name_regex()
        .captures_iter(expr)
        .last()
        .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
        .filter(|n| {
            !matches!(
                n.as_str(),
                "if" | "for" | "let" | "fn" | "return" | "else" | "while"
            )
        })
}

/// Flushes pending scaffolding lets into a script_body string prefix.
fn flush_pending_body(pending: &mut Vec<PendingLet>) -> Option<String> {
    if pending.is_empty() {
        return None;
    }
    let body = pending
        .drain(..)
        .map(|p| p.line)
        .collect::<Vec<_>>()
        .join("\n");
    Some(body)
}

/// Generates a semantic visual canvas from Rhai source (editable, not display-only).
pub fn generate_visual_canvas(source: &str) -> CanvasDocument {
    let mut state = ParseState {
        nodes: Vec::new(),
        edges: Vec::new(),
        node_counter: 0,
        stack: Vec::new(),
        pending_lets: Vec::new(),
        folding_normalize: false,
        normalize_buf: Vec::new(),
        normalize_depth: 0,
    };

    state.push_node(CanvasNode {
        id: "main_group".to_string(),
        label: "Main Logic".to_string(),
        r#fn: None,
        kind: None,
        r#type: Some("group".to_string()),
        value: None,
        value_type: None,
        pins: None,
        script_body: None,
        operator_id: None,
        var_name: None,
        event_id: None,
    });

    // Multi-source join: when an if closes, the next statement should fan-in
    // from true_tail and false (or false_tail).
    let mut pending_join_sources: Vec<(String, String)> = Vec::new();

    let lines: Vec<&str> = source.lines().collect();
    let mut i = 0;
    while i < lines.len() {
        let trimmed = lines[i].trim();
        i += 1;

        if trimmed.is_empty() || trimmed.starts_with("//") {
            continue;
        }

        // Mid-parse fold: absorb tool-name prefix stripping into one script node.
        if state.folding_normalize {
            let opens = trimmed.matches('{').count() as i32;
            let closes = trimmed.matches('}').count() as i32;
            if is_tool_name_normalize_line(trimmed)
                || state.normalize_depth > 0
                || trimmed == "}"
                || trimmed.starts_with("} else")
            {
                state.normalize_buf.push(trimmed.to_string());
                state.normalize_depth += opens - closes;
                if state.normalize_depth < 0 {
                    state.normalize_depth = 0;
                }
                continue;
            }
            flush_normalize_fold(&mut state, &mut pending_join_sources);
            // Fall through to process the current non-normalize line.
        } else if trimmed.starts_with("let key = tool_name")
            || trimmed.starts_with("let key=tool_name")
        {
            state.folding_normalize = true;
            state.normalize_depth = 0;
            state.normalize_buf.push(if trimmed.ends_with(';') {
                trimmed.to_string()
            } else {
                format!("{};", trimmed)
            });
            continue;
        }

        // Function declaration
        if let Some(caps) = fn_regex().captures(trimmed) {
            // Close any dangling frames (malformed source).
            state.stack.clear();
            pending_join_sources.clear();
            state.pending_lets.clear();

            let fn_name = caps.get(1).unwrap().as_str().to_string();
            let event_id = state.next_id("evt");
            let mut node = base_node(event_id.clone(), fn_name.clone(), "event");
            node.event_id = Some(fn_name);
            state.push_node(node);
            state.stack.push(BlockFrame::Function {
                event_id: event_id.clone(),
                chain_tail: Some(event_id),
            });
            continue;
        }

        if state.stack.is_empty() {
            continue;
        }

        // `} else if cond {`
        if let Some(caps) = else_if_regex().captures(trimmed) {
            flush_pending_as_script(&mut state, &mut pending_join_sources);
            let cond = strip_trailing_brace(caps.get(1).unwrap().as_str());
            // Pop the current if frame first so we can mutate `state` freely.
            let prev_branch = match state.stack.last() {
                Some(BlockFrame::If { branch_id, .. }) => Some(branch_id.clone()),
                _ => None,
            };
            if let Some(prev_branch) = prev_branch {
                state.stack.pop();
                let new_id = state.next_id("br");
                let node = base_node(new_id.clone(), cond, "branch");
                // else-if sits on the false path of the preceding branch.
                state.add_exec_edge(&prev_branch, &new_id, "false");
                state.push_node(node);
                state.stack.push(BlockFrame::If {
                    branch_id: new_id,
                    true_tail: None,
                    false_tail: None,
                    in_false: false,
                    true_started: false,
                    false_started: false,
                });
            }
            continue;
        }

        // `} else {`
        if else_regex().is_match(trimmed) {
            flush_pending_as_script(&mut state, &mut pending_join_sources);
            if let Some(BlockFrame::If { in_false, .. }) = state.stack.last_mut() {
                *in_false = true;
            }
            continue;
        }

        // Bare `}`
        if close_brace_regex().is_match(trimmed) {
            flush_pending_as_script(&mut state, &mut pending_join_sources);
            if let Some(frame) = state.stack.pop() {
                match frame {
                    BlockFrame::Function { .. } => {
                        pending_join_sources.clear();
                    }
                    BlockFrame::If {
                        branch_id,
                        true_tail,
                        false_tail,
                        false_started,
                        ..
                    } => {
                        let mut joins: Vec<(String, String)> = Vec::new();
                        if let Some(t) = true_tail {
                            let handle = match state.node_kind(&t) {
                                Some("for-each") => "completed",
                                Some("branch") => "false",
                                Some("event") => "then",
                                _ => "exec_out",
                            };
                            joins.push((t, handle.to_string()));
                        }
                        if let Some(f) = false_tail {
                            let handle = match state.node_kind(&f) {
                                Some("for-each") => "completed",
                                Some("branch") => "false",
                                Some("event") => "then",
                                _ => "exec_out",
                            };
                            joins.push((f, handle.to_string()));
                        } else if !false_started {
                            // Implicit else: false pin participates in join.
                            joins.push((branch_id, "false".to_string()));
                        }
                        pending_join_sources = joins;
                        // Parent chain_tail is stale until next statement consumes joins.
                        if let Some(BlockFrame::Function { chain_tail, .. }) =
                            state.stack.last_mut()
                        {
                            *chain_tail = None;
                        }
                    }
                    BlockFrame::For { loop_id, .. } => {
                        pending_join_sources = vec![(loop_id, "completed".to_string())];
                        if let Some(BlockFrame::Function { chain_tail, .. }) =
                            state.stack.last_mut()
                        {
                            *chain_tail = None;
                        } else if let Some(BlockFrame::If {
                            true_tail,
                            false_tail,
                            in_false,
                            ..
                        }) = state.stack.last_mut()
                        {
                            // For nested in if: completed becomes the arm tail later.
                            if *in_false {
                                *false_tail = None;
                            } else {
                                *true_tail = None;
                            }
                        }
                    }
                }
            }
            continue;
        }

        // `for x in y`
        if let Some(caps) = for_regex().captures(trimmed) {
            flush_pending_as_script(&mut state, &mut pending_join_sources);
            let items_expr = strip_trailing_brace(caps.get(2).unwrap().as_str());
            let loop_id = state.next_id("loop");
            let mut node = base_node(loop_id.clone(), "For Each".to_string(), "for-each");
            node.r#fn = Some("For Each".to_string());
            wire_new_node(&mut state, &mut pending_join_sources, &loop_id);
            state.push_node(node);

            // Optional data edge from previous producer labeled with items expr.
            if let Some(prev) = find_items_producer(&state, &items_expr) {
                // Only script nodes expose a `return` data pin in the catalog.
                if state.node_kind(&prev) == Some("script") {
                    state.add_data_edge(&prev, &loop_id, "return", "items");
                }
            }

            state.set_chain_tail(&loop_id);
            state.stack.push(BlockFrame::For {
                loop_id,
                body_tail: None,
                body_started: false,
            });
            continue;
        }

        // `if cond`
        if let Some(caps) = if_regex().captures(trimmed) {
            // Avoid matching `else if` already handled; also skip `if` inside
            // identifiers by requiring line-start match (regex already ^).
            if trimmed.starts_with("else") {
                continue;
            }
            flush_pending_as_script(&mut state, &mut pending_join_sources);
            let cond = strip_trailing_brace(caps.get(1).unwrap().as_str());
            let branch_id = state.next_id("br");
            let node = base_node(branch_id.clone(), cond, "branch");
            wire_new_node(&mut state, &mut pending_join_sources, &branch_id);
            state.push_node(node);
            state.set_chain_tail(&branch_id);
            state.stack.push(BlockFrame::If {
                branch_id,
                true_tail: None,
                false_tail: None,
                in_false: false,
                true_started: false,
                false_started: false,
            });
            continue;
        }

        // `return expr`
        if let Some(caps) = return_regex().captures(trimmed) {
            let expr = strip_trailing_brace(caps.get(1).unwrap().as_str());
            let call = extract_call_name(&expr);
            let id = state.next_id("scr");
            let label = call
                .clone()
                .unwrap_or_else(|| label_for_expr(&format!("return {}", expr)));
            let mut node = base_node(id.clone(), label, "script");
            if let Some(c) = call {
                if native_call_regex().is_match(&c) {
                    node.r#fn = Some(c);
                }
            }
            let mut body = flush_pending_body(&mut state.pending_lets).unwrap_or_default();
            if !body.is_empty() {
                body.push('\n');
            }
            body.push_str(trimmed.trim_end_matches(';'));
            if !body.ends_with(';') {
                body.push(';');
            }
            node.script_body = Some(body);
            wire_new_node(&mut state, &mut pending_join_sources, &id);
            state.push_node(node);
            state.set_chain_tail(&id);
            continue;
        }

        // `let name = expr`
        if let Some(caps) = let_regex().captures(trimmed) {
            let name = caps.get(1).unwrap().as_str().to_string();
            let expr = strip_trailing_brace(caps.get(2).unwrap().as_str());
            let line = if trimmed.ends_with(';') {
                trimmed.to_string()
            } else {
                format!("{};", trimmed)
            };

            // Scaffolding lets coalesce into the next call.
            if is_scaffolding_let(&name, &line) {
                state.pending_lets.push(PendingLet { name, line });
                continue;
            }

            // Prefer call-labeled script when RHS is a notable call.
            if let Some(call) = extract_call_name(&expr) {
                if native_call_regex().is_match(&call) || looks_meaningful_call(&call, &expr) {
                    flush_pending_as_script(&mut state, &mut pending_join_sources);
                    let id = state.next_id("scr");
                    // Prefer short native call names (load_config) over full call exprs.
                    let label = if native_call_regex().is_match(&call) {
                        call.clone()
                    } else if expr.contains('.') {
                        label_for_expr(&expr)
                    } else {
                        call.clone()
                    };
                    let mut node = base_node(id.clone(), label, "script");
                    if native_call_regex().is_match(&call) {
                        node.r#fn = Some(call);
                    }
                    let mut body = flush_pending_body(&mut state.pending_lets).unwrap_or_default();
                    if !body.is_empty() {
                        body.push('\n');
                    }
                    body.push_str(&line);
                    node.script_body = Some(body);
                    wire_new_node(&mut state, &mut pending_join_sources, &id);
                    state.push_node(node);
                    state.set_chain_tail(&id);
                    continue;
                }
            }

            // Simple set-variable for plain lets.
            flush_pending_as_script(&mut state, &mut pending_join_sources);
            let id = state.next_id("set");
            let mut node = base_node(id.clone(), format!("Set {}", name), "set-variable");
            node.var_name = Some(name);
            node.script_body = Some(line);
            wire_new_node(&mut state, &mut pending_join_sources, &id);
            state.push_node(node);
            state.set_chain_tail(&id);
            continue;
        }

        // Assignment `name =` / `name +=`
        if let Some(caps) = assign_regex().captures(trimmed) {
            let name = caps.get(1).unwrap().as_str().to_string();
            let op = caps.get(2).unwrap().as_str();
            let expr = strip_trailing_brace(caps.get(3).unwrap().as_str());
            flush_pending_as_script(&mut state, &mut pending_join_sources);

            let id = state.next_id("scr");
            let label = if op == "+=" {
                format!("{} += {}", name, label_for_expr(&expr))
            } else if expr.contains('.') {
                // Prefer assignment form over bare method name (avoids "len" nodes).
                format!("{} = {}", name, label_for_expr(&expr))
            } else if let Some(call) = extract_call_name(&expr) {
                if native_call_regex().is_match(&call) {
                    call
                } else {
                    format!("{} = {}", name, label_for_expr(&expr))
                }
            } else {
                format!("{} = {}", name, label_for_expr(&expr))
            };
            let mut node = base_node(id.clone(), label, "script");
            let line = if trimmed.ends_with(';') {
                trimmed.to_string()
            } else {
                format!("{};", trimmed)
            };
            node.script_body = Some(line);
            if op == "=" && extract_call_name(&expr).is_none() && expr.len() < 40 {
                node.kind = Some("set-variable".to_string());
                node.var_name = Some(name);
                node.label = format!("Set {}", node.var_name.as_ref().unwrap());
            }
            wire_new_node(&mut state, &mut pending_join_sources, &id);
            state.push_node(node);
            state.set_chain_tail(&id);
            continue;
        }

        // Standalone call / other statement
        if trimmed.starts_with('}') || trimmed.starts_with('{') {
            continue;
        }

        // Fold any scaffolding `let`s into this call's script_body (do NOT
        // flush_pending_as_script here — that would re-split desc/schema nodes).
        let id = state.next_id("scr");
        let call = extract_call_name(trimmed);
        let label = call
            .clone()
            .unwrap_or_else(|| label_for_expr(trimmed));
        let mut node = base_node(id.clone(), label, "script");
        if let Some(ref c) = call {
            if native_call_regex().is_match(c) {
                node.r#fn = Some(c.clone());
                // register_mcp_tool etc. as function kind when native.
                if matches!(
                    c.as_str(),
                    "register_mcp_tool" | "db_execute" | "db_query" | "http_get" | "http_post"
                ) {
                    // Keep kind=script so catalog exec_in/exec_out pins exist
                    // (codeNativeNode has data pins only and drops exec wires).
                    node.kind = Some("script".to_string());
                    node.r#fn = Some(c.clone());
                }
            }
        }
        let mut body = flush_pending_body(&mut state.pending_lets).unwrap_or_default();
        if !body.is_empty() {
            body.push('\n');
        }
        let line = if trimmed.ends_with(';') {
            trimmed.to_string()
        } else {
            format!("{};", trimmed)
        };
        body.push_str(&line);
        node.script_body = Some(body);
        wire_new_node(&mut state, &mut pending_join_sources, &id);
        state.push_node(node);
        state.set_chain_tail(&id);
    }

    let doc = CanvasDocument {
        version: Some(3),
        nodes: state.nodes,
        edges: state.edges,
    };
    compact_tool_name_normalize(doc)
}

/// Folds linear tool-name prefix-stripping chains into one script node so the
/// execute lane matches curated illustration density (Screenshot 1).
fn compact_tool_name_normalize(mut doc: CanvasDocument) -> CanvasDocument {
    use std::collections::{HashMap, HashSet};

    let strip_ids: Vec<String> = doc
        .nodes
        .iter()
        .filter(|n| {
            let kind = n.kind.as_deref().unwrap_or("");
            if !matches!(kind, "script" | "set-variable" | "branch") {
                return false;
            }
            let blob = format!(
                "{} {}",
                n.label,
                n.script_body.as_deref().unwrap_or("")
            );
            is_tool_name_normalize_line(&blob)
        })
        .map(|n| n.id.clone())
        .collect();

    if strip_ids.len() < 3 {
        return doc;
    }

    let mut outs: HashMap<String, Vec<String>> = HashMap::new();
    let mut inns: HashMap<String, Vec<String>> = HashMap::new();
    for e in &doc.edges {
        if e.kind.as_deref() == Some("data") {
            continue;
        }
        outs.entry(e.source.clone())
            .or_default()
            .push(e.target.clone());
        inns.entry(e.target.clone())
            .or_default()
            .push(e.source.clone());
    }

    let strip_set: HashSet<_> = strip_ids.iter().cloned().collect();
    let mut consumed = HashSet::new();

    for start in &strip_ids {
        if consumed.contains(start) {
            continue;
        }
        let mut head = start.clone();
        while let Some(preds) = inns.get(&head) {
            if preds.len() != 1 {
                break;
            }
            let p = &preds[0];
            if !strip_set.contains(p) || consumed.contains(p) {
                break;
            }
            if outs.get(p).map(|v| v.len()).unwrap_or(0) != 1 {
                break;
            }
            head = p.clone();
        }

        let mut run = vec![head.clone()];
        let mut cur = head;
        while let Some(nexts) = outs.get(&cur) {
            if nexts.len() != 1 {
                break;
            }
            let n = &nexts[0];
            if !strip_set.contains(n) {
                break;
            }
            if inns.get(n).map(|v| v.len()).unwrap_or(0) != 1 {
                break;
            }
            run.push(n.clone());
            cur = n.clone();
        }

        if run.len() < 3 {
            continue;
        }

        let keep_id = run[0].clone();
        let last_id = run[run.len() - 1].clone();
        let remove_ids: Vec<String> = run.iter().skip(1).cloned().collect();
        for id in &run {
            consumed.insert(id.clone());
        }

        let mut body_parts: Vec<String> = Vec::new();
        for id in &run {
            if let Some(n) = doc.nodes.iter().find(|n| n.id == *id) {
                if let Some(b) = &n.script_body {
                    body_parts.push(b.clone());
                } else if n.kind.as_deref() == Some("branch") {
                    body_parts.push(format!("if {} {{ … }}", n.label));
                }
            }
        }

        let outbound: Vec<(String, Option<String>, Option<String>, Option<String>)> = doc
            .edges
            .iter()
            .filter(|e| e.source == last_id)
            .map(|e| {
                (
                    e.target.clone(),
                    e.source_handle.clone(),
                    e.target_handle.clone(),
                    e.kind.clone(),
                )
            })
            .collect();

        let remove_set: HashSet<_> = remove_ids.iter().cloned().collect();
        doc.edges
            .retain(|e| !remove_set.contains(&e.source) && !remove_set.contains(&e.target));

        if let Some(keep) = doc.nodes.iter_mut().find(|n| n.id == keep_id) {
            keep.kind = Some("script".to_string());
            keep.label = "normalize tool_name".to_string();
            keep.var_name = None;
            keep.r#fn = None;
            keep.r#type = None;
            keep.script_body = Some(body_parts.join("\n"));
        }

        for (target, _sh, th, kind) in outbound {
            if remove_set.contains(&target) || target == keep_id {
                continue;
            }
            // Avoid duplicate edges.
            if doc
                .edges
                .iter()
                .any(|e| e.source == keep_id && e.target == target)
            {
                continue;
            }
            doc.edges.push(CanvasWire {
                id: format!("wire_{}_{}_exec_out", keep_id, target),
                source: keep_id.clone(),
                target,
                source_handle: Some("exec_out".to_string()),
                target_handle: th.or_else(|| Some("exec_in".to_string())),
                kind: kind.or_else(|| Some("exec".to_string())),
            });
        }

        doc.nodes.retain(|n| !remove_set.contains(&n.id));
    }

    doc
}

/// Wires a newly created node from pending joins or the current chain tail.
fn wire_new_node(
    state: &mut ParseState,
    pending_join_sources: &mut Vec<(String, String)>,
    target: &str,
) {
    if !pending_join_sources.is_empty() {
        let sources = std::mem::take(pending_join_sources);
        for (src, handle) in sources {
            state.add_exec_edge(&src, target, &handle);
        }
        // Also mark current frame tails as this node.
        return;
    }
    state.link_from_current(target);
}

/// Flushes a buffered tool-name normalization sequence as a single script node.
fn flush_normalize_fold(
    state: &mut ParseState,
    pending_join_sources: &mut Vec<(String, String)>,
) {
    if !state.folding_normalize || state.normalize_buf.is_empty() {
        state.folding_normalize = false;
        state.normalize_buf.clear();
        state.normalize_depth = 0;
        return;
    }
    let body = state.normalize_buf.join("\n");
    state.normalize_buf.clear();
    state.folding_normalize = false;
    state.normalize_depth = 0;
    let id = state.next_id("scr");
    let mut node = base_node(id.clone(), "normalize tool_name".to_string(), "script");
    node.script_body = Some(body);
    wire_new_node(state, pending_join_sources, &id);
    state.push_node(node);
    state.set_chain_tail(&id);
}

/// Flushes non-scaffolding pending lets as individual set/script nodes.
fn flush_pending_as_script(
    state: &mut ParseState,
    pending_join_sources: &mut Vec<(String, String)>,
) {
    if state.pending_lets.is_empty() {
        return;
    }
    let pending = std::mem::take(&mut state.pending_lets);
    for p in pending {
        let id = state.next_id("set");
        let mut node = base_node(id.clone(), format!("Set {}", p.name), "set-variable");
        node.var_name = Some(p.name);
        node.script_body = Some(p.line);
        wire_new_node(state, pending_join_sources, &id);
        state.push_node(node);
        state.set_chain_tail(&id);
    }
}

/// Heuristic: RHS call is worth a labeled script node (not a bare Set).
fn looks_meaningful_call(call: &str, expr: &str) -> bool {
    if expr.contains('.') && expr.contains('(') {
        return true;
    }
    matches!(
        call,
        "keys" | "contains" | "starts_with" | "sub_string" | "len"
    )
}

/// Finds a prior script/set node whose body or label mentions the items expr.
fn find_items_producer(state: &ParseState, items_expr: &str) -> Option<String> {
    let needle = items_expr.trim();
    // `keys` alone → prefer node that assigned/produced keys.
    for node in state.nodes.iter().rev() {
        if node.r#type.as_deref() == Some("group") {
            continue;
        }
        if let Some(body) = &node.script_body {
            if body.contains(needle) || (needle == "keys" && body.contains(".keys()")) {
                return Some(node.id.clone());
            }
        }
        if node.label.contains(needle) || node.label.contains("keys()") {
            return Some(node.id.clone());
        }
        if let Some(v) = &node.var_name {
            if v == needle {
                return Some(node.id.clone());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_if_else_wires_true_and_false() {
        let src = r#"
            fn on_plugin_start() {
                log_info("Starting...");
                let data = fs_read_string("test.txt");
                if data == "ok" {
                    db_execute("INSERT");
                } else {
                    log_warn("failed");
                }
            }
        "#;
        let doc = generate_visual_canvas(src);
        assert!(doc.nodes.len() > 2);
        assert!(!doc.edges.is_empty());

        let branch = doc
            .nodes
            .iter()
            .find(|n| n.kind.as_deref() == Some("branch"))
            .expect("branch node");
        assert!(branch.label.contains("data == \"ok\"") || branch.label.contains("ok"));

        let true_edge = doc.edges.iter().any(|e| {
            e.source == branch.id && e.source_handle.as_deref() == Some("true")
        });
        let false_edge = doc.edges.iter().any(|e| {
            e.source == branch.id && e.source_handle.as_deref() == Some("false")
        });
        assert!(true_edge, "expected true exec edge from branch");
        assert!(false_edge, "expected false exec edge from branch");
    }

    #[test]
    fn test_for_each_emits_loop_node() {
        let src = r#"
            fn on_plugin_start() {
                let keys = cfg.commands.keys();
                for key in keys {
                    register_mcp_tool(PLUGIN_NAME, key, desc, schema_str);
                }
            }
        "#;
        let doc = generate_visual_canvas(src);
        let loop_node = doc
            .nodes
            .iter()
            .find(|n| n.kind.as_deref() == Some("for-each"))
            .expect("for-each node");
        assert_eq!(loop_node.label, "For Each");

        let item_edge = doc.edges.iter().any(|e| {
            e.source == loop_node.id && e.source_handle.as_deref() == Some("item")
        });
        assert!(item_edge, "expected item edge into loop body");
    }

    #[test]
    fn test_terminal_tool_has_three_event_lanes_and_false_edges() {
        let src = include_str!(
            "../../../chaosnexus-scripts/plugins/terminal/terminal_tool.rhai"
        );
        let doc = generate_visual_canvas(src);

        let events: Vec<_> = doc
            .nodes
            .iter()
            .filter(|n| n.kind.as_deref() == Some("event"))
            .collect();
        assert_eq!(events.len(), 3, "expected three lifecycle events");

        let labels: Vec<&str> = events.iter().map(|e| e.label.as_str()).collect();
        assert!(labels.contains(&"on_plugin_start"));
        assert!(labels.contains(&"on_all_plugins_loaded"));
        assert!(labels.contains(&"execute"));

        assert!(
            doc.nodes
                .iter()
                .any(|n| n.label.contains("load_config") || n.r#fn.as_deref() == Some("load_config")),
            "expected load_config node"
        );
        assert!(
            doc.nodes
                .iter()
                .any(|n| n.kind.as_deref() == Some("for-each")),
            "expected for-each"
        );
        assert!(
            doc.nodes.iter().any(|n| {
                n.label.contains("register_mcp_tool")
                    || n.r#fn.as_deref() == Some("register_mcp_tool")
            }),
            "expected register_mcp_tool"
        );
        assert!(
            doc.nodes.iter().any(|n| n.label.contains("args.contains")),
            "expected args.contains branch label"
        );
        assert!(
            doc.nodes.iter().any(|n| {
                n.label.contains("run_command") || n.r#fn.as_deref() == Some("run_command")
            }),
            "expected run_command"
        );

        let false_edges = doc
            .edges
            .iter()
            .filter(|e| e.source_handle.as_deref() == Some("false"))
            .count();
        assert!(
            false_edges >= 1,
            "expected at least one false branch edge, got {}",
            false_edges
        );

        // Must not explode into one node per punctuation — keep under ~45 leaves.
        let leaves = doc
            .nodes
            .iter()
            .filter(|n| n.r#type.as_deref() != Some("group"))
            .count();
        assert!(
            leaves < 45,
            "too many leaf nodes ({}); coalescing failed",
            leaves
        );
    }

    #[test]
    fn test_labels_not_generic_script_snippet() {
        let src = r#"
            fn execute(tool_name, args) {
                let cfg = load_config(PLUGIN_NAME, "config.toml");
                let os = sys_os();
                if os == "windows" {
                    shell = "powershell";
                }
                return run_command(shell, full_cmd);
            }
        "#;
        let doc = generate_visual_canvas(src);
        for n in &doc.nodes {
            if n.r#type.as_deref() == Some("group") {
                continue;
            }
            assert_ne!(n.label, "script snippet");
            assert_ne!(n.label, "if condition");
        }
    }
}
