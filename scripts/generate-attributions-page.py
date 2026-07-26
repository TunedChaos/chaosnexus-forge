# chaosnexus-forge/scripts/generate-attributions-page.py
"""Split ChaosNexus license JSON inventories into VitePress attribution pages."""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any


def _render_backend_items(data: list[dict[str, Any]]) -> list[str]:
    """Render cargo-about style license arrays into markdown sections."""
    lines: list[str] = []
    data.sort(key=lambda x: str(x.get("name", "")).lower())
    for item in data:
        name = item.get("name", "Unknown")
        version = item.get("version", "")
        repo = item.get("repository", "")
        license_name = item.get("license", "Unknown")
        text = item.get("license_text", "")

        lines.append(f"## {name} v{version}")
        lines.append(f"**License**: {license_name}")
        if repo:
            lines.append(f"**Repository**: [{repo}]({repo})")
        lines.append("\n<details><summary>View License Text</summary>\n")
        lines.append(f"```text\n{text}\n```")
        lines.append("</details>\n")
    return lines


def _render_frontend_items(data: dict[str, Any]) -> list[str]:
    """Render pnpm-licenses-style dicts (license → packages) into markdown."""
    lines: list[str] = []
    frontend_pkgs: list[dict[str, str]] = []
    for license_name, pkgs in data.items():
        if not isinstance(pkgs, list):
            continue
        for pkg in pkgs:
            if not isinstance(pkg, dict):
                continue
            pkg_name = pkg.get("name", "Unknown")
            versions = pkg.get("versions") or []
            version = versions[0] if versions else ""
            repo = pkg.get("repository") or pkg.get("homepage") or ""
            lic = pkg.get("license") or license_name
            text = pkg.get("licenseText") or (
                f"License: {lic}\nFull license text was not found in the installed package."
            )
            frontend_pkgs.append(
                {
                    "name": str(pkg_name),
                    "version": str(version),
                    "repo": str(repo) if repo else "",
                    "license": str(lic),
                    "text": str(text),
                }
            )

    frontend_pkgs.sort(key=lambda x: x["name"].lower())
    for item in frontend_pkgs:
        lines.append(f"## {item['name']} v{item['version']}")
        lines.append(f"**License**: {item['license']}")
        repo = item["repo"]
        if repo:
            if repo.startswith("http"):
                lines.append(f"**Repository**: [{repo}]({repo})")
            else:
                lines.append(f"**Repository**: {repo}")
        lines.append("\n<details><summary>View License Text</summary>\n")
        lines.append(f"```text\n{item['text']}\n```")
        lines.append("</details>\n")
    return lines


def _render_license_payload(data: Any, preferred: str) -> list[str]:
    """
    Render license JSON regardless of accidental type mismatch.

    preferred is 'backend' (list) or 'frontend' (dict). Detection wins when the
    on-disk shape does not match preference (historically broke Codex pages).
    """
    if isinstance(data, list):
        return _render_backend_items(data)
    if isinstance(data, dict):
        return _render_frontend_items(data)
    return [f"> Unexpected license payload type for preferred={preferred}: {type(data)}\n"]


def _static_scripts_page() -> list[str]:
    return [
        "<div v-pre>\n",
        "# ChaosNexus Scripts - Attributions\n",
        "ChaosNexus Scripts is first-party Rhai source (plugins and shared libraries).\n",
        "## Project license\n",
        "**AGPL-3.0-or-later** - see the `LICENSE` file in "
        "[chaosnexus-scripts](https://codeberg.org/TunedChaos/chaosnexus-scripts).\n",
        "There is no separate Node/Cargo dependency tree for this polyrepo. Runtime "
        "execution is licensed under ChaosNexus Anvil and its third-party crates; "
        "see [Anvil attributions](./chaosnexus-anvil.md).\n",
        "## Rhai language\n",
        "Plugins are authored in [Rhai](https://rhai.rs/) (BSD-2-Clause / Apache-2.0 "
        "dual license for the language implementation). The language implementation "
        "is a dependency of Anvil, not of this scripts tree.\n",
        "</div>\n",
    ]


def _static_tuned_page() -> list[str]:
    return [
        "<div v-pre>\n",
        "# ChaosNexus Tuned - Attributions\n",
        "ChaosNexus Tuned is the dataset, evaluation, and fine-tuning pipeline. "
        "Source code is **AGPL-3.0-or-later** (see `LICENSE` in "
        "[chaosnexus-tuned](https://codeberg.org/TunedChaos/chaosnexus-tuned)).\n",
        "## Project license\n",
        "Pipeline scripts and tooling in this repository are AGPL-3.0-or-later. "
        "Published adapters and GGUF artifacts on Hugging Face carry their own "
        "model cards and license metadata; always read the Hub card for the "
        "artifact you download.\n",
        "## Base models and Hub artifacts\n",
        "Fine-tunes and GGUF exports are derived from third-party base models. "
        "Those base models (and any redistributed weights) remain under their "
        "upstream licenses. Example defaults used by ChaosNexus:\n",
        "- Adapter: [TunedChaos/ChaosNexus_Tuned_v1](https://huggingface.co/TunedChaos/ChaosNexus_Tuned_v1)\n",
        "- GGUF: [TunedChaos/ChaosNexus_Tuned_v1-GGUF](https://huggingface.co/TunedChaos/ChaosNexus_Tuned_v1-GGUF)\n",
        "Confirm the base-model license on each Hub card before redistribution.\n",
        "## Training stack (Python)\n",
        "Tuned depends on common ML packages (for example torch, transformers, "
        "peft, unsloth, pandas). Install-time licenses come from those packages "
        "and their transitive dependencies. Prefer inspecting "
        "`chaosnexus-tuned/pyproject.toml` and your local virtualenv license "
        "metadata when redistributing a training environment.\n",
        "Inference runtime third-party crates are listed under "
        "[Crucible attributions](./chaosnexus-crucible.md).\n",
        "</div>\n",
    ]


def generate_attributions() -> None:
    workspace_root = Path(__file__).parent.parent.parent.resolve()
    out_dir = workspace_root / "chaosnexus-website" / "guide" / "attributions"
    assets_dir = workspace_root / "chaosnexus-forge" / "src" / "lib" / "assets"

    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    modules = [
        {
            "file": "chaosnexus-anvil-licenses.json",
            "title": "ChaosNexus Anvil (Rust Engine)",
            "type": "backend",
            "slug": "chaosnexus-anvil",
        },
        {
            "file": "chaosnexus-forge-backend-licenses.json",
            "title": "ChaosNexus Forge Backend (Rust Tauri)",
            "type": "backend",
            "slug": "chaosnexus-forge-backend",
        },
        {
            "file": "chaosnexus-forge-frontend-licenses.json",
            "title": "ChaosNexus Forge Frontend & Vhai (UI/Node)",
            "type": "frontend",
            "slug": "chaosnexus-forge-frontend",
        },
        {
            "file": "chaosnexus-codex-licenses.json",
            "title": "ChaosNexus Codex (Rust Documentation Engine)",
            "type": "backend",
            "slug": "chaosnexus-codex",
        },
        {
            "file": "chaosnexus-crucible-licenses.json",
            "title": "ChaosNexus Crucible (Rust Candle Machine Learning Runtime)",
            "type": "backend",
            "slug": "chaosnexus-crucible",
        },
        {
            "file": "chaosnexus-website-licenses.json",
            "title": "ChaosNexus Website (VitePress Documentation Site)",
            "type": "frontend",
            "slug": "chaosnexus-website",
        },
    ]

    index_content = [
        "---\n"
        'title: "Attributions & Third-Party Licenses"\n'
        'description: "Third-party license inventories for ChaosNexus components"\n'
        "---\n",
        "# Attributions & Third-Party Licenses\n",
        "ChaosNexus components (Anvil, Forge, Codex, Crucible, Scripts, Tuned, and "
        "this documentation site) rely on open-source projects. We are grateful "
        "to their maintainers.\n",
        "Project licensing (AGPL-3.0-or-later and commercial options) is summarized "
        "on the [Licensing](/guide/licensing) page.\n",
        "Select a module below for third-party inventories:\n",
    ]

    for mod in modules:
        filepath = assets_dir / mod["file"]
        slug = mod["slug"]
        title = mod["title"]

        index_content.append(f"- [{title}](./{slug}.md)")

        md_content = [
            "<div v-pre>\n",
            f"# {title} - Attributions\n",
        ]

        if not filepath.exists():
            md_content.append(
                f"> License data not found for {title}. "
                "Run `pnpm generate-licenses` from `chaosnexus-forge/` "
                "(or `./scripts/generate-licenses.sh`).\n"
            )
        else:
            with open(filepath, "r", encoding="utf-8") as handle:
                try:
                    data = json.load(handle)
                    md_content.extend(_render_license_payload(data, mod["type"]))
                except Exception as exc:  # noqa: BLE001 - surface parse errors in docs
                    md_content.append(f"> Error parsing licenses for {title}: {exc}\n")

        md_content.append("</div>\n")
        (out_dir / f"{slug}.md").write_text("\n".join(md_content), encoding="utf-8")

    # First-party trees without cargo/pnpm inventories.
    scripts_md = _static_scripts_page()
    (out_dir / "chaosnexus-scripts.md").write_text("\n".join(scripts_md), encoding="utf-8")
    index_content.append(
        "- [ChaosNexus Scripts (Rhai plugins & libraries)](./chaosnexus-scripts.md)"
    )

    tuned_md = _static_tuned_page()
    (out_dir / "chaosnexus-tuned.md").write_text("\n".join(tuned_md), encoding="utf-8")
    index_content.append(
        "- [ChaosNexus Tuned (datasets & fine-tuning)](./chaosnexus-tuned.md)"
    )

    (out_dir / "index.md").write_text("\n".join(index_content) + "\n", encoding="utf-8")
    print(f"Generated split attributions in {out_dir}")


if __name__ == "__main__":
    generate_attributions()
