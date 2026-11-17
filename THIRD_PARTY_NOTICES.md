# Third-party software

The licenses below were read on 2026-11-17 from each upstream repository via the GitHub API (`license.spdx_id`, plus the `LICENSE` file at the pinned tag for top-level packages). This is an inventory, not legal advice.

## Linked into the app

| Package | Pinned at | License | Used by | Where pinned |
|---|---|---|---|---|
| [open-spaced-repetition/swift-fsrs](https://github.com/open-spaced-repetition/swift-fsrs) | revision `4fbaf20184d62f82a9f44f343337c61a2c5483e9` | MIT | Xcode and xtool builds, `swift test` | `Package.swift`, `Package.resolved`, `project.yml` |
| [ml-explore/mlx-swift](https://github.com/ml-explore/mlx-swift) | 0.32.3 | MIT | Xcode build only | `project.yml` |
| [ml-explore/mlx-swift-lm](https://github.com/ml-explore/mlx-swift-lm) | 3.32.3 | MIT | Xcode build only | `project.yml` |
| [huggingface/swift-transformers](https://github.com/huggingface/swift-transformers) (`Tokenizers`) | 1.3.0 | Apache-2.0 | Xcode build only | `project.yml` |

Transitive packages declared by those manifests at the pinned tags (Xcode resolves their versions at build time):

| Package | License | Pulled in by |
|---|---|---|
| apple/swift-numerics | Apache-2.0 | mlx-swift |
| apple/swift-argument-parser | Apache-2.0 | mlx-swift (tools) |
| swiftlang/swift-syntax | Apache-2.0 | mlx-swift-lm (macros) |
| huggingface/swift-jinja | Apache-2.0 | swift-transformers |
| huggingface/swift-huggingface | Apache-2.0 | swift-transformers |
| apple/swift-collections | Apache-2.0 | swift-transformers |
| apple/swift-crypto | Apache-2.0 | swift-transformers |
| ibireme/yyjson | MIT | swift-transformers |
| apple/swift-docc-plugin | Apache-2.0 | documentation tooling only |

**Known gap:** only the swift-fsrs license is bundled in the app (`App/Resources/FSRS-LICENSE.txt`, checked by `scripts/verify-fsrs-license.py`). MIT and Apache-2.0 both require their notices to accompany distributed binaries, so the MLX and swift-transformers notices (and their transitive ones) should be added to the app bundle or an in-app acknowledgements screen before any public distribution.

## Downloaded at runtime (not in the repository or IPA)

| Asset | Source | License |
|---|---|---|
| Qwen3-4B-Instruct-2507, 4-bit MLX conversion | [mlx-community/Qwen3-4B-Instruct-2507-4bit](https://huggingface.co/mlx-community/Qwen3-4B-Instruct-2507-4bit) @ `50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b` | Apache-2.0 (upstream [LICENSE](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/resolve/cdbee75f17c01a7cc42f958dc650907174af0554/LICENSE), downloaded and hash-checked alongside the weights) |

## Build and CI tools (not distributed)

| Tool | Version | License |
|---|---|---|
| [xtool](https://github.com/xtool-org/xtool) | 1.24.0 (SHA-256 pinned in CI) | MIT |
| [XcodeGen](https://github.com/yonaskolb/XcodeGen) | latest from Homebrew (unpinned) | MIT |
| mlx / mlx-lm (Python, evaluation job only) | 0.32.4 / 0.32.2 | MIT |
