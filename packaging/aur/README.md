# chaosnexus-forge/packaging/aur/README.md
# AUR package draft for ChaosNexus Forge (not submitted)

## Status

This `PKGBUILD` is a **draft**. It is **not** published to the Arch User Repository
and is not installable via `paru` / `yay` / official repos yet.

## Local makepkg (manual)

1. Build release artifacts from the monorepo:
   ```bash
   just forge-release-linux
   ```
2. From `chaosnexus-forge/packaging/aur/`:
   ```bash
   cp ../flatpak/ai.chaosnexus.forge.desktop .
   ln -sf ../../../../artifacts/forge/linux/chaosnexus-forge-0.1.0-x86_64-unknown-linux-gnu \
     chaosnexus-forge-0.1.0-x86_64-unknown-linux-gnu
   makepkg -si
   ```
3. Regenerate `.SRCINFO` before any future AUR submission:
   ```bash
   makepkg --printsrcinfo > .SRCINFO
   ```

## Flathub / AUR publish

Deferred until public Codeberg Releases exist for `chaosnexus-forge`.
