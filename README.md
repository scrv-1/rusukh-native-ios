# Rusukh (رُسوخ) — Arabic-first, offline study app for iOS

> **Project status: early / new.** Public since 2026-10-31, one maintainer, no tagged stable release yet (only unsigned pre-release IPAs). Not yet installed or verified on a physical iPhone.
>
> **License: TODO — pending owner decision.** This repository does **not** contain a `LICENSE` file yet. Until one is added, all rights are reserved by the owner and the code is *not* open source in the OSI sense. See [Licensing](#licensing).
>
> العربية: [README.ar.md](README.ar.md)

Rusukh ("rusūkh", *firm rootedness*) is a native SwiftUI app for students who study in Arabic. It keeps notes, flashcards, spaced-repetition reviews and an optional on-device language model **entirely on the phone** — no account, no server, no cloud API key.

## Why

Most study and spaced-repetition tools treat Arabic as an afterthought: left-to-right layouts, search that breaks on diacritics (tashkeel) and tatweel, and AI features that require sending notes to a cloud service. Rusukh is built Arabic-first and offline-first:

- Right-to-left UI throughout.
- Search that ignores diacritics and tatweel (`ـ`).
- Local storage only; optional local model with pinned, checksum-verified downloads.

## Features that exist in the code today

| Area | What is implemented | Where |
|---|---|---|
| Notes | Local notes, Arabic-aware search, `[[Note title]]` wiki links and an interactive link graph | `Sources/RusukhCore/StudyEngine.swift`, `App/NotesView.swift`, `App/GraphView.swift` |
| Flashcards | Cards from explicit `س:`/`ج:` or `Q:`/`A:` lines (not AI-generated), multiple-choice quiz | `StudyEngine.questionAnswers`, `StudyEngine.quiz` |
| Spaced repetition | FSRS-6 for new cards via [swift-fsrs](https://github.com/open-spaced-repetition/swift-fsrs); older cards keep their earlier SM-2-like schedule | `Sources/RusukhCore/ReviewScheduler.swift` |
| Storage & backup | Size-limited atomic JSON store, validated import/export (v1/v2), migration from the earlier Expo prototype backup format | `StudyRepository.swift`, `StudyModels.swift`, `LegacyExpoMigration.swift` |
| Media | Camera photo, AAC voice note (≤180 s, ≤2 MB), text extraction from PDFs (≤20 MB, ≤100 pages; no OCR) | `App/VoiceAttachment.swift`, `Sources/RusukhCore/PDFTextImport.swift` |
| Reminders | Optional local review reminder (user permission; no background processing) | `App/ReviewReminderView.swift` |
| Local AI (optional) | Apple Foundation Models where available; optional Qwen3-4B-Instruct-2507 (4-bit) via Swift MLX in the Xcode build, with pinned files, SHA-256 checks, cancel and delete. AI answers need human review and never create cards automatically | `App/ArabicModelRuntime.swift`, `App/ArabicModelAssets.swift`, `docs/qwen-model-manifest.json` |

Known limits (from the project's own test notes): MLX inference does not run in the iOS Simulator; on-device inference, real camera/microphone, notification delivery, full VoiceOver and battery/thermal behaviour have **not** been tested on a real phone. See [docs/TEST_COVERAGE.md](docs/TEST_COVERAGE.md).

## Screenshots

No app screenshots are committed on `main` yet. Real iOS Simulator screenshots exist on the open delivery branch (PR #21), for example the
[home screen](https://github.com/scrv-1/rusukh-native-ios/blob/cursor/delivery-gate-install-tour-74f5/docs/tour/tour-01-home.png) and
[RTL note view](https://github.com/scrv-1/rusukh-native-ios/blob/cursor/delivery-gate-install-tour-74f5/docs/tour/tour-02-rtl.png).

## Repository layout

```
Sources/RusukhCore/   Portable core logic (models, storage, search, links, scheduling, migration) — builds on Linux and Apple platforms
Tests/                XCTest suite for RusukhCore (runs on Linux and macOS)
App/                  SwiftUI app (iOS 26+): views, LibraryStore, media, local AI
AppTests/, UITests/   Xcode-only app and UI tests (Simulator)
scripts/              CI helpers: simulator preview, UI tests, xtool build, license/model verification
docs/                 Engineering notes, test coverage, install guide, CI evidence excerpts (mostly Arabic)
project.yml           XcodeGen spec for the app; ai-probe.yml for the macOS model probe; xtool.yml for xtool builds
```

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Build and test

### Core library (Linux or macOS) — verified

Requires Swift 6.2+ (tools-version 6.2). Verified on 2026-11-17 with Swift 6.4.2 on Debian Linux x86_64:

```bash
swift build --build-tests
swift test            # 80 tests, 0 failures on Linux (PDFKit tests are skipped on Linux)
```

The same commands run in CI on every push and pull request to `main` ([`.github/workflows/ci-core.yml`](.github/workflows/ci-core.yml)).

### iOS app (macOS + Xcode)

Minimum deployment target is iOS 26. On a Mac with a suitable Xcode:

```bash
brew install xcodegen
xcodegen generate --spec project.yml
open RusukhNative.xcodeproj
```

The manual workflow [`ios-unsigned.yml`](.github/workflows/ios-unsigned.yml) (Actions → *iOS - SwiftUI build and simulator preview* → Run workflow) runs core tests, builds simulator and unsigned device apps, launches the app in a simulator, and runs the Arabic UI tests. It uses a macOS runner; check your Actions quota before running it. Artifacts are kept for 7 days.

### Installing on an iPhone

The CI produces **unsigned** IPAs; you must sign them yourself (Xcode Personal Team, SideStore, AltStore, Sideloadly or xtool). See [docs/INSTALL_ON_IPHONE.md](docs/INSTALL_ON_IPHONE.md) (Arabic). Pre-release IPAs are on the [Releases](https://github.com/scrv-1/rusukh-native-ios/releases) page.

## Tech stack

Swift 6 / SwiftUI, XCTest, SwiftPM, XcodeGen, xtool. Dependencies: swift-fsrs (MIT, pinned by commit), and for the Xcode build only mlx-swift 0.32.3, mlx-swift-lm 3.32.3 and swift-transformers 1.3.0. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Roadmap

See [ROADMAP.md](ROADMAP.md). History of changes: [CHANGELOG.md](CHANGELOG.md).

## Contributing

Contributions and bug reports are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues: please follow [SECURITY.md](SECURITY.md) and do not open a public issue.

Parts of this codebase were written with AI coding agents under the maintainer's direction and review; this is disclosed in [CONTRIBUTING.md](CONTRIBUTING.md#ai-assisted-contributions).

## Licensing

**TODO (owner decision required):** choose and add a `LICENSE` file (for example MIT or Apache-2.0; both are compatible with the current dependencies). Until then the default is "all rights reserved".

Third-party components keep their own licenses — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The swift-fsrs MIT license is bundled with the app at `App/Resources/FSRS-LICENSE.txt`.

## Maintainer

[@scrv-1](https://github.com/scrv-1) — repository owner and sole maintainer.
