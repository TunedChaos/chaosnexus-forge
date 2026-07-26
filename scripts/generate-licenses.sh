#!/usr/bin/env bash
# chaosnexus-forge/scripts/generate-licenses.sh
# Generate isolated third-party license inventories for each ChaosNexus package.

set -euo pipefail

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WORKSPACE_ROOT="$DIR/../.."
ASSETS_DIR="$DIR/../src/lib/assets"
ABOUT_TOML="$WORKSPACE_ROOT/about.toml"
ABOUT_HBS="$DIR/about.hbs"

mkdir -p "$ASSETS_DIR"

echo "Checking for cargo-about..."
if ! command -v cargo-about &> /dev/null; then
    echo "cargo-about not found. Installing..."
    cargo install cargo-about --features cli
fi

cd "$WORKSPACE_ROOT"

generate_rust() {
    local label="$1"
    local manifest="$2"
    local out="$3"
    echo "Generating ${label} licenses..."
    if ! cargo about generate -c "$ABOUT_TOML" --manifest-path "$manifest" "$ABOUT_HBS" > "$out"; then
        echo "WARN: cargo-about failed for ${label}; writing empty array"
        echo "[]" > "$out"
    fi
}

generate_frontend() {
    local label="$1"
    local pkg_root="$2"
    local out="$3"
    local filter="${4:-}"
    echo "Generating ${label} licenses..."
    if ! node "$DIR/generate-frontend-licenses.mjs" "$pkg_root" "$out" "$filter"; then
        echo "WARN: frontend license generation failed for ${label}; writing empty object"
        echo "{}" > "$out"
    fi
}

generate_rust "ChaosNexus Anvil" \
    "chaosnexus-anvil/Cargo.toml" \
    "$ASSETS_DIR/chaosnexus-anvil-licenses.json"

generate_rust "ChaosNexus Forge (Backend)" \
    "chaosnexus-forge/src-tauri/Cargo.toml" \
    "$ASSETS_DIR/chaosnexus-forge-backend-licenses.json"

generate_frontend "ChaosNexus Forge (Frontend)" \
    "$WORKSPACE_ROOT" \
    "$ASSETS_DIR/chaosnexus-forge-frontend-licenses.json" \
    "chaosnexus-forge"

generate_rust "ChaosNexus Codex" \
    "chaosnexus-codex/Cargo.toml" \
    "$ASSETS_DIR/chaosnexus-codex-licenses.json"

generate_rust "ChaosNexus Crucible" \
    "chaosnexus-crucible/Cargo.toml" \
    "$ASSETS_DIR/chaosnexus-crucible-licenses.json"

# Website deps live in the monorepo root package.json (VitePress site).
generate_frontend "ChaosNexus Website (VitePress)" \
    "$WORKSPACE_ROOT" \
    "$ASSETS_DIR/chaosnexus-website-licenses.json" \
    "tuned-chaos"

echo "Licenses generated successfully in $ASSETS_DIR."
