# ChaosNexus Forge - platform bundling

Release line **0.8.5**. Produce installers with [Tauri 2](https://v2.tauri.app/) from `chaosnexus-forge/`.

**Prerequisites (all platforms):** Node/pnpm, Rust stable, and platform-specific toolchains below.

```bash
cd chaosnexus-forge
pnpm install
```

## Windows (interactive NSIS installer)

Target: `nsis` (guided wizard; also listed in `tauri.conf.json` under `bundle.targets`).

On a Windows host (or Windows CI runner):

```bash
pnpm tauri build --bundles nsis
```

Artifact (typical):

`src-tauri/target/release/bundle/nsis/ChaosNexus Forge_*_x64-setup.exe`

Optional MSI (if you add `"msi"` to `bundle.targets` and have the WiX toolchain):

```bash
pnpm tauri build --bundles msi
```

## macOS (drag-and-drop `.app` + DMG)

Targets: `app`, `dmg`.

On macOS:

```bash
pnpm tauri build --bundles app,dmg
```

Artifacts (typical):

- `src-tauri/target/release/bundle/macos/ChaosNexus Forge.app`
- `src-tauri/target/release/bundle/dmg/ChaosNexus Forge_*.dmg`

### Signing & notarization

| Stage | What |
|-------|------|
| **Ad-hoc (local)** | `codesign --force --deep -s - "ChaosNexus Forge.app"` - enough for your own machine; Gatekeeper may still warn. |
| **Developer ID** | Set `APPLE_SIGNING_IDENTITY` / Tauri `bundle.macOS.signingIdentity` to your `Developer ID Application: …` identity. Enable hardened runtime (already `hardenedRuntime: true` in config). |
| **Notarization** | Apple ID + app-specific password / API key; `xcrun notarytool submit …` then `stapler staple` the `.app`/`.dmg`. Tauri can automate via `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` env vars when identity is set. |

Without a paid Apple Developer account you can still ship unsigned `.app`/`.dmg` for direct distribution; users must right-click → Open the first time.

## Linux (AppImage + `.deb`)

Targets: `appimage`, `deb`.

On Linux:

```bash
pnpm tauri build --bundles appimage,deb
```

Artifacts (typical):

- `src-tauri/target/release/bundle/appimage/chaosnexus-forge_*.AppImage`
- `src-tauri/target/release/bundle/deb/chaosnexus-forge_*.deb`

AppImage needs `appimagetool` (Tauri downloads helpers as needed). `.deb` needs `dpkg`.

## Build everything configured

```bash
pnpm tauri build
```

Uses all entries in `bundle.targets`: `nsis`, `app`, `dmg`, `appimage`, `deb`. Cross-compiling installers for another OS generally requires that OS (or a matching CI runner) - do not expect Linux CI to emit a working NSIS `.exe` without a Windows toolchain.

## Config reference

- App id: `ai.chaosnexus.forge`
- Product name: `ChaosNexus Forge`
- Icons: `src-tauri/icons/` (`32x32`, `128x128`, `@2x`, `icon.icns`, `icon.ico`)
- Bundle knobs: `src-tauri/tauri.conf.json` → `bundle`

## Validate without a full release build

```bash
pnpm tauri build --help
# Optional: JSON schema / dry checks via the CLI on your machine
pnpm tauri info
```

A full `pnpm tauri build` needs the frontend build (`pnpm build`) and a complete Rust target for the host triple.

## Model weights (Path 2 - separate download)

Installers **do not** bundle GGUF weights. `bundle.resources` only ships:

- `resources/licenses/LICENSE-APACHE-2.0.txt`
- `resources/licenses/ATTRIBUTION-IBM-GRANITE.md`

Default download is **ChaosNexus Tuned v1** (`TunedChaos/ChaosNexus_Tuned_v1-GGUF` / `ChaosNexus_Tuned_v1-Q4_K_M.gguf`, ~5.0 GB) from Settings → Models after a one-time license checkbox, into `~/.chaosnexus/crucible/models/<sanitized-model-id>/`. Resume uses a `.gguf.partial` sidecar (or hf-hub cache). Optional mirror: `CHAOSNEXUS_MODEL_BASE_URL`. Optional stock IBM Guardian preset remains available. Missing weights never block the IDE opening - Crucible shows “model missing” until resolved (download, local `.gguf` picker, or mirror).

