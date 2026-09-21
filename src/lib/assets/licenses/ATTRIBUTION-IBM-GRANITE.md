# Model attribution — ChaosNexus Tuned + IBM Granite

## Default (Path 2): ChaosNexus Tuned v1 GGUF

- **Hub id:** `TunedChaos/ChaosNexus_Tuned_v1-GGUF`
- **File:** `ChaosNexus_Tuned_v1-Q4_K_M.gguf` (~5.0 GB Q4_K_M)
- **Base:** IBM Granite 4.1-8B-Instruct via `unsloth/granite-4.1-8b`
- **Adapter:** `TunedChaos/ChaosNexus_Tuned_v1`
- **Packaging license:** AGPL-3.0-or-later (unless a commercial license is obtained from Tuned Chaos)
- **Base model license:** follow IBM Granite / Unsloth Hub terms (Apache-2.0 for IBM Granite weights; see `LICENSE-APACHE-2.0.txt`)
- **Card:** https://huggingface.co/TunedChaos/ChaosNexus_Tuned_v1-GGUF

## Optional: IBM Granite Guardian

ChaosNexus can also pull stock `ibm-research/granite-guardian-3.2-5b-GGUF` (Apache-2.0). That is **not** the product default.

Weights are **not** shipped inside the ChaosNexus Forge installer. They are fetched into
`~/.chaosnexus/crucible/models/` after you accept the license checkbox in Settings, or you may
supply a local `.gguf` file.

This product is not affiliated with or endorsed by IBM. “Granite” and related marks are
trademarks of their respective owners.
