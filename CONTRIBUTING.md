# Contributing to Rusukh (رُسوخ)

Thanks for your interest! Rusukh is a small, early-stage project with a single maintainer ([@scrv-1](https://github.com/scrv-1)), so please be patient with review times. Contributions in Arabic or English are welcome.

> **License note:** the project does not have a `LICENSE` file yet (pending owner decision). Please wait for a license before submitting substantial code, so your contribution can be accepted under clear terms.

## Ways to help

- Report bugs or confusing Arabic/RTL behaviour (use the issue templates).
- Improve docs, especially English translations of the Arabic engineering notes in `docs/`.
- Add tests for `Sources/RusukhCore` — they run on Linux, no Mac needed.
- Pick an issue labelled `good first issue` (when available).

## Development setup

**Core library (Linux or macOS):** Swift 6.2 or newer.

```bash
swift build --build-tests
swift test
```

**iOS app (macOS):** Xcode with the iOS 26 SDK, plus XcodeGen.

```bash
xcodegen generate --spec project.yml
open RusukhNative.xcodeproj
```

See [README.md](README.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the layout.

## Pull request process

1. Fork, then create a branch from `main` with a descriptive name (`fix/…`, `feat/…`, `docs/…`).
2. Keep changes focused; one topic per pull request.
3. Add or update tests for logic changes in `Sources/RusukhCore`.
4. Run `swift test` locally and paste the summary line in the PR.
5. CI (`Core tests (Linux)`) must pass. The macOS workflow is run manually by the maintainer when `App/` changes.
6. The maintainer reviews every PR before merging. Nothing is merged to `main` without review.

### Rules that protect users' data

- Never break reading of existing backups (`rusukh-native-backup` v1/v2, legacy `rusukh-backup` v1). If a format changes, add a migration **and** a test.
- Keep size limits and validation on every import path.
- No network calls except explicit, user-initiated model downloads with pinned checksums.
- Never commit secrets, signing certificates, provisioning profiles, Apple account data, or personal notes (including in test fixtures, logs and screenshots).

### Style

- Follow the existing Swift style (Swift 6, SwiftUI). Prefer small, testable functions in `RusukhCore` and keep UI code in `App/`.
- User-facing strings are Arabic-first; keep RTL layout in mind.
- Commit messages: imperative mood, short summary line, explain *why* in the body.

## AI-assisted contributions

Transparency note: a significant part of this repository was produced with AI coding agents working under the maintainer's direction. In the git history, 34 commits (as of 2026-11-17) are authored by `Cursor Agent <cursoragent@cursor.com>`, and many others carry `Co-authored-by` trailers from agent sessions. The maintainer decides what is merged and is responsible for the result.

If you use AI tools:

- Say so in the PR description and describe what the tool did.
- You are responsible for the change: read it, run the tests, and make sure you have the right to submit it (no copied code with incompatible licenses).
- Do not paste private user data, secrets or unreleased security details into AI tools.

## Code of Conduct

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md). Security issues: see [SECURITY.md](SECURITY.md).
