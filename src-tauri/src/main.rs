// chaosnexus-forge/src-tauri/src/main.rs
//
// ChaosNexus Forge desktop application entry point (Tauri v2).

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

/// Application entry point: delegates to [`chaosforge_lib::run`] which
/// configures the Tauri builder, registers commands, and starts the event loop.
fn main() {
    chaosforge_lib::run()
}
