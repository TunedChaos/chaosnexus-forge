//! Tauri build script.
//!
//! If `icons/*.png` or `icon.ico` are still Git LFS pointer stubs (or missing),
//! restore 8-bit RGBA PNG/ICO from `icon.icns` so `tauri::generate_context!()`
//! does not panic with "Invalid PNG signature". Prefer `git lfs pull` for
//! icons when developing locally; `just ensure-tauri-icons` does that.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// PNG signature (8 bytes).
const PNG_SIG: &[u8] = b"\x89PNG\r\n\x1a\n";

fn main() {
    ensure_rgba_bundle_icons();
    tauri_build::build();
}

/// Makes sure every icon `generate_context!` / the Linux bundler will decode
/// is a real 8-bit RGBA PNG (or a parseable ICO), restoring from `icon.icns`
/// when the on-disk file is an LFS pointer or otherwise invalid.
fn ensure_rgba_bundle_icons() {
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let icons_dir = manifest_dir.join("icons");
    let icns_path = icons_dir.join("icon.icns");

    println!("cargo:rerun-if-changed={}", icns_path.display());
    println!("cargo:rerun-if-changed={}", icons_dir.join("32x32.png").display());
    println!("cargo:rerun-if-changed={}", icons_dir.join("128x128.png").display());
    println!(
        "cargo:rerun-if-changed={}",
        icons_dir.join("128x128@2x.png").display()
    );
    println!("cargo:rerun-if-changed={}", icons_dir.join("icon.png").display());
    println!("cargo:rerun-if-changed={}", icons_dir.join("icon.ico").display());

    let icns_bytes = fs::read(&icns_path).unwrap_or_else(|e| {
        panic!(
            "failed to read {}: {e} (needed to restore RGBA icons for tauri::generate_context!)",
            icns_path.display()
        )
    });
    let icns_pngs = extract_pngs_from_icns(&icns_bytes);
    if icns_pngs.is_empty() {
        panic!(
            "{} contains no embedded PNG payloads; cannot restore Tauri icons",
            icns_path.display()
        );
    }

    let required_pngs: &[(&str, u32)] = &[
        ("32x32.png", 32),
        ("128x128.png", 128),
        ("128x128@2x.png", 256),
        ("icon.png", 512),
        ("64x64.png", 64),
    ];

    for (name, dim) in required_pngs {
        let dest = icons_dir.join(name);
        if is_rgba8_png_file(&dest) {
            continue;
        }
        let png = png_for_dimension(&icns_pngs, *dim).unwrap_or_else(|| {
            panic!(
                "icon {} is not an 8-bit RGBA PNG (often a Git LFS pointer) and icon.icns has no {dim}x{dim} PNG to restore from",
                dest.display()
            )
        });
        write_binary(&dest, png);
        println!(
            "cargo:warning=restored RGBA icon {} from icon.icns (was missing or not 8-bit RGBA)",
            dest.display()
        );
    }

    let ico_path = icons_dir.join("icon.ico");
    if !is_plausible_ico_file(&ico_path) {
        let png32 = png_for_dimension(&icns_pngs, 32).unwrap_or_else(|| {
            panic!("cannot rebuild icon.ico: no 32x32 PNG inside icon.icns")
        });
        let ico = png_to_ico(png32);
        write_binary(&ico_path, &ico);
        println!(
            "cargo:warning=restored {} from icon.icns 32x32 PNG (was missing or not an ICO)",
            ico_path.display()
        );
    }
}

/// PNG payloads extracted from an ICNS, keyed by IHDR width/height.
struct IcnsPng {
    width: u32,
    height: u32,
    bytes: Vec<u8>,
}

fn extract_pngs_from_icns(data: &[u8]) -> Vec<IcnsPng> {
    if data.len() < 8 || &data[0..4] != b"icns" {
        return Vec::new();
    }
    let mut out = Vec::new();
    let mut off = 8usize;
    while off.saturating_add(8) <= data.len() {
        let len = u32::from_be_bytes(data[off + 4..off + 8].try_into().unwrap()) as usize;
        if len < 8 || off.saturating_add(len) > data.len() {
            break;
        }
        let payload = &data[off + 8..off + len];
        if let Some((w, h)) = png_ihdr_size(payload) {
            out.push(IcnsPng {
                width: w,
                height: h,
                bytes: payload.to_vec(),
            });
        }
        off += len;
    }
    out
}

fn png_for_dimension(pngs: &[IcnsPng], dim: u32) -> Option<&[u8]> {
    pngs.iter()
        .find(|p| p.width == dim && p.height == dim && is_rgba8_png(&p.bytes))
        .map(|p| p.bytes.as_slice())
}

fn is_rgba8_png_file(path: &Path) -> bool {
    fs::read(path).map(|b| is_rgba8_png(&b)).unwrap_or(false)
}

/// True when `bytes` is a PNG whose IHDR is 8-bit RGBA (Tauri's `CachedIcon::new_png` requirement).
fn is_rgba8_png(bytes: &[u8]) -> bool {
    match png_ihdr(bytes) {
        Some((_w, _h, bit_depth, color_type)) => bit_depth == 8 && color_type == 6,
        None => false,
    }
}

fn png_ihdr_size(bytes: &[u8]) -> Option<(u32, u32)> {
    png_ihdr(bytes).map(|(w, h, _, _)| (w, h))
}

fn png_ihdr(bytes: &[u8]) -> Option<(u32, u32, u8, u8)> {
    if bytes.len() < 26 || !bytes.starts_with(PNG_SIG) {
        return None;
    }
    if &bytes[12..16] != b"IHDR" {
        return None;
    }
    let width = u32::from_be_bytes(bytes[16..20].try_into().ok()?);
    let height = u32::from_be_bytes(bytes[20..24].try_into().ok()?);
    let bit_depth = bytes[24];
    let color_type = bytes[25];
    Some((width, height, bit_depth, color_type))
}

fn is_plausible_ico_file(path: &Path) -> bool {
    let Ok(bytes) = fs::read(path) else {
        return false;
    };
    is_plausible_ico(&bytes)
}

/// ICONDIR header: reserved=0, type=1 (icon), count>=1. Rejects Git LFS pointer text.
fn is_plausible_ico(bytes: &[u8]) -> bool {
    if bytes.len() < 6 {
        return false;
    }
    bytes[0] == 0
        && bytes[1] == 0
        && bytes[2] == 1
        && bytes[3] == 0
        && u16::from_le_bytes([bytes[4], bytes[5]]) >= 1
}

/// Minimal ICO wrapping a PNG payload (Vista+ PNG-in-ICO). Tauri's `ico` crate decodes this.
fn png_to_ico(png: &[u8]) -> Vec<u8> {
    let (w, h, _, _) = png_ihdr(png).expect("png_to_ico requires a PNG");
    let width_byte = if w >= 256 { 0 } else { w as u8 };
    let height_byte = if h >= 256 { 0 } else { h as u8 };
    let mut out = Vec::with_capacity(22 + png.len());
    out.extend_from_slice(&[0, 0, 1, 0, 1, 0]);
    out.push(width_byte);
    out.push(height_byte);
    out.push(0);
    out.push(0);
    out.extend_from_slice(&[1, 0]);
    out.extend_from_slice(&[32, 0]);
    out.extend_from_slice(&(png.len() as u32).to_le_bytes());
    out.extend_from_slice(&22u32.to_le_bytes());
    out.extend_from_slice(png);
    out
}

fn write_binary(path: &Path, bytes: &[u8]) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap_or_else(|e| {
            panic!("failed to create {}: {e}", parent.display());
        });
    }
    let mut f = fs::File::create(path).unwrap_or_else(|e| {
        panic!("failed to write {}: {e}", path.display());
    });
    f.write_all(bytes).unwrap_or_else(|e| {
        panic!("failed to write {}: {e}", path.display());
    });
}
