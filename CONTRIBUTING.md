# المساهمة في رُسوخ · Contributing

شكرًا لاهتمامك. المشروع صغير ويصونه شخص واحد، لذلك نفضّل التغييرات الصغيرة الواضحة المرفقة بالاختبارات.

Thanks for your interest. This is a small single-maintainer project; small, focused, tested changes are easiest to review. English and Arabic are both welcome in issues and PRs.

## قبل أن تبدأ · Before you start

- ابحث في الـIssues أولًا. للتغييرات الكبيرة (التخزين، الجدولة، الذكاء المحلي) افتح Issue للنقاش قبل كتابة الكود.
- For large changes (storage, scheduling, AI runtime) open an issue first.
- Read [ARCHITECTURE.md](ARCHITECTURE.md). Please keep these invariants:
  1. **Offline-first, no accounts, no analytics.** Do not add network calls except the user-initiated, hash-pinned model download.
  2. **Data safety.** Never overwrite a store that failed to load. Validate before saving (`StudySnapshot.isValid`). Imports must stay backward-compatible with v1/v2 and the Expo format.
  3. **FSRS-6 parameters are pinned** (`ReviewScheduler.swift`). Changing them changes users' schedules, so it needs an issue, a reason and tests.
  4. **SideStore compatibility.** `CFBundleDisplayName` stays ASCII `Rusukh`. The Arabic name comes from `App/*.lproj/InfoPlist.strings`.
  5. **Arabic/RTL first.** New UI must work right-to-left with Arabic text and have accessibility labels.
  6. **Licenses.** Prefer Apple frameworks and permissively licensed packages (MIT/Apache-2.0/BSD). Record any new dependency in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and pin it to an exact version or revision.

## الإعداد · Setup

Requirements: macOS with Xcode that has the iOS 26 SDK, and [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`).

```bash
swift test                              # RusukhCore unit tests
xcodegen generate --spec project.yml    # creates RusukhNative.xcodeproj (git-ignored)
open RusukhNative.xcodeproj             # scheme RusukhNative: app, AppTests, UITests
```

- No Mac: core logic tests run on Linux with a Swift 6.2+ toolchain (`swift test`). PDFKit- and macOS-only tests are compiled out there.
- The full app build, UI tests and IPA packaging run in GitHub Actions (`.github/workflows/ios-unsigned.yml`, workflow **iOS - SwiftUI build and simulator preview**).
- The workflow does not yet run automatically on pull requests. A maintainer starts it on your branch with *Run workflow*.

## الاختبارات · Tests

- Logic belongs in `Sources/RusukhCore` with XCTest cases in `Tests/`.
- App-hosted behaviour goes in `AppTests/`. Full Arabic user journeys go in `UITests/`. Use `accessibilityIdentifier` for new controls you test.
- Bug fixes should include a test that fails before the fix.
- Do not claim a device result (camera, microphone, notifications, MLX on iPhone) unless you ran it on a device. Say what you tested and where. [docs/TEST_COVERAGE.md](docs/TEST_COVERAGE.md) tracks the gaps.

## طلبات الدمج · Pull requests

1. Branch from the branch named in the issue (currently `fix/sidestore-compat` holds the latest green code), not from `main`.
2. Make one logical change per commit. Use an imperative subject such as `fix: …`, `docs: …`, `test: …`.
3. Fill in the PR template: what changed, why, how it was tested, and the risks.
4. Do not commit secrets, signing certificates, provisioning profiles, Apple IDs, model weights or personal backups.
5. Workflow changes (`.github/workflows/`) are reviewed with extra care. Pin actions and downloads.

## أول مساهمة · First contributions

Issues labelled `good first issue` are meant to be self-contained. If none are open, docs, accessibility labels, Arabic copy fixes and extra tests for `StudyEngine` are good starting points.

## الترخيص · License

The repository has **no license yet**. Until the owner adds one, contributions cannot be accepted under clear terms. Please open an issue before investing significant work. Once a license is added, contributions are expected to be made under it.

## السلوك · Conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
