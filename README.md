<img src="./assets/banner.png" alt="ChaosNexus Forge Banner" />

# ChaosNexus Forge

Tauri v2 + SvelteKit desktop IDE for ChaosNexus: visual Vhai graphs, Rhai editing, live Anvil supervision, and human-in-the-loop plugin approval.

> **Status:** early public alpha launch (pre-1.0).

- **Docs:** [chaosnexus.ai](https://chaosnexus.ai)
- **Contribute:** [github.com/TunedChaos/chaosnexus-forge](https://github.com/TunedChaos/chaosnexus-forge)
- **Support:** [Tuned Chaos supporters](https://tunedchaos.com/supporters/) or [GitHub Sponsors](https://github.com/sponsors/TunedChaos)
GitHub is the primary public host. Please open issues and pull requests on **GitHub**.

## Quick start

```bash
pnpm install
pnpm tauri dev
```

## Packaging / LFS icons

`tauri::generate_context!()` panics if `src-tauri/icons/*.png` (or `icon.ico`) are Git LFS pointer stubs instead of 8-bit RGBA images. workspace CI hydrates icons after checkout; locally `just forge-release-linux` / `just build` run `ensure-tauri-icons`, and `src-tauri/build.rs` restores PNG/ICO from `icons/icon.icns` when pointers remain.

## Bundling / installers

See [BUNDLING.md](BUNDLING.md) for Windows NSIS, macOS `.app`/DMG (signing & notarization notes), and Linux AppImage/`.deb` commands.

## AI assistance

Some code in this project was generated with assistance from AI. Humans directed architecture, review, and maintenance. See [AI_ASSISTANCE.md](AI_ASSISTANCE.md).

## Support

ChaosNexus is built by Tuned Chaos, a small independent studio. Support goes to the studio as a whole and keeps every Tuned Chaos project online. There is no support SLA.

- Monthly or one-time: [GitHub Sponsors](https://github.com/sponsors/TunedChaos)
- Card, any amount, with an optional ChaosNexus pick at checkout, or Chia (XCH): [Tuned Chaos supporters page](https://tunedchaos.com/supporters/)

File bugs on [chaosnexus-suite Issues](https://github.com/TunedChaos/chaosnexus-suite/issues) (pick a Component).


## License

AGPL-3.0-or-later. Commercial licensing: [chaosnexus.ai/guide/licensing](https://chaosnexus.ai/guide/licensing).
