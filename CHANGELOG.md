# Changelog

All notable changes, reconstructed from the git history, pull requests and GitHub releases of this repository. Dates are commit/merge dates (UTC). Format inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project has no stable version numbers yet.

## [Unreleased] — branch `oss/readiness-20261117`

### Added
- `LICENSE`: MIT, Copyright (c) 2026 scrv-1 (owner decision, 2026-11-17).
- English `README.md`; Arabic README moved to `README.ar.md`.
- `CONTRIBUTING.md` (incl. AI-assisted contribution disclosure), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md`, issue forms and PR template.
- `ROADMAP.md`, `docs/ARCHITECTURE.md`, `THIRD_PARTY_NOTICES.md`, this changelog.
- Linux CI for the core library (`.github/workflows/ci-core.yml`) and `dependabot.yml`.
- 27 edge-case tests for storage, backup import/export, legacy migration and the study engine (53 → 80 core tests on Linux).

### Fixed
- Search folds Arabic alef variants (أ إ آ ٱ → ا), alef maksura (ى → ي) and teh marbuta (ة → ه), so `احمد` finds `أحمد` (ported from PR #24).
- Deleting a note now asks for confirmation; full-swipe delete is disabled (ported from PR #24).
- Review grade buttons grade the card shown on screen, not whatever is first in the due list at tap time (ported from PR #24).
- `Package.resolved` was committed but also ignored by `.gitignore`; it is now tracked consistently.
- README no longer claims the repository is private and no longer links to expired CI artifacts.

## Pre-releases — 2026-11-16

Three unsigned IPA pre-releases for SideStore testing: `rusukh-sidestore-20261116-60b26b5`, `-ce5bfb0`, `-dab8f28` ([releases](https://github.com/scrv-1/rusukh-native-ios/releases)).

## 2026-11-16 — `main`
- Use an ASCII `CFBundleDisplayName` ("Rusukh") so SideStore can install the app (`61a4a38`, `96df46c`).

## 2026-11-15
- PR #20 (merged into `feature/rusukh-complete`, not `main`): green device IPA for SideStore and data-safety fixes.

## 2026-11-01 — `main`
- PR #4: fix the audio session lifecycle (serialised, off the main thread) and add versioned FSRS-6 scheduling for new cards; bundle the swift-fsrs MIT license and verify it in CI; stress test of 1,000 cards × 32,000 reviews with backup round-trips.
- PR #3: optional Arabic MLX inference (Qwen3-4B-Instruct-2507, 4-bit) with pinned, checksum-verified downloads; privacy manifest; simulator boot-order fix.

## 2026-10-31 — `main`
- Initial import of the native SwiftUI app, study engine, storage and Expo-backup migration.
- PR #1: Arabic search (diacritics/tatweel-insensitive) and persistence fixes; verified xtool builds.
- PR #2: native PDF text import, audio attachments and review reminders.
