#!/usr/bin/env bash
# Generate isolated licenses for each package

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WORKSPACE_ROOT="$DIR/../.."
ASSETS_DIR="$DIR/../src/lib/assets"

mkdir -p "$ASSETS_DIR"

echo "Checking for cargo-about..."
if ! command -v cargo-about &> /dev/null; then
    echo "cargo-about not found. Installing..."
    cargo install cargo-about --features cli
fi

cd "$WORKSPACE_ROOT"

echo "Generating ChaosNexus Anvil licenses..."
cargo about generate -c about.toml --manifest-path chaosnexus-anvil/Cargo.toml "$DIR/about.hbs" > "$ASSETS_DIR/chaosnexus-anvil-licenses.json" || echo "[]" > "$ASSETS_DIR/chaosnexus-anvil-licenses.json"

echo "Generating ChaosNexus Forge (Backend) licenses..."
cargo about generate -c about.toml --manifest-path chaosnexus-forge/src-tauri/Cargo.toml "$DIR/about.hbs" > "$ASSETS_DIR/chaosnexus-forge-backend-licenses.json" || echo "[]" > "$ASSETS_DIR/chaosnexus-forge-backend-licenses.json"

echo "Generating ChaosNexus Forge (Frontend) licenses..."
node "$DIR/generate-frontend-licenses.mjs" "$WORKSPACE_ROOT/forge" "$ASSETS_DIR/chaosnexus-forge-frontend-licenses.json" || echo "{}" > "$ASSETS_DIR/chaosnexus-forge-frontend-licenses.json"

echo "Generating ChaosNexus Codex (Frontend) licenses..."
node "$DIR/generate-frontend-licenses.mjs" "$WORKSPACE_ROOT" "$ASSETS_DIR/chaosnexus-codex-licenses.json" || echo "{}" > "$ASSETS_DIR/chaosnexus-codex-licenses.json"

echo "Licenses generated successfully in $ASSETS_DIR."
