# Architecture

This describes the code at the time of writing. File and line references point to the source; if they drift, the source wins.

## Layout

```
Sources/RusukhCore/   Platform-light domain logic (SwiftPM library, testable on macOS and Linux)
App/                  SwiftUI app: views, LibraryStore, media, on-device AI
Tests/                XCTest for RusukhCore            (swift test)
AppTests/             XCTest hosted in the app          (Xcode scheme RusukhNative)
UITests/              XCUITest Arabic journeys          (Xcode scheme RusukhNative)
scripts/              CI helpers: simulator preview, UI tests, IPA and license verification
project.yml           XcodeGen spec (full app, MLX dependencies)
xtool.yml + Package.swift (RUSUKH_XTOOL=1)   Alternative xtool build without MLX
```

`Package.swift` has two modes. By default it exposes `RusukhCore` and its tests. With `RUSUKH_XTOOL=1` it builds the whole repository as one `RusukhNative` target for xtool. The Xcode build (XcodeGen) compiles `App/` and `Sources/RusukhCore/` into one app target, so the app does not `import RusukhCore`.

## Data model and storage

- `StudySnapshot` (`Sources/RusukhCore/StudyModels.swift`) holds every note, card and review event. It has a format tag and a version (1, or 2 once any card has FSRS state).
- `StudySnapshot.isValid()` enforces limits: 10,000 notes, 50,000 cards, 100,000 reviews, a 4 MB image and a 2 MB audio clip per note, and referential integrity.
- `StudyRepository` (`StudyRepository.swift`) stores the snapshot as a single pretty-printed JSON file in Application Support. It writes atomically with iOS file protection `completeUntilFirstUserAuthentication` and refuses files of 80 MB or more.
- `LibraryStore` (`App/LibraryStore.swift`) is the `@MainActor` `ObservableObject` the views use. Every mutation copies the snapshot, validates it, saves it, and only then publishes it (`commit`, around line 37). If the file on disk cannot be read, the store locks itself and will not overwrite it.
- Backups are the same JSON format. On import, the app falls back to `LegacyExpoMigration` for the earlier Expo prototype's format.

Trade-off: rewriting one JSON file keeps backup, restore and migration simple and easy to audit. The cost is that every save re-encodes everything, including embedded media, on the main actor. That cost grows with the library. [docs/OPEN_SOURCE_MAP.md](docs/OPEN_SOURCE_MAP.md) records GRDB (MIT) as the candidate replacement, with a measured migration first.

## Scheduling

- New cards get FSRS-6 state (`ReviewScheduler.swift`), using the pinned swift-fsrs revision, canonical v6 weights, 0.9 retention, 1m/10m learning steps, and no fuzz. The algorithm and parameter-set identity are stored with each card, and incomplete state is rejected on decode.
- Cards created before FSRS keep the older SM-2-like `StudyEngine.scheduled`. They are never silently migrated. See [docs/FSRS_INTEGRATION.md](docs/FSRS_INTEGRATION.md).

## Notes, search and graph

- Search (`StudyEngine.matches`) strips Arabic diacritics and tatweel, folds case, and requires every query term to appear.
- `[[Title]]` and `[[Title|alias]]` links resolve by normalized title. Ambiguous titles do not link (`graphEdges`).
- `GraphView` lays the nodes out on a circle and draws the edges with `Canvas`.
- Cards can be extracted from explicit `س:`/`ج:` (or `Q:`/`A:`) lines (`questionAnswers`). This is not AI generation.

## Media

- Camera: `UIImagePickerController`. Images are scaled to 1200 px and stored as JPEG inside the note.
- Voice: `VoiceAttachment` (`App/VoiceAttachment.swift`) records AAC, up to 180 s and 2 MB. One `AudioSessionCoordinator` (core, unit-tested) serializes the activation, use and release of the audio session, so a stale editor cannot deactivate a newer one.
- PDF: `PDFTextImport` extracts text with PDFKit. It stops at 20 MB, 100 pages, or 1,000,000 characters, and there is no OCR.

## On-device AI (optional)

- `NativeAIEngine` uses Apple Foundation Models when the device, OS and language support it.
- `ArabicModelAssets` (actor) downloads Qwen3-4B-Instruct-2507-4bit from a pinned Hugging Face revision. It downloads over Wi-Fi only, uses an ephemeral session, checks a size limit per file, and verifies SHA-256. Files are excluded from iCloud backup.
- `ArabicModelRuntime` runs the model with MLX. Generation is gated on 8 GB of physical memory (`App/ArabicModelView.swift:25`) and stops on background, thermal or memory pressure.
- Note text reaches a model only when the user explicitly picks it, bounded by `LocalModelRequest`. There is no cloud API.

## Localization and RTL

- The root view forces `.rightToLeft` (`App/RusukhNativeApp.swift`). UI strings are Arabic literals.
- `CFBundleDisplayName` is ASCII `Rusukh`, because SideStore derives the App ID name from it and Apple rejects Arabic letters. The localized home-screen name «رُسوخ» lives in `App/ar.lproj/InfoPlist.strings`. `scripts/verify-sidestore-name.py` checks this in CI. Do not change it without re-testing a SideStore install.

## CI

`.github/workflows/ios-unsigned.yml` runs on a macOS runner and does the following:
1. Runs the core tests.
2. Generates the Xcode project, then builds a simulator app and an unsigned IPA.
3. Verifies the IPA: no entitlements a free Apple ID cannot sign, the ASCII name, and the bundled FSRS license.
4. Builds the xtool IPA.
5. Runs the UI tests with a hash-verified model.
6. Runs a Mac-only MLX inference probe with the network denied.
7. Uploads the evidence.

Today it triggers on pushes to `fix/sidestore-compat` and on manual dispatch, not on pull requests.
