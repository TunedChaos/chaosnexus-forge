// chaosnexus-anvil/src/scripting/graph/visualizer.rs
use chaosnexus_anvil::scripting::graph::canvas::{CanvasDocument, CanvasNode, CanvasWire};
use regex::Regex;
use std::sync::OnceLock;

/// Returns a compiled regular expression for detecting function declarations.
fn fn_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^\s*(?:private\s+)?fn\s+([a-zA-Z_]\w*)\s*\(").unwrap())
}

/// Returns a compiled regular expression for detecting the start of a block (`{`).
fn block_start_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\{").unwrap())
}

/// Returns a compiled regular expression for detecting the end of a block (`}`).
fn block_end_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\}").unwrap())
}

/// Returns a compiled regular expression for detecting `if` statements.
fn if_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\bif\s+").unwrap())
}


/// Returns a compiled regular expression for detecting native function calls.
fn native_call_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"\b(db_execute|db_query|fs_read|fs_read_string|fs_write|mcp_call_tool|http_get|http_post|run|log_info|log_error|log_warn|register_mcp_tool)\b").unwrap()
    })
}

/// Maintains state during the visual canvas generation process.
#[derive(Debug)]
struct ParseState {
    nodes: Vec<CanvasNode>,
    edges: Vec<CanvasWire>,
    node_counter: usize,
}

impl ParseState {
    /// Generates the next unique node ID based on a prefix.
    fn next_id(&mut self, prefix: &str) -> String {
        self.node_counter += 1;
        format!("{}_{}", prefix, self.node_counter)
    }

    /// Adds a new execution edge between two nodes to the canvas state.
    fn add_edge(&mut self, source: &str, target: &str, source_handle: Option<&str>) {
        let edge_id = format!("wire_{}_{}", source, target);
        self.edges.push(CanvasWire {
            id: edge_id,
            source: source.to_string(),
            target: target.to_string(),
            source_handle: source_handle.map(|s| s.to_string()),
            target_handle: Some("exec_in".to_string()),
            kind: Some("exec".to_string()),
        });
    }
}

/// Generates an illustrative visual canvas based on the naive analysis of the provided Rhai source code.
pub fn generate_visual_canvas(source: &str) -> CanvasDocument {
    let mut state = ParseState {
        nodes: Vec::new(),
        edges: Vec::new(),
        node_counter: 0,
    };

    // Add main group
    state.nodes.push(CanvasNode {
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

    let mut current_fn: Option<String> = None;
    let mut current_chain_tail: Option<String> = None;
    let mut brace_depth = 0;
    
    // Very naive line-by-line scanning (sufficient for illustrative visual sidecars)
    let lines: Vec<&str> = source.lines().collect();
    

    for line in lines {
        let trimmed = line.trim();
        if trimmed.starts_with("//") || trimmed.is_empty() {
            continue;
        }

        // Detect function start
        if let Some(caps) = fn_regex().captures(trimmed) {
            let fn_name = caps.get(1).unwrap().as_str().to_string();
            current_fn = Some(fn_name.clone());
            brace_depth = 0;
            
            

            let event_id = state.next_id("evt");
            state.nodes.push(CanvasNode {
                id: event_id.clone(),
                label: fn_name.clone(),
                r#fn: None,
                kind: Some("event".to_string()),
                r#type: None,
                value: None,
                value_type: None,
                pins: None,
                script_body: None,
                operator_id: None,
                var_name: None,
                event_id: Some(fn_name.clone()),
            });
            
            current_chain_tail = Some(event_id);
        }

        // Count braces for basic block tracking
        let opens = block_start_regex().find_iter(trimmed).count();
        let closes = block_end_regex().find_iter(trimmed).count();
        
        if current_fn.is_some() {
            brace_depth += opens;
            brace_depth -= closes;

            // Generate nodes for interesting things inside the function
            if opens == 0 && closes == 0 || (opens > 0 && brace_depth > 0) {
                // Check if it's an if-branch
                if if_regex().is_match(trimmed) {
                    let branch_id = state.next_id("br");
                    state.nodes.push(CanvasNode {
                        id: branch_id.clone(),
                        label: "if condition".to_string(),
                        r#fn: None,
                        kind: Some("branch".to_string()),
                        r#type: None,
                        value: None,
                        value_type: None,
                        pins: None,
                        script_body: None,
                        operator_id: None,
                        var_name: None,
                        event_id: None,
                    });
                    
                    if let Some(tail) = &current_chain_tail {
                        state.add_edge(tail, &branch_id, Some("then"));
                    }
                    current_chain_tail = Some(branch_id);
                } else if let Some(caps) = native_call_regex().captures(trimmed) {
                    let func = caps.get(1).unwrap().as_str().to_string();
                    let fn_id = state.next_id("fn");
                    state.nodes.push(CanvasNode {
                        id: fn_id.clone(),
                        label: func.clone(),
                        r#fn: Some(func),
                        kind: Some("function".to_string()),
                        r#type: Some("codeNativeNode".to_string()),
                        value: None,
                        value_type: None,
                        pins: None,
                        script_body: None,
                        operator_id: None,
                        var_name: None,
                        event_id: None,
                    });

                    if let Some(tail) = &current_chain_tail {
                        let source_handle = if state.nodes.iter().any(|n| n.id == *tail && n.kind.as_deref() == Some("branch")) {
                            Some("true")
                        } else {
                            Some("then")
                        };
                        state.add_edge(tail, &fn_id, source_handle);
                    }
                    current_chain_tail = Some(fn_id);
                } else if !trimmed.starts_with("fn ") && !trimmed.starts_with("private fn ") && !trimmed.starts_with("}") && !trimmed.starts_with("{") && !trimmed.starts_with("else") {
                    // Generic script block for other operations
                    let scr_id = state.next_id("scr");
                    state.nodes.push(CanvasNode {
                        id: scr_id.clone(),
                        label: "script snippet".to_string(),
                        r#fn: None,
                        kind: Some("script".to_string()),
                        r#type: None,
                        value: None,
                        value_type: None,
                        pins: None,
                        script_body: Some(trimmed.to_string()),
                        operator_id: None,
                        var_name: None,
                        event_id: None,
                    });

                    if let Some(tail) = &current_chain_tail {
                        let source_handle = if state.nodes.iter().any(|n| n.id == *tail && n.kind.as_deref() == Some("branch")) {
                            Some("true")
                        } else {
                            Some("then")
                        };
                        state.add_edge(tail, &scr_id, source_handle);
                    }
                    current_chain_tail = Some(scr_id);
                }
            }

            if brace_depth == 0 {
                // End of function
                current_fn = None;
                current_chain_tail = None;
            }
        }
    }

    CanvasDocument {
        version: Some(3),
        nodes: state.nodes,
        edges: state.edges,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_regex_parser() {
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
    }
}
