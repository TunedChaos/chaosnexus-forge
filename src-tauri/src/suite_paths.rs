// chaosnexus-forge/src-tauri/src/suite_paths.rs
//! Suite resource discovery for AppImage / portable zip / macOS `.app` layouts.
//!
//! Resolution order for helpers:
//! 1. Explicit env (`CHAOSNEXUS_*` / `CHAOSWRENCH_BIN`)
//! 2. Suite resource root (`CHAOSNEXUS_SUITE_ROOT`, `APPDIR`, exe-relative `share/chaosnexus`)
//! 3. Binary next to the Forge executable (`bin/` sibling or same directory)
//! 4. PATH fallbacks (handled by callers)

use std::path::{Path, PathBuf};

/// Returns the Suite share root when present (`…/share/chaosnexus`).
pub fn suite_resource_root() -> Option<PathBuf> {
    if let Ok(root) = std::env::var("CHAOSNEXUS_SUITE_ROOT") {
        let p = PathBuf::from(root);
        if p.is_dir() {
            return Some(p);
        }
    }

    if let Ok(appdir) = std::env::var("APPDIR") {
        let p = PathBuf::from(appdir).join("usr/share/chaosnexus");
        if p.is_dir() {
            return Some(p);
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            // Portable zip / Linux payload: <root>/bin/forge → <root>/share/chaosnexus
            let sibling = dir.join("../share/chaosnexus");
            if let Ok(canon) = sibling.canonicalize() {
                if canon.is_dir() {
                    return Some(canon);
                }
            }
            // macOS .app: Contents/Resources/chaosnexus/bin/forge
            if dir.ends_with("bin") {
                if let Some(res) = dir.parent() {
                    if res.file_name().and_then(|s| s.to_str()) == Some("chaosnexus") {
                        return Some(res.to_path_buf());
                    }
                }
            }
            // macOS launcher next to Resources/chaosnexus
            let mac = dir.join("../Resources/chaosnexus");
            if let Ok(canon) = mac.canonicalize() {
                if canon.is_dir() {
                    return Some(canon);
                }
            }
        }
    }

    None
}

/// Directory that contains Suite helper binaries (`chaosnexus-crucible`, …).
pub fn suite_bin_dir() -> Option<PathBuf> {
    if let Ok(appdir) = std::env::var("APPDIR") {
        let p = PathBuf::from(appdir).join("usr/bin");
        if p.is_dir() {
            return Some(p);
        }
    }

    if let Some(root) = suite_resource_root() {
        let nested = root.join("bin");
        if nested.is_dir() {
            return Some(nested);
        }
        // Linux AppDir also keeps bins under usr/bin while share is separate;
        // when resource root is share/chaosnexus, try ../../bin from share.
        if let Some(parent) = root.parent() {
            // share/ -> usr/ or package root
            let cand = parent.join("../bin");
            if let Ok(canon) = cand.canonicalize() {
                if canon.is_dir() {
                    return Some(canon);
                }
            }
            let cand2 = parent.join("bin");
            if cand2.is_dir() {
                return Some(cand2);
            }
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            return Some(dir.to_path_buf());
        }
    }

    None
}

/// Bundled Scripts tree (`…/share/chaosnexus/scripts`), if present.
pub fn suite_scripts_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("CHAOSNEXUS_SCRIPTS_DIR") {
        let p = PathBuf::from(dir);
        if p.is_dir() {
            return Some(p);
        }
    }
    suite_resource_root().map(|r| r.join("scripts")).filter(|p| p.is_dir())
}

/// Absolute path to a helper binary inside the Suite bin dir, if it exists.
pub fn suite_helper_bin(name: &str) -> Option<PathBuf> {
    let bin_dir = suite_bin_dir()?;
    let candidates = [
        bin_dir.join(name),
        bin_dir.join(format!("{name}.exe")),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

/// Plugins directory preferred when opening a Suite install (`scripts/plugins`).
pub fn suite_plugins_dir() -> Option<PathBuf> {
    suite_scripts_dir()
        .map(|s| s.join("plugins"))
        .filter(|p| p.is_dir())
}

/// Push Suite helper candidates before PATH fallbacks.
pub fn push_suite_bin_candidates(candidates: &mut Vec<PathBuf>, logical_name: &str) {
    if let Some(p) = suite_helper_bin(logical_name) {
        candidates.push(p);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(logical_name));
            candidates.push(dir.join(format!("{logical_name}.exe")));
            // Portable layout: bin/ next to share/
            candidates.push(dir.join(logical_name));
        }
    }
}

/// Whether `path` looks like a Suite scripts root (has `plugins/` + `lib/`).
pub fn looks_like_scripts_root(path: &Path) -> bool {
    path.join("plugins").is_dir() && path.join("lib").is_dir()
}

/// Returns the Suite scripts directory when running from a Suite install.
#[tauri::command]
pub fn get_suite_scripts_dir() -> Option<String> {
    suite_scripts_dir().map(|p| p.to_string_lossy().to_string())
}

/// Returns the Suite `plugins/` directory (default plugins dir for adopters).
#[tauri::command]
pub fn get_suite_plugins_dir() -> Option<String> {
    suite_plugins_dir().map(|p| p.to_string_lossy().to_string())
}

/// Resolves the first existing Codex binary candidate for Agent / docs tooling.
#[tauri::command]
pub fn resolve_codex_bin() -> Option<String> {
    if let Ok(custom) = std::env::var("CHAOSNEXUS_CODEX_BIN") {
        let p = PathBuf::from(&custom);
        if p.is_file() {
            return Some(custom);
        }
    }
    suite_helper_bin("chaosnexus-codex").map(|p| p.to_string_lossy().to_string())
}
