// chaosnexus-forge/src-tauri/src/plugin_toml.rs
//
// Read/write helpers for plugin.toml, focused on the `[dependencies]` load-order
// contract shared with ChaosNexus Anvil's topological resolver.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Parsed representation of a `plugin.toml` document.
///
/// This struct enables round-trip editing of plugin metadata while
/// normalizing the `dependencies` field from both array and legacy
/// empty-table representations.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PluginTomlDoc {
    /// Plugin display name.
    pub name: Option<String>,
    /// Semantic version string (e.g. `"0.1.0"`).
    pub version: Option<String>,
    /// Author or maintainer name.
    pub author: Option<String>,
    /// Human-readable description of the plugin's purpose.
    pub description: Option<String>,
    /// Topological load-order dependencies (other plugin directory names).
    #[serde(default)]
    pub dependencies: Vec<String>,
    /// Key-value CVar declarations with their default string values.
    #[serde(default)]
    pub cvars: HashMap<String, String>,
}

/// Reads `plugin.toml` from `plugin_dir`, tolerating legacy `[dependencies]` tables.
pub fn read_plugin_toml(plugin_dir: &Path) -> Result<PluginTomlDoc, String> {
    let path = plugin_dir.join("plugin.toml");
    let raw =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read plugin.toml: {}", e))?;
    parse_plugin_toml_str(&raw)
}

/// Parses a raw `plugin.toml` string, normalizing the dependency
/// representation so both `dependencies = ["a"]` arrays and legacy
/// empty `[dependencies]` tables are handled uniformly.
pub fn parse_plugin_toml_str(raw: &str) -> Result<PluginTomlDoc, String> {
    let value: toml::Value =
        toml::from_str(raw).map_err(|e| format!("Failed to parse plugin.toml: {}", e))?;

    let mut table = value
        .as_table()
        .cloned()
        .ok_or_else(|| "plugin.toml root must be a table".to_string())?;

    // Normalize `dependencies` to an array so legacy `[dependencies]` tables deserialize.
    let deps = extract_dependencies(&value);
    table.insert(
        "dependencies".into(),
        toml::Value::Array(
            deps.iter()
                .map(|d| toml::Value::String(d.clone()))
                .collect(),
        ),
    );

    let doc: PluginTomlDoc = toml::Value::Table(table)
        .try_into()
        .map_err(|e: toml::de::Error| format!("Invalid plugin.toml shape: {}", e))?;

    Ok(doc)
}

/// Extracts dependency plugin names from either an array or a legacy empty table.
fn extract_dependencies(value: &toml::Value) -> Vec<String> {
    match value.get("dependencies") {
        Some(toml::Value::Array(arr)) => arr
            .iter()
            .filter_map(|v| v.as_str().map(str::to_string))
            .collect(),
        _ => Vec::new(),
    }
}

/// Writes the `dependencies` array back to an existing `plugin.toml`,
/// preserving all other top-level keys (name, version, author, cvars, etc.).
///
/// Dependency names are validated to contain only ASCII alphanumeric characters,
/// underscores, and hyphens before persisting.
pub fn write_plugin_dependencies(plugin_dir: &Path, dependencies: &[String]) -> Result<(), String> {
    let path = plugin_dir.join("plugin.toml");
    let raw =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read plugin.toml: {}", e))?;
    let mut doc = parse_plugin_toml_str(&raw)?;

    // Validate dependency names (alphanumeric + _ -) before persisting.
    for dep in dependencies {
        if dep
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
            && !dep.is_empty()
        {
            continue;
        }
        return Err(format!(
            "Invalid dependency name '{}'. Use alphanumeric, underscore, or hyphen.",
            dep
        ));
    }

    doc.dependencies = dependencies.to_vec();
    let out = toml::to_string_pretty(&doc)
        .map_err(|e| format!("Failed to serialize plugin.toml: {}", e))?;
    fs::write(&path, out).map_err(|e| format!("Failed to write plugin.toml: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_plugin_dir(name: &str, contents: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("chaosforge_plugin_toml_{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("plugin.toml"), contents).unwrap();
        dir
    }

    #[test]
    fn parses_inline_dependencies_array() {
        let raw = r#"name = "deps"
version = "1.0.0"
dependencies = ["terminal", "time"]
"#;
        let doc = parse_plugin_toml_str(raw).unwrap();
        assert_eq!(doc.dependencies, vec!["terminal", "time"]);
    }

    #[test]
    fn parses_empty_dependencies_table() {
        let raw = r#"name = "st"
version = "0.1.0"

[dependencies]

[cvars]
"#;
        let doc = parse_plugin_toml_str(raw).unwrap();
        assert!(doc.dependencies.is_empty());
    }

    #[test]
    fn round_trips_dependency_updates() {
        let dir = temp_plugin_dir(
            "roundtrip",
            r#"name = "demo"
version = "0.1.0"
author = "test"
description = "desc"

[dependencies]

[cvars]
foo = "bar"
"#,
        );

        write_plugin_dependencies(&dir, &["terminal".into(), "time".into()]).unwrap();
        let doc = read_plugin_toml(&dir).unwrap();
        assert_eq!(doc.dependencies, vec!["terminal", "time"]);
        assert_eq!(doc.cvars.get("foo").map(String::as_str), Some("bar"));
        assert_eq!(doc.author.as_deref(), Some("test"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_invalid_dependency_names() {
        let dir = temp_plugin_dir(
            "invalid",
            r#"name = "demo"
version = "0.1.0"
"#,
        );
        let err = write_plugin_dependencies(&dir, &["../evil".into()]).unwrap_err();
        assert!(err.contains("Invalid dependency name"));
        let _ = fs::remove_dir_all(&dir);
    }
}
