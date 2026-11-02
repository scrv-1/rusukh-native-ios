# Rusukh Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make existing study tools discoverable, setup clearer, and home customization reversible.

**Architecture:** Preserve SQLite and existing module screens. Fix navigation and presentation independently of study data; reuse validated draft import and isolated local AI engine.

**Tech Stack:** Expo 58, React Native 0.88.1, TypeScript, SQLite, Jest, existing Wllama WebView.

**Spec:** ../specs/2026-11-03-usability.md

## Global Constraints
- No new dependencies, paid services, billing changes or native CI.
- Preserve workspace.v1 and both application tracks.
- No claims of device validation, OCR, automatic YouTube extraction, FSRS or automatic model management.

## Review Focus
- Hidden tools remain reachable after restart and via fixed navigation.
- Failed preference saves retain editable selections and leave prior layout active.
- Empty notes/review state offers a useful next step, not an empty session.
- Oversize/invalid source or model selection retains previous usable state.
- Large text and Arabic controls wrap; physical VoiceOver verification remains pending.

### Task 1: Home and navigation
**Files:** App.tsx, src/StudyHome.tsx; tests/home.ui.test.jsx, tests/workspace.ui.test.jsx.
**Interfaces:** Existing callbacks; stable tabs home/notes/review/tools/settings. Add source/search entry through existing onModule.
- [x] Assert first creation/source/search controls precede module actions; zero-card review routes to notes.
- [x] Observe failing targeted Jest tests.
- [x] Move quick actions above panels; fixed tabs; compact searchable all-tools directory; clarify review grading and open source note.
- [x] Targeted Jest passes; preserve all previous data-safety tests.

### Task 2: Workspace presets
**Files:** src/workspace.ts, src/WorkspaceEditor.tsx; tests/workspace.ui.test.jsx.
**Interfaces:** workspacePreset(id: 'simple'|'reading'|'all'): Workspace; same version1 schema.
- [x] Assert presets apply only after save; cancel/failure leaves data and current layout untouched.
- [x] Observe failing tests.
- [x] Add three presets, show/hide all, preview count, ordinal positions and fixed-navigation explanation.
- [x] Confirm persistence, cancellation, hidden-tool recovery and no content mutation.

### Task 3: Intake and AI setup
**Files:** src/SourcesWorkbench.tsx and isolated tests; src/ai/LocalAILab.tsx, ai-lab engine/tests.
**Interfaces:** Existing onDraft and LocalAILab callbacks remain unchanged.
- [x] Source owner tests paste/automatic subtitle detection/retained draft before implementing.
- [x] AI owner tests invalid selection retaining ready model; clarify verified official download/local selection.
- [x] Record exact feature limits and red/green evidence.

### Task 4: Research and release
**Files:** docs/research/ux-20261103, RELEASE_0.5.0.md, evidence/v050, version metadata.
- [x] Verify 100 unique advice IDs and 50 distinct YouTube video URLs; label transcript versus metadata.
- [x] Build concise decision register mapping actual implementation and outstanding work.
- [x] Fresh reviewer audits branch and fixes; full release verification once final code is ready.
- [ ] Apply verified patch to branch work/expo-usability-20261103 based on93f5adb; push draft PR.
- [ ] Verify live Expo manifest and iOS bundle and record actual current link.

## Execution ledger
- Baseline: remote93f5adb1c2ee43195e0ceda35d39a9992c11e320; local synthetic checkpoint7ff0641, not an upstream commit.
- User explicitly authorized execution and upload without repeated confirmation; plan review pause waived by user instructions.
- Root owns home/navigation/presets; isolated agents own source intake, AI setup and research.

- Task1+2: home/workspace baseline5 failures then18 passes; final expanded localUI176 passes before one final study-title regression.
- Review: source-import overwrite reproduced and fixed with ownership invalidation; leavingSources also covered.
- Review: model-selection error race reproduced and fixed; totalAI28 passed.
- Research:100 tips,50 distinctYouTubeIDs,69 unique sourceURLs;22 descriptions28metadata. No viewingclaim.
- Ruling: retain isolated WebView and externalmodelpicker; automatic persistentdownload remains unimplemented pendingnative-storage/devicevalidation.
- Ruling: header/sizevalidation retainsoldmodel; a structurallyinvalidGGUF rejectedlater mayunloadit. Documentedandtested; no dualmodelload memoryrisk.
- Ruling: SwiftUI findings stayseparate; no MacCI rerun or unverifiednativepatch inExpo release.
- Whole-branch review findings addressed; finalresearch/titlecopyincrement requires finalverification of updatedsourcehashes.
