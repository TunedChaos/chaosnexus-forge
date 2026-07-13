import json
import shutil
from pathlib import Path

def generate_attributions():
    workspace_root = Path(__file__).parent.parent.parent.resolve()
    out_dir = workspace_root / "chaosnexus-website" / "guide" / "attributions"
    assets_dir = workspace_root / "chaosnexus-forge" / "src" / "lib" / "assets"
    
    # Clean output directory
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    modules = [
        {"file": "chaosnexus-anvil-licenses.json", "title": "ChaosNexus Anvil (Rust)", "type": "backend", "slug": "chaosnexus-anvil"},
        {"file": "chaosnexus-forge-backend-licenses.json", "title": "ChaosNexus Forge Backend (Rust)", "type": "backend", "slug": "chaosnexus-forge-backend"},
        {"file": "chaosnexus-forge-frontend-licenses.json", "title": "ChaosNexus Forge Frontend & Vhai (UI/Node)", "type": "frontend", "slug": "chaosnexus-forge-frontend"},
        {"file": "chaosnexus-codex-licenses.json", "title": "NexusDocs (VitePress/Website)", "type": "frontend", "slug": "chaosnexus-website"},
    ]
    
    index_content = [
        "# Attributions & Third-Party Licenses\n",
        "ChaosNexus, including ChaosNexus Forge and ChaosNexus Anvil, relies on incredible open-source projects. "
        "We are extremely grateful for the work of the maintainers of these projects.\n",
        "Please select a module below to view its associated licenses:\n"
    ]
    
    for mod in modules:
        filepath = assets_dir / mod['file']
        slug = mod['slug']
        title = mod['title']
        
        index_content.append(f"- [{title}](./{slug}.md)")
        
        md_content = [
            "<div v-pre>\n",
            f"# {title} - Attributions\n"
        ]
        
        if not filepath.exists():
            md_content.append(f"> License data not found for {title}. Please run the license generation script.\n")
        else:
            with open(filepath, 'r', encoding='utf-8') as f:
                try:
                    data = json.load(f)
                    
                    if mod['type'] == 'backend':
                        data.sort(key=lambda x: x.get('name', '').lower())
                        for item in data:
                            name = item.get('name', 'Unknown')
                            version = item.get('version', '')
                            repo = item.get('repository', '')
                            license = item.get('license', 'Unknown')
                            text = item.get('license_text', '')
                            
                            md_content.append(f"## {name} v{version}")
                            md_content.append(f"**License**: {license}")
                            if repo:
                                md_content.append(f"**Repository**: [{repo}]({repo})")
                            md_content.append("\n<details><summary>View License Text</summary>\n")
                            md_content.append(f"```text\n{text}\n```")
                            md_content.append("</details>\n")
                            
                    elif mod['type'] == 'frontend':
                        frontend_pkgs = []
                        if isinstance(data, dict):
                            for license_name, pkgs in data.items():
                                for pkg in pkgs:
                                    pkg_name = pkg.get('name', 'Unknown')
                                    version = pkg.get('versions', [''])[0] if pkg.get('versions') else ''
                                    repo = pkg.get('repository') or pkg.get('homepage') or ''
                                    lic = pkg.get('license') or license_name
                                    text = pkg.get('licenseText') or f"License: {lic}\nFull license text was not found in the installed package."
                                    frontend_pkgs.append({
                                        'name': pkg_name,
                                        'version': version,
                                        'repo': repo,
                                        'license': lic,
                                        'text': text
                                    })
                        
                        frontend_pkgs.sort(key=lambda x: x['name'].lower())
                        for item in frontend_pkgs:
                            name = item['name']
                            version = item['version']
                            repo = item['repo']
                            lic = item['license']
                            text = item['text']
                            
                            md_content.append(f"## {name} v{version}")
                            md_content.append(f"**License**: {lic}")
                            if repo:
                                if isinstance(repo, str) and repo.startswith('http'):
                                    md_content.append(f"**Repository**: [{repo}]({repo})")
                                elif isinstance(repo, str):
                                    md_content.append(f"**Repository**: {repo}")
                            md_content.append("\n<details><summary>View License Text</summary>\n")
                            md_content.append(f"```text\n{text}\n```")
                            md_content.append("</details>\n")
                except Exception as e:
                    md_content.append(f"> Error parsing licenses for {title}: {e}\n")
                    
        md_content.append("</div>\n")
        
        with open(out_dir / f"{slug}.md", 'w', encoding='utf-8') as f:
            f.write("\n".join(md_content))
            
    with open(out_dir / "index.md", 'w', encoding='utf-8') as f:
        f.write("\n".join(index_content))
        
    print(f"Generated split attributions in {out_dir}")

if __name__ == "__main__":
    generate_attributions()
