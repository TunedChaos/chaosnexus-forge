# chaosnexus-forge/Justfile
# Local and CI packaging helpers for ChaosNexus Forge (Tauri v2).
# Linux = native Tauri bundles (deb/rpm/appimage) + Flatpak bundle.
# Win/Mac = best-effort zigbuild host binaries.

# Absolute macOS SDK path for zigbuild / link (same resolution order as Anvil / Retrityr).
# Prefer private monorepo SDKs/MacOSX.sdk (Forgejo-only; never subtree-synced to Codeberg/GitHub).
MACOSX_SDK_ABS := `repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"; if [ -d "$repo/SDKs/MacOSX.sdk" ]; then c="$repo/SDKs/MacOSX.sdk"; elif [ -n "${MACOSX_SDK_PATH:-}" ] && [ -d "${MACOSX_SDK_PATH}" ]; then c="${MACOSX_SDK_PATH}"; elif [ -d "$repo/MacOSX.sdk" ]; then c="$repo/MacOSX.sdk"; elif [ -d "$HOME/development/macos-sdk/MacOSX.sdk" ]; then c="$HOME/development/macos-sdk/MacOSX.sdk"; else echo ""; exit 0; fi; case "$c" in /*) realpath "$c";; *) realpath "$repo/$c";; esac`

ARTIFACTS_LINUX := `repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"; echo "$repo/artifacts/forge/linux"`
ARTIFACTS_CROSS := `repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"; echo "$repo/artifacts/forge/cross"`

PKG_VERSION := `grep -m 1 '"version"' src-tauri/tauri.conf.json | head -1 | sed -E 's/.*"version":[[:space:]]*"([^"]+)".*/\1/'`

BIN_NAME := "chaosnexus-forge"
RUSTC_WRAP := `if command -v sccache >/dev/null 2>&1; then echo "sccache"; else echo ""; fi`
LIPO_BIN := `if command -v llvm-lipo >/dev/null 2>&1; then echo "llvm-lipo"; elif command -v lipo >/dev/null 2>&1; then echo "lipo"; else echo ""; fi`

default:
    @just --list

# Install dependencies using pnpm
install:
    pnpm install

# Run the development server
dev:
    pnpm tauri dev

# Build the release bundles (default Tauri targets for the host OS)
build:
    pnpm tauri build

# Clean project dependencies and build artifacts
clean:
    cargo clean --manifest-path src-tauri/Cargo.toml
    rm -rf node_modules

# --- Release / cross helpers (CI + local) ---

check-deps-linux:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Checking Forge Linux packaging prerequisites..."
    command -v cargo >/dev/null 2>&1 || { echo "Error: cargo missing"; exit 1; }
    command -v pnpm >/dev/null 2>&1 || { echo "Error: pnpm missing"; exit 1; }
    if ! command -v dpkg >/dev/null 2>&1 || ! command -v fakeroot >/dev/null 2>&1; then
        echo "  -> Note: dpkg/fakeroot not found (deb bundles will be skipped locally)"
    fi
    if ! command -v rpm >/dev/null 2>&1 && ! command -v rpmbuild >/dev/null 2>&1; then
        echo "  -> Note: rpm/rpmbuild not found (rpm bundles will be skipped locally)"
    fi
    if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
        echo "Error: webkit2gtk-4.1 not found (install libwebkit2gtk-4.1-dev)"
        exit 1
    fi
    # Prefer the shared Ubuntu 24.04 checker when present on an Ubuntu deploy host.
    repo="$(git rev-parse --show-toplevel 2>/dev/null || true)"
    if [[ -n "$repo" && -f "$repo/tools/deploy/ubuntu-24.04-runner-check.sh" ]]; then
        if [[ -f /etc/os-release ]] && grep -qi 'ID=ubuntu' /etc/os-release; then
            bash "$repo/tools/deploy/ubuntu-24.04-runner-check.sh"
        fi
    fi
    echo "  -> OK"

check-deps-cross:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Checking Forge cross-compile prerequisites..."
    command -v cargo >/dev/null 2>&1 || { echo "Error: cargo missing"; exit 1; }
    command -v pnpm >/dev/null 2>&1 || { echo "Error: pnpm missing"; exit 1; }
    command -v cargo-zigbuild >/dev/null 2>&1 || { echo "Error: cargo-zigbuild missing"; exit 1; }
    if [[ -z "{{LIPO_BIN}}" ]]; then
        echo "Error: neither llvm-lipo nor lipo found (needed for macOS universal)."
        exit 1
    fi
    if [[ -z "{{MACOSX_SDK_ABS}}" ]] || [[ ! -d "{{MACOSX_SDK_ABS}}" ]]; then
        echo "Error: macOS SDK not found (MACOSX_SDK_PATH / MacOSX.sdk / ~/development/macos-sdk/MacOSX.sdk)."
        exit 1
    fi
    echo "  -> OK (SDK={{MACOSX_SDK_ABS}})"

# Native Linux Tauri installers (deb + rpm + AppImage) → artifacts/forge/linux/
# Requires typical Tauri Linux AppImage toolchain (linuxdeploy / related deps).
forge-release-linux: check-deps-linux
    #!/usr/bin/env bash
    set -euo pipefail
    ver="{{PKG_VERSION}}"
    out="{{ARTIFACTS_LINUX}}"
    mkdir -p "$out"
    
    BUNDLES=""
    if command -v dpkg >/dev/null 2>&1 && command -v fakeroot >/dev/null 2>&1; then
        BUNDLES="${BUNDLES:+${BUNDLES},}deb"
    fi
    if command -v rpm >/dev/null 2>&1 || command -v rpmbuild >/dev/null 2>&1; then
        BUNDLES="${BUNDLES:+${BUNDLES},}rpm"
    fi
    if command -v patchelf >/dev/null 2>&1; then
        BUNDLES="${BUNDLES:+${BUNDLES},}appimage"
    fi
    
    if [[ -z "$BUNDLES" ]]; then
        echo "Warning: No bundle tools installed (dpkg/rpm/patchelf). Building host release binary only..."
        BUNDLES="none"
    fi

    echo "Building ChaosNexus Forge Linux bundles (v${ver}: ${BUNDLES})..."
    pnpm install --frozen-lockfile
    # linuxdeploy AppImage embeds an old strip that fails on SHT_RELR (.relr.dyn)
    # sections used by modern Arch/CachyOS shared libraries. Skip strip instead.
    export APPIMAGE_EXTRACT_AND_RUN=1
    export NO_STRIP=1
    if [[ "$BUNDLES" == "none" ]]; then
        pnpm tauri build --no-bundle
    else
        pnpm tauri build --bundles "$BUNDLES"
    fi

    # Tauri writes under src-tauri/target/release/bundle/{deb,rpm,appimage}/
    shopt -s nullglob
    copied=0
    for f in src-tauri/target/release/bundle/deb/*.deb \
             src-tauri/target/release/bundle/rpm/*.rpm \
             src-tauri/target/release/bundle/appimage/*.AppImage; do
        install -p "$f" "$out/"
        echo "  -> staged $(basename "$f")"
        copied=$((copied + 1))
    done

    # Also keep the host binary next to installers for Flatpak import + CI smoke.
    if [[ -f "src-tauri/target/release/{{BIN_NAME}}" ]]; then
        install -p "src-tauri/target/release/{{BIN_NAME}}" \
            "$out/{{BIN_NAME}}-${ver}-x86_64-unknown-linux-gnu"
        echo "  -> staged {{BIN_NAME}}-${ver}-x86_64-unknown-linux-gnu"
        copied=$((copied + 1))
    fi

    if [[ "$copied" -eq 0 ]]; then
        echo "error: no bundles or release binary staged under $out" >&2
        exit 1
    fi
    echo "Forge Linux release staging complete -> $out"

# Flatpak bundle from staged host binary (no in-sandbox recompile).
# Requires: flatpak-builder, org.gnome.Platform//50, org.gnome.Sdk//50
forge-flatpak: check-deps-linux
    #!/usr/bin/env bash
    set -euo pipefail
    ver="{{PKG_VERSION}}"
    out="{{ARTIFACTS_LINUX}}"
    repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
    pack_dir="$repo_root/chaosnexus-forge/packaging/flatpak"
    mkdir -p "$out"

    command -v flatpak-builder >/dev/null 2>&1 || {
        echo "Error: flatpak-builder is required for forge-flatpak."
        echo "   Install flatpak-builder and runtimes, e.g.:"
        echo "     flatpak install -y flathub org.gnome.Platform//50 org.gnome.Sdk//50"
        exit 1
    }

    bin_src="$out/{{BIN_NAME}}-${ver}-x86_64-unknown-linux-gnu"
    if [[ ! -f "$bin_src" ]]; then
        if [[ -f "$repo_root/chaosnexus-forge/src-tauri/target/release/{{BIN_NAME}}" ]]; then
            bin_src="$repo_root/chaosnexus-forge/src-tauri/target/release/{{BIN_NAME}}"
        elif [[ -f "src-tauri/target/release/{{BIN_NAME}}" ]]; then
            bin_src="src-tauri/target/release/{{BIN_NAME}}"
        else
            echo "Error: staged Forge binary missing: $out/{{BIN_NAME}}-${ver}-x86_64-unknown-linux-gnu"
            echo "   Run: just forge-release-linux"
            exit 1
        fi
    fi

    work="$(mktemp -d "${TMPDIR:-/tmp}/chaosnexus-forge-flatpak.XXXXXX")"
    trap 'rm -rf "$work"' EXIT
    mkdir -p "$work/bin" "$work/build" "$work/repo" "$work/state"
    install -p "$bin_src" "$work/bin/{{BIN_NAME}}"
    install -p "$pack_dir/ai.chaosnexus.forge.desktop" "$work/bin/"
    install -p "$pack_dir/ai.chaosnexus.forge.metainfo.xml" "$work/bin/"
    icon_src="$repo_root/chaosnexus-forge/src-tauri/icons/128x128.png"
    if [[ -f "$icon_src" ]]; then
        install -p "$icon_src" "$work/bin/ai.chaosnexus.forge.png"
    fi

    manifest="$work/ai.chaosnexus.forge.yml"
    sed "s|__BINARY_DIR__|$work/bin|g" "$pack_dir/ai.chaosnexus.forge.yml" > "$manifest"

    echo "Building Flatpak (ai.chaosnexus.forge v${ver})..."
    flatpak-builder --force-clean --state-dir="$work/state" --repo="$work/repo" \
        "$work/build" "$manifest"
    bundle="$out/ChaosNexus_Forge-${ver}-x86_64.flatpak"
    flatpak build-bundle "$work/repo" "$bundle" ai.chaosnexus.forge
    echo "  -> staged $(basename "$bundle")"
    echo "Forge Flatpak staging complete -> $out"

# Best-effort Windows host binary via cargo-zigbuild (no MSI/NSIS in this phase).
forge-cross-windows: check-deps-cross
    #!/usr/bin/env bash
    set -euo pipefail
    ver="{{PKG_VERSION}}"
    out="{{ARTIFACTS_CROSS}}"
    mkdir -p "$out"
    log="$out/forge-cross-windows.log"
    echo "Attempting Forge Windows cross-compile (x86_64-pc-windows-gnu)..." | tee "$log"
    pnpm install --frozen-lockfile
    # Frontend must exist before tauri-build / embed; build once for all cross targets.
    pnpm build 2>&1 | tee -a "$log"
    mingw_lib=""
    if [[ -f /usr/x86_64-w64-mingw32/lib/libsynchronization.a ]]; then
        mingw_lib="/usr/x86_64-w64-mingw32/lib"
        echo "  -> using mingw sync import lib at $mingw_lib" | tee -a "$log"
    fi
    (
        cd src-tauri
        # Silence Zig "deprecated linker optimization setting '1'" (rust-lang/rust#158192).
        win_rustflags="${mingw_lib:+ -Lnative=${mingw_lib}}"
        env RUSTC_WRAPPER={{RUSTC_WRAP}} \
            CARGO_TARGET_X86_64_PC_WINDOWS_GNU_RUSTFLAGS="${win_rustflags}" \
            cargo zigbuild --release --target x86_64-pc-windows-gnu
    ) 2>&1 | tee -a "$log"
    src="src-tauri/target/x86_64-pc-windows-gnu/release/{{BIN_NAME}}.exe"
    if [[ ! -f "$src" ]]; then
        echo "error: Windows Forge binary missing after zigbuild: $src" | tee -a "$log" >&2
        exit 1
    fi
    install -p "$src" "$out/{{BIN_NAME}}-${ver}-x86_64-pc-windows-gnu.exe"
    echo "  -> staged {{BIN_NAME}}-${ver}-x86_64-pc-windows-gnu.exe" | tee -a "$log"

# Best-effort macOS universal host binary via zigbuild + lipo (no DMG in this phase).
forge-cross-macos: check-deps-cross
    #!/usr/bin/env bash
    set -euo pipefail
    ver="{{PKG_VERSION}}"
    out="{{ARTIFACTS_CROSS}}"
    mkdir -p "$out"
    log="$out/forge-cross-macos.log"
    echo "Attempting Forge macOS universal cross-compile..." | tee "$log"
    echo "  -> SDKROOT={{MACOSX_SDK_ABS}}" | tee -a "$log"
    if [ -f "$(git rev-parse --show-toplevel 2>/dev/null)/tools/deploy/fixup-macos-sdk-tbds.sh" ]; then
        bash "$(git rev-parse --show-toplevel)/tools/deploy/fixup-macos-sdk-tbds.sh" "{{MACOSX_SDK_ABS}}" 2>&1 | tee -a "$log" || true
    fi
    pnpm install --frozen-lockfile
    pnpm build 2>&1 | tee -a "$log"
    (
        cd src-tauri
        # Silence Zig "deprecated linker optimization setting '1'" (rust-lang/rust#158192).
        zig_rustflags=""
        env RUSTC_WRAPPER={{RUSTC_WRAP}} SDKROOT={{MACOSX_SDK_ABS}} \
            CARGO_TARGET_AARCH64_APPLE_DARWIN_RUSTFLAGS="${zig_rustflags}" \
            cargo zigbuild --release --target aarch64-apple-darwin
        env RUSTC_WRAPPER={{RUSTC_WRAP}} SDKROOT={{MACOSX_SDK_ABS}} \
            CARGO_TARGET_X86_64_APPLE_DARWIN_RUSTFLAGS="${zig_rustflags}" \
            cargo zigbuild --release --target x86_64-apple-darwin
    ) 2>&1 | tee -a "$log"
    a="src-tauri/target/aarch64-apple-darwin/release/{{BIN_NAME}}"
    b="src-tauri/target/x86_64-apple-darwin/release/{{BIN_NAME}}"
    if [[ ! -f "$a" ]] || [[ ! -f "$b" ]]; then
        echo "error: macOS Forge slices missing after zigbuild" | tee -a "$log" >&2
        echo "  looked for: $a" | tee -a "$log" >&2
        echo "  looked for: $b" | tee -a "$log" >&2
        exit 1
    fi
    dst="$out/{{BIN_NAME}}-${ver}-universal-apple-darwin"
    {{LIPO_BIN}} -create -output "$dst" "$a" "$b"
    echo "  -> staged $(basename "$dst")" | tee -a "$log"

# Run both cross targets; fails if either fails (CI wraps with continue-on-error).
forge-cross: forge-cross-windows forge-cross-macos
    @echo "Forge cross staging complete -> {{ARTIFACTS_CROSS}}"
