// chaosnexus-forge/src-tauri/src/nodes.rs
//
// Visual node graph registry for ChaosNexus Forge's "Assembly Line" canvas.
// Provides the built-in node type definitions (pins, templates, labels) that
// the frontend renders as draggable vhai nodes.

use serde::{Deserialize, Serialize};

/// A single input or output pin on a visual graph node.
///
/// Pins connect nodes together: *execution* pins define control-flow order,
/// while *data* pins carry typed values between nodes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodePin {
    /// Unique identifier for this pin within its parent node (e.g. `"exec_in"`).
    pub id: String,
    /// Human-readable label displayed next to the pin in the canvas UI.
    pub label: String,
    /// Pin category: `"Execution"` (control-flow) or `"Data"` (value-carrying).
    pub pin_type: String,
    /// Data type constraint for data pins (e.g. `"String"`, `"Int"`, `"Any"`).
    /// `None` for execution pins.
    pub data_type: Option<String>,
}

/// Definition of a visual node type available in the Assembly Line palette.
///
/// Each `NodeDef` describes one draggable node kind: its identity, display
/// label, input/output pins, and the Rhai code template that is emitted when
/// the graph is compiled to a script.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeDef {
    /// Machine-readable node type identifier (e.g. `"log_info"`, `"query_db"`).
    pub type_id: String,
    /// Human-friendly label shown on the node header in the canvas.
    pub label: String,
    /// Ordered list of input pins (execution + data) accepted by this node.
    pub inputs: Vec<NodePin>,
    /// Ordered list of output pins (execution + data) produced by this node.
    pub outputs: Vec<NodePin>,
    /// Rhai code template with `{{pin_id}}` placeholders replaced at compile time.
    pub template: String,
}

/// Returns the built-in node type registry shipped with ChaosNexus Forge.
///
/// This provides the default palette of nodes (`log_info`, `query_db`,
/// `webhook_send`) available on every new canvas before any user-defined or
/// plugin-contributed node types are loaded.
pub fn get_default_registry() -> Vec<NodeDef> {
    vec![
        NodeDef {
            type_id: "log_info".to_string(),
            label: "Log Info".to_string(),
            inputs: vec![
                NodePin {
                    id: "exec_in".to_string(),
                    label: "".to_string(),
                    pin_type: "Execution".to_string(),
                    data_type: None,
                },
                NodePin {
                    id: "message".to_string(),
                    label: "Message".to_string(),
                    pin_type: "Data".to_string(),
                    data_type: Some("String".to_string()),
                },
            ],
            outputs: vec![NodePin {
                id: "exec_out".to_string(),
                label: "".to_string(),
                pin_type: "Execution".to_string(),
                data_type: None,
            }],
            template: "log_info({{message}});".to_string(),
        },
        NodeDef {
            type_id: "query_db".to_string(),
            label: "Query DB".to_string(),
            inputs: vec![
                NodePin {
                    id: "exec_in".to_string(),
                    label: "".to_string(),
                    pin_type: "Execution".to_string(),
                    data_type: None,
                },
                NodePin {
                    id: "query".to_string(),
                    label: "Query".to_string(),
                    pin_type: "Data".to_string(),
                    data_type: Some("String".to_string()),
                },
            ],
            outputs: vec![
                NodePin {
                    id: "exec_out".to_string(),
                    label: "".to_string(),
                    pin_type: "Execution".to_string(),
                    data_type: None,
                },
                NodePin {
                    id: "results".to_string(),
                    label: "Results".to_string(),
                    pin_type: "Data".to_string(),
                    data_type: Some("Array".to_string()),
                },
            ],
            template: "let {{results}} = query_db({{query}});".to_string(),
        },
        NodeDef {
            type_id: "webhook_send".to_string(),
            label: "Send Webhook".to_string(),
            inputs: vec![
                NodePin {
                    id: "exec_in".to_string(),
                    label: "".to_string(),
                    pin_type: "Execution".to_string(),
                    data_type: None,
                },
                NodePin {
                    id: "url".to_string(),
                    label: "URL".to_string(),
                    pin_type: "Data".to_string(),
                    data_type: Some("String".to_string()),
                },
                NodePin {
                    id: "payload".to_string(),
                    label: "Payload".to_string(),
                    pin_type: "Data".to_string(),
                    data_type: Some("Map".to_string()),
                },
            ],
            outputs: vec![NodePin {
                id: "exec_out".to_string(),
                label: "".to_string(),
                pin_type: "Execution".to_string(),
                data_type: None,
            }],
            template: "webhook_send({{url}}, {{payload}});".to_string(),
        },
    ]
}
