# Rusukh agent entry point

## Scope
- Rusukh is an Arabic-first learning app. Expo preview lives in `expo-preview/`; native Swift code is a separate target. Do not apply one target's test results to the other.
- Read `docs/CODEX_WORKFLOW.md` for current task routing. Read the dated handoff only for the goals relevant to the task. Do not load every historical report or generated engine into context.
- Begin with the actual checkout path, branch, HEAD, and working-tree changes. Preserve unrelated edits. Never assume `main` contains the current Expo implementation.
- Work on one bounded outcome with explicit acceptance checks. Keep other goals in the backlog; do not silently drop or claim them.

## Changes and verification
- Reproduce a behavioral defect, repair its cause, and run a relevant regression test. Do not weaken tests or hide failing checks to get a green result.
- Protect saved data, drafts, scheduling history, source provenance, and old backups. Keep self-recall distinct from four-choice assessment and the simple scheduler distinct from FSRS.
- For Expo, run from `expo-preview/`: `npm test`, `npm run test:ui`, `npm run typecheck`. AI changes also need `node --test ai-lab/test.mjs ai-lab/engine-runtime.test.mjs` and `node scripts/verify-ai-build.cjs`.
- Use `bash scripts/codex-setup.sh --check` from the repository root to verify an already-installed Expo checkout; omit `--check` to install from both lockfiles first.
- Run affected checks while iterating and one appropriate final gate. Do not repeat the same successful broad suite without a changed input or unresolved concern.
- Export/build, an HTTP response, and device acceptance are separate evidence. Never infer iPhone success from Node, Jest, or a simulator.

## Durable handoff
- At each tested milestone, preserve a reviewable commit or patch against the recorded baseline, plus changed-file hashes and concise test evidence. A prose report is not a code delivery.
- If Git is unavailable, save a changed-files archive outside the work copy and verify it can be applied to the baseline. Keep transfers below the receiving tool's observed limit; exclude `node_modules`, credentials, caches and unrelated files.
- The implementation owner delivers code and evidence. A separate review step validates the diff before integration and Expo/device delivery. Do not self-certify completion of the entire product.
- Environment setup prepares dependencies; publish a verified private environment before starting normal Cloud coding tasks. Do not keep implementing product features inside setup.
- Preserve proxy/TLS protections. Report transport, authorization, and allowed-domain failures separately. Do not reset an offline environment or delete its disk to recover unsaved work.

## Efficient context
- Use targeted `rg` and file sections. Keep generated assets, lockfiles and full logs on disk; report commands, exit codes and meaningful failures.
- Keep stable rules here and changing task state in one workflow/status document. Avoid duplicate instruction trees and speculative plugins.
- Do not install skills, expand access, merge main, pay, or publish beyond the user's current authorization.
