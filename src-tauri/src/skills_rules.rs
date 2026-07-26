// chaosnexus-forge/src-tauri/src/skills_rules.rs
//! Forge filesystem CRUD for dual-scope ChaosNexus rules and skills.
//!
//! User: `~/.chaosnexus/{rules,skills}`
//! Project: `<project>/.chaosnexus/{rules,skills}`

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

use crate::engine_supervisor::scripts_root_from_project;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum SkillRuleScope {
    User,
    Project,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "lowercase")]
pub enum SkillRuleKind {
    Rule,
    Skill,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRuleItem {
    pub name: String,
    pub kind: SkillRuleKind,
    pub scope: SkillRuleScope,
    /// Absolute path to the markdown file.
    pub path: String,
    pub description: String,
}

fn home_base() -> Result<PathBuf, String> {
    directories::UserDirs::new()
        .map(|u| u.home_dir().join(".chaosnexus"))
        .ok_or_else(|| "Could not resolve home directory".into())
}

fn scope_dir(
    scope: SkillRuleScope,
    kind: SkillRuleKind,
    project_path: Option<&str>,
) -> Result<PathBuf, String> {
    let base = match scope {
        SkillRuleScope::User => home_base()?,
        SkillRuleScope::Project => {
            let project = project_path.ok_or("project path required for project scope")?;
            PathBuf::from(scripts_root_from_project(project)).join(".chaosnexus")
        }
    };
    Ok(base.join(match kind {
        SkillRuleKind::Rule => "rules",
        SkillRuleKind::Skill => "skills",
    }))
}

fn describe(content: &str) -> String {
    content
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with('#'))
        .or_else(|| {
            content
                .lines()
                .map(str::trim)
                .find(|l| l.starts_with('#') && l.len() > 1)
                .map(|l| l.trim_start_matches('#').trim())
        })
        .unwrap_or("No description")
        .chars()
        .take(120)
        .collect()
}

fn collect_kind(
    dir: &Path,
    kind: SkillRuleKind,
    scope: SkillRuleScope,
    out: &mut Vec<SkillRuleItem>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        match kind {
            SkillRuleKind::Rule => {
                if !path.is_file() {
                    continue;
                }
                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                if ext != "md" && ext != "markdown" {
                    continue;
                }
                let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                    continue;
                };
                let content = fs::read_to_string(&path).unwrap_or_default();
                out.push(SkillRuleItem {
                    name: stem.to_string(),
                    kind,
                    scope,
                    path: path.to_string_lossy().to_string(),
                    description: describe(&content),
                });
            }
            SkillRuleKind::Skill => {
                if path.is_dir() {
                    let skill_md = path.join("SKILL.md");
                    let file = if skill_md.is_file() {
                        skill_md
                    } else {
                        let alt = path.join("skill.md");
                        if alt.is_file() {
                            alt
                        } else {
                            continue;
                        }
                    };
                    let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
                        continue;
                    };
                    let content = fs::read_to_string(&file).unwrap_or_default();
                    out.push(SkillRuleItem {
                        name: name.to_string(),
                        kind,
                        scope,
                        path: file.to_string_lossy().to_string(),
                        description: describe(&content),
                    });
                } else if path.is_file() {
                    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                    if ext != "md" && ext != "markdown" {
                        continue;
                    }
                    let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                        continue;
                    };
                    let content = fs::read_to_string(&path).unwrap_or_default();
                    out.push(SkillRuleItem {
                        name: stem.to_string(),
                        kind,
                        scope,
                        path: path.to_string_lossy().to_string(),
                        description: describe(&content),
                    });
                }
            }
        }
    }
}

/// List rules and/or skills for the requested scope(s).
#[tauri::command]
pub fn skills_rules_list(
    _app: AppHandle,
    project_path: Option<String>,
    scope: Option<SkillRuleScope>,
    kind: Option<SkillRuleKind>,
) -> Result<Vec<SkillRuleItem>, String> {
    let scopes: Vec<SkillRuleScope> = match scope {
        Some(s) => vec![s],
        None => vec![SkillRuleScope::User, SkillRuleScope::Project],
    };
    let kinds: Vec<SkillRuleKind> = match kind {
        Some(k) => vec![k],
        None => vec![SkillRuleKind::Rule, SkillRuleKind::Skill],
    };
    let mut out = Vec::new();
    for s in scopes {
        if s == SkillRuleScope::Project && project_path.is_none() {
            continue;
        }
        for k in &kinds {
            let dir = scope_dir(s, *k, project_path.as_deref())?;
            collect_kind(&dir, *k, s, &mut out);
        }
    }
    out.sort_by(|a, b| {
        a.scope
            .partial_cmp(&b.scope)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.kind.partial_cmp(&b.kind).unwrap_or(std::cmp::Ordering::Equal))
            .then(a.name.cmp(&b.name))
    });
    // Fix Ordering::Equal typo - should be Equal
    Ok(out)
}

/// Read markdown content for an item.
#[tauri::command]
pub fn skills_rules_read(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("read {path}: {e}"))
}

/// Create or overwrite a rule/skill markdown file.
#[tauri::command]
pub fn skills_rules_write(
    project_path: Option<String>,
    scope: SkillRuleScope,
    kind: SkillRuleKind,
    name: String,
    content: String,
) -> Result<SkillRuleItem, String> {
    let name = name.trim().to_string();
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("invalid name".into());
    }
    let dir = scope_dir(scope, kind, project_path.as_deref())?;
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {e}"))?;
    let path = match kind {
        SkillRuleKind::Rule => dir.join(format!("{name}.md")),
        SkillRuleKind::Skill => {
            // Prefer folder pack with SKILL.md for skills.
            let pack = dir.join(&name);
            fs::create_dir_all(&pack).map_err(|e| format!("mkdir skill pack: {e}"))?;
            pack.join("SKILL.md")
        }
    };
    fs::write(&path, &content).map_err(|e| format!("write: {e}"))?;
    Ok(SkillRuleItem {
        name,
        kind,
        scope,
        path: path.to_string_lossy().to_string(),
        description: describe(&content),
    })
}

/// Delete a rule/skill by path (and empty skill folder when applicable).
#[tauri::command]
pub fn skills_rules_delete(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("not found: {path}"));
    }
    if p.is_file() {
        fs::remove_file(&p).map_err(|e| format!("delete: {e}"))?;
        if let Some(parent) = p.parent() {
            // If this was skills/<name>/SKILL.md, remove empty pack dir.
            if parent
                .file_name()
                .and_then(|s| s.to_str())
                .is_some_and(|n| n != "rules" && n != "skills")
            {
                let _ = fs::remove_dir(parent);
            }
        }
        return Ok(());
    }
    Err("path is not a file".into())
}

