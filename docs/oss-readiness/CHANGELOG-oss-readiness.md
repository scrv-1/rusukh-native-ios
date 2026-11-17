# OSS-readiness change log (branch `oss/readiness-20261117`)

Started 2026-11-17 19:35 (UTC+3) from `main` @ `96df46c`. Author identity for commits made from the box: `scrv-1 <scrv-1@users.noreply.github.com>`. Exception: `c653aff` (the workflow file) was created through the GitHub connector because the CLI token lacks the `workflow` scope; GitHub recorded it with the account's primary email.
Rules followed: no destructive git, no force push, no merge to `main`, no release, no settings/visibility/license change, no PR/issue closed. A full backup of all refs was taken before starting (git bundle, kept outside the repository).

Overlap check: `engineering/audit-phase1` (last commit 2026-11-17 11:56 UTC+3) and `feature/mcp-tools-v1` (14:58 UTC+3) had not moved since. They touch `engineering/*`, `App/HomeView.swift`, `App/NotesView.swift`, `Sources/RusukhCore/MCPTools.swift`, `Tests/MCPToolsTests.swift`. This branch touches none of those files. The only conceptual overlap is architecture docs: this branch adds `docs/ARCHITECTURE.md` (current state), theirs `engineering/ARCHITECTURE.md` (proposal); the new file links to theirs.

## Baseline (before any change)

| Check | Command | Result |
|---|---|---|
| Core build | `swift build --build-tests` (Swift 6.4.2, Linux x86_64) | pass |
| Core tests | `swift test` | 53 executed, 0 failures (PDFKit tests compile out on Linux) |
| iOS build/UI | `ios-unsigned.yml` | last `main` run 43827359766 (2026-11-16) **failed** — see diagnosis below |

## Changes

| # | Problem | Evidence | Fix | Test run | Result | Commit | Phase |
|---|---|---|---|---|---|---|---|
| 1 | `Package.resolved` tracked but ignored | `.gitignore` line 6; file committed; docs/FSRS_INTEGRATION.md says the pin lives in Package.resolved | Removed the ignore rule (apps should commit resolved deps) | `swift test` | 53/53 | `5d3d1d4` | 5.1/5.6 |
| 2 | No tests for corrupted store, invalid-save overwrite, legacy-migration rejects, search/link/quiz edges | Test inventory of `Tests/` | 27 new XCTest cases in `Tests/StorageAndMigrationEdgeCaseTests.swift`, `Tests/StudyEngineEdgeCaseTests.swift`; no production code changed | `swift test` | 80/80 | `482fa9c` | 5.4 |
| 3 | No CI on push/PR to `main` | `ios-unsigned.yml` is `workflow_dispatch` only | `ci-core.yml` (contents: read, SHA-pinned checkout, digest-pinned swift image, no secrets) + `dependabot.yml` (actions, swift) | actionlint; same commands locally | lint clean; 80/80 | `9e3e638` (dependabot) + `c653aff` (workflow) | 5.5 |
| 4 | Arabic-only README, wrong "private repo" claim, 5 dead artifact links, no license statement | API: repo public since 2026-10-31; run 41301469379 artifacts `total_count: 0` | English `README.md`; `README.ar.md` keeps the Arabic text minus those errors; license TODO | link/claim review | — | `4b61b43` | 5.2 |
| 5 | Community profile 28%: no CONTRIBUTING/CoC/SECURITY/templates | `GET /community/profile` | Added files; AI-assistance disclosure; PVR TODO (PVR currently disabled per API) | YAML parse of issue forms | ok | `a0403a6` | 5.6 |
| 6 | No architecture overview, roadmap, changelog or third-party notices | repo tree | Added `docs/ARCHITECTURE.md`, `ROADMAP.md`, `CHANGELOG.md`, `THIRD_PARTY_NOTICES.md` | SPDX via GitHub/HF API | — | `b22193a` | 5.1/5.6 |
| 7 | This log | — | — | — | — | `fc42d86` | 10 |

Final local run after all changes (clean `.build`): `swift build --build-tests && swift test` → **80 tests, 0 failures**. gitleaks on the new commits: no leaks.

## Diagnosis: "Launch simulator and capture preview" failing on `main`

- Failing run: [43827359766](https://github.com/scrv-1/rusukh-native-ios/actions/runs/43827359766) (2026-11-16, `main` @ `96df46c`).
- Log: the step started 09:19:41Z; the first output (`Monitoring boot status for iPhone 17 … Device already booted`) appeared at 09:21:37Z, i.e. ~2 minutes to boot the simulator. After that there was **no output** until `##[error]The action 'Launch simulator and capture preview' has timed out after 7 minutes` at 09:27:08Z. The script (`scripts/simulator-preview.sh`) runs `status_bar override`, `install`, `launch`, `sleep 5`, `screenshot` without per-command logging, so the exact slow sub-command is not visible.
- Comparison with the same step on branch `fix/sidestore-compat` (same script, step timeout raised to 12 min in commit `b2e66d1`): 5m44s (run 43856409555, success), 9m49s (43848475233, success), 5m38s (43840250222, success).
- **Root cause (high confidence):** the step's 7-minute budget is shorter than the normal cold-runner duration of this step (5.5–10 min observed). It is a CI time-budget problem, not an app crash; the same app and script succeed when given 12 minutes.
- **Not fixed on this branch**, because: (a) the fix already exists in open PR #23 (`fix/sidestore-compat`), and changing the same workflow lines here would create a conflict; (b) verifying it needs a paid macOS (`xcode-27`) run, which the README asks to check quota for first. Recommendation: merge PR #23's timeout change after owner review, and add `echo` markers between the `simctl` commands so future timeouts show which call hangs. Note 9m49s is close to the new 12-minute limit.

## Remaining issues (not addressed here)

- No `LICENSE` (owner decision).
- Private vulnerability reporting, Dependabot alerts and secret scanning are disabled (repository settings).
- 15 open stacked PRs; `main` has two commits pushed directly while PR #23 is open.
- `ios-unsigned.yml`: actions pinned by tag not SHA; custom runner label `xcode-27`.
- iOS app, AppTests and UITests were not run in this pass (need macOS).
