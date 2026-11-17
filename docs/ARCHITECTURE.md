# Architecture (as implemented on `main`, 2026-11-17)

This describes the code that exists today. Proposed future changes are in [ROADMAP.md](../ROADMAP.md). (A separate design proposal lives on the unmerged branch `engineering/audit-phase1` under `engineering/ARCHITECTURE.md`.)

## Layers

```
┌──────────────────────── App/ (SwiftUI, iOS 26+) ─────────────────────────┐
│ RusukhNativeApp → RootView (TabView, forced RTL)                          │
│   HomeView · NotesView · ReviewView · GraphView · LocalAIView             │
│   ReviewReminderView · ArabicModelView                                    │
│ LibraryStore (@MainActor ObservableObject) — single source of UI state    │
│ VoiceAttachment (AVFoundation) · NativeAIEngine (FoundationModels,        │
│   NaturalLanguage, CoreML) · ArabicModelRuntime/Assets (MLX, Tokenizers)  │
└───────────────┬──────────────────────────────────────────────────────────┘
                │ uses
┌───────────────▼──────── Sources/RusukhCore/ (portable, Linux-testable) ──┐
│ StudyModels      StudyNote, StudyCard, ReviewEvent, StudySnapshot +       │
│                  isValid() limits and referential integrity               │
│ StudyRepository  load/save/encode/decode of the JSON store (atomic,       │
│                  80 MB cap, iOS file protection)                          │
│ LegacyExpoMigration  converts the Expo prototype backup ("rusukh-backup") │
│ StudyEngine      Arabic-aware search, [[wiki links]], graph edges,        │
│                  Q:/A: (س:/ج:) extraction, legacy scheduler, due, quiz    │
│ ReviewScheduler  FSRS-6 state (FSRSSchedule) via swift-fsrs               │
│ PDFTextImport    PDFKit text extraction with size/page limits (Apple only)│
│ AudioSessionCoordinator  serial, ownership-checked AVAudioSession control │
│ LocalModelRequest  bounds prompt/context sent to the local model          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Data flow and persistence

- All user data lives in one JSON file: `Application Support/RusukhNative/study.json` (UI tests use a separate path).
- `LibraryStore.init` loads it through `StudyRepository.load()`. A missing file means an empty library. **A file that cannot be read locks storage** (`storageLocked`) so the app never overwrites a damaged file.
- Every change goes through `LibraryStore.commit`, which validates the whole `StudySnapshot` and writes it atomically (`.completeFileProtectionUntilFirstUserAuthentication` on iOS).
- Export = `StudyRepository.encode` (pretty-printed, sorted keys) to a temporary file shared by the user. Import = `StudyRepository.read` → native format, or fall back to `LegacyExpoMigration`; data is replaced only if the import validates.
- Backup format `rusukh-native-backup`: version 1 (legacy scheduler only) or 2 (contains FSRS state; incomplete FSRS state is rejected).

## Scheduling

- New cards use FSRS-6 (`ReviewScheduler`, parameter set `canonical-v6-retention-0.9-steps-1m-10m`).
- Cards created before FSRS keep the simple SM-2-like `StudyEngine.scheduled`, so existing review dates are not rewritten.

## Local AI

- Optional and offline. Apple Foundation Models are used only when the device supports them.
- Qwen3-4B-Instruct-2507 (4-bit MLX) is downloaded only on explicit user request, verified against SHA-256 hashes in `docs/qwen-model-manifest.json`, and can be cancelled/deleted. Requires ≥8 GB RAM and 5 GB free space checks. MLX is linked in the Xcode build only (not the xtool build).
- AI output is shown for human review and never creates cards automatically.

## Builds

| Build | Spec | Notes |
|---|---|---|
| Core library + tests | `Package.swift` (default) | Linux/macOS; CI: `ci-core.yml` |
| iOS app (Xcode) | `project.yml` (XcodeGen) | includes MLX; CI: `ios-unsigned.yml` (manual, macOS) |
| iOS app (xtool) | `Package.swift` with `RUSUKH_XTOOL=1`, `xtool.yml` | no MLX |
| macOS model probe | `ai-probe.yml` | offline inference check on Mac |

## Known architectural limits (see ROADMAP)

- Whole-file JSON rewrite on every change and media embedded as base64 in the same file (scales poorly; GRDB migration proposed).
- Import replaces data (no merge UI yet).
- `LibraryStore` holds most app logic on the main actor.
