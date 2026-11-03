# Rusukh: bounded Codex tasks and durable delivery

Last reviewed: 2026-11-03, Asia/Riyadh. This file records changing workflow state; `AGENTS.md` holds stable rules.

## Current outcome
The user wants the latest verified Expo Go trial. Stop expanding features while recovering and delivering the existing changes. Codex owns code and regression tests; the parent assistant owns independent review, GitHub integration and the Expo trial.

Known source baseline: PR14 / `work/audit-context-20261103` at `2aa51bb8ebb4349c41f52491d30e88022111cb0d`. PR13 is separate; last read head `acc0d603db07c90c175797d369f55be12225fab6`. Recheck both live heads before integration. Native `main` is not the Expo baseline.

## One active task at a time
1. **Recover current code.** The existing Codex setup conversation ran product work before the environment was published. Its runtime went offline before it returned a patch. Recover the same saved workspace; do not recreate it or overwrite its disk. A report and visible historical commands are not the final files.
2. **Review and integrate a deliverable.** Verify baseline and changed-file hashes, inspect the diff, apply to an isolated checkout, and run relevant checks. Save a commit/PR before continuing. Do not label unrecovered Codex changes as shipped.
3. **Prepare a reusable environment.** Select the actual Expo branch, run `bash scripts/codex-setup.sh`, record the tested install/start setup, then publish privately after readiness is verified. New coding work starts in a new Cloud task from that published environment. Existing tasks retain their own files.
4. **Deliver the trial.** Use the exact tested commit and an authorized reachable host; check Expo client compatibility, the iOS manifest and the referenced non-empty bundle. Provide the actual current URL and expiry. Device acceptance stays unverified until exercised on the phone.

## Recovery evidence and limits
- The original setup conversation: https://chatgpt.com/local/01a1a0f3-6830-7057-99fe-37ac56a610f6?hostId=local
- Its reported paths: baseline `/workspace/rusukh-pr14-baseline`; work `/workspace/rusukh-pr14-work`; logs `/workspace/rusukh-execution/evidence`. Persistence after disconnection has not been independently verified.
- The parent prepared and byte-verified 160 Expo source/config/test files, including both generated engines, plus separate PR13 reference files. This was a selected source delivery, not a complete Git history.
- Parent's verified PR14 baseline: 141 core tests, 332 UI tests, full TypeScript check passed. These numbers do not validate later Codex changes.
- Codex reported fixes for stale review/note writes, invalid grades and source identity conflicts, plus a separate authored MCQ flow and a successful iOS export. The final changed files and final test logs have not yet been received; these remain reported results.
- Codespaces device was Offline at the last read. The Codex setup also reported Offline. Do not substitute an old Expo URL or claim a preview is running.

## Task packet
Each coding task needs only: outcome; exact repo/ref; affected paths; acceptance checks; constraints; expected deliverable. Keep the 26 product goals in `docs/CODEX_HANDOFF_20261103.md`, read relevant sections as needed, and preserve deferred goals separately.

Required handoff: baseline and final commit/hashes, patch or changed-files archive, tests actually run and exit codes, unresolved acceptance criteria, and any migration/rollback notes. No blanket "100% complete" or invented phone proof.

## Research applied
- [Official Cloud environment lifecycle](https://learn.chatgpt.com/docs/environments/cloud-environments): prepare/test/publish setup, then start an isolated coding task; existing tasks retain their own state.
- [Official iterative workflow](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex): durable repository guidance and explicit phase acceptance evidence.
- [Community workflow discussion](https://www.reddit.com/r/codex/comments/1wkvk7d/how_do_you_structure_codex_workflows_for/): concise stable rules, changing state elsewhere, focused checks and review separate from implementation. These are user reports, not guarantees.
- [Community concise context advice](https://www.reddit.com/r/codex/comments/1u97eq0/how_to_make_codex_work_fantastically/): use a small instruction entry point and avoid accumulating unrelated tools and stale prose. Unverified claims elsewhere in that thread are not adopted.
- [Community staged handoff](https://www.reddit.com/r/codex/comments/1wxiifl/succesfull_agent_setup_i_use/): inspect the repo, define acceptance criteria, implement, then review the actual diff. Its model-routing and extra-agent setup are not prerequisites for this project.
