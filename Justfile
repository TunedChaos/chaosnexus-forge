# Justfile for ChaosNexus Forge

# Install dependencies using pnpm
install:
    pnpm install

# Run the development server
dev:
    pnpm tauri dev

# Build the release bundles
build:
    pnpm tauri build

# Clean project dependencies and build artifacts
clean:
    cargo clean --manifest-path src-tauri/Cargo.toml
    rm -rf node_modules
