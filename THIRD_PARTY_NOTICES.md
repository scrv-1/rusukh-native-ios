# Third-party notices

Rusukh itself is licensed under the [MIT License](LICENSE). The components below are owned by their authors and remain under their own licenses. License identifiers were checked against each upstream repository via the GitHub API on 2026-11-17.

## Bundled in the app on `main`

| Component | Version | License | Use | Notice |
|---|---|---|---|---|
| [swift-fsrs](https://github.com/open-spaced-repetition/swift-fsrs) (© 2023 Ben Smiley) | commit `4fbaf20184d62f82a9f44f343337c61a2c5483e9` | MIT | FSRS-6 scheduling | Full text shipped in the app: `App/Resources/FSRS-LICENSE.txt` (presence verified in CI by `scripts/verify-fsrs-license.py`) |

## Linked in the Xcode build only (`project.yml`, `ai-probe.yml`)

| Component | Version | License |
|---|---|---|
| [mlx-swift](https://github.com/ml-explore/mlx-swift) | 0.32.3 | MIT |
| [mlx-swift-lm](https://github.com/ml-explore/mlx-swift-lm) | 3.32.3 | MIT |
| [swift-transformers](https://github.com/huggingface/swift-transformers) | 1.3.0 | Apache-2.0 |

Their transitive dependencies (for example swift-crypto, swift-jinja) are resolved by Xcode and are not yet listed here. **TODO:** generate a full transitive notice list before a stable release (ROADMAP R-13).

## Downloaded at runtime (not in this repository or the IPA)

| Component | License | Notes |
|---|---|---|
| Qwen3-4B-Instruct-2507 (`mlx-community/Qwen3-4B-Instruct-2507-4bit`) | Apache-2.0 (Hugging Face model card of `Qwen/Qwen3-4B-Instruct-2507`; LICENSE file pinned by revision in `docs/qwen-model-manifest.json`) | Downloaded only on user request; files pinned by revision and SHA-256 |

## On unmerged branches only (not on `main`)

| Component | License | Where |
|---|---|---|
| [@wllama/wllama](https://github.com/ngxson/wllama) 3.8.1 (© 2024 Xuan Son NGUYEN) | MIT | Embedded with its license text in `expo-preview/src/ai/engine.generated.ts` on the Expo branches (e.g. `cursor/expo-eas-update-c19e`). If that code is merged, keep the embedded notice and add this entry to the bundled section. |
| Expo / React Native npm dependencies | Mostly MIT/ISC/BSD/Apache-2.0; 3 × MPL-2.0 (lightningcss, build tooling) | `expo-preview/package-lock.json` on the Expo branches. No GPL/AGPL-only packages found in the production tree (license-checker, 2026-11-17). |
