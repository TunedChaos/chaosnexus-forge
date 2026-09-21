// chaosnexus-forge/src-tauri/examples/dump_visual_canvas.rs
//
// CLI helper: read a Rhai file, emit semantic canvas JSON (topology only) to stdout.
// Used by forge scripts to regenerate editable sidecars without launching Tauri.

use chaosforge_lib::visualizer::generate_visual_canvas;
use std::env;
use std::fs;
use std::process;

fn main() {
    let mut args = env::args().skip(1);
    let path = match args.next() {
        Some(p) => p,
        None => {
            eprintln!("usage: dump_visual_canvas <script.rhai>");
            process::exit(2);
        }
    };
    let source = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("failed to read {path}: {e}");
            process::exit(1);
        }
    };
    let doc = generate_visual_canvas(&source);
    match serde_json::to_string(&doc) {
        Ok(json) => println!("{json}"),
        Err(e) => {
            eprintln!("serialize failed: {e}");
            process::exit(1);
        }
    }
}
