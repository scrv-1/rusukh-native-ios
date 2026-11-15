# Rusukh 0.4.1 — independent adversarial review

Date: 2026-11-02. Scope: `App.tsx`, `src/core.ts`, `src/storage.ts`,
`src/KnowledgeGraph.tsx`, recovery-points UI, portable-backup service and UI.
The reviewer did not edit application code. Implementation agents fixed the
findings below, then the reviewer independently repeated the failure probes.

**Result: no unresolved P1/P2 finding was identified in this reviewed scope.**
This is a source review plus Linux/Node and mocked-native verification, not a
claim that Files, iCloud, VoiceOver or the app were tested on a physical iPhone.

## Findings reproduced and fixed

| Finding | Severity | Reproduction before the fix | Fix and independent retest |
|---|---|---|---|
| External backup JSON could change between its SHA check and subsequent read | P2 | A filesystem mock returned the original study hash, then changed the valid, same-length title `ORIGINAL` to `TAMPERED`. Inspection incorrectly returned `TAMPERED` successfully. | Bounded external JSON is copied to a unique private cache file; SHA and parsing use that copy. Retest changed the external source immediately after copy: consumed title remained `ORIGINAL`, external title was `TAMPERED`, and temporary cache files remaining were **0**. |
| Cancelled media imports accumulated unpublished payloads | P2 | Cancelling immediately after each payload copy left three different `.pending` files after three retries. Actual files can be up to 100 MiB each. | `finally` removes only temporary paths created by that attempt. Paths are captured before `File.move` mutates the object URI. Retest: three cancellations left only a seeded, unrelated `.pending` file; a later retry imported one file successfully and preserved the published `PHOTO` payload. |
| Malformed wiki syntax caused quadratic regex scanning | P2 | On Linux/Node, unmatched `[` runs of 5k/10k/20k/40k characters took **21.9/81.3/327.5/1305.2 ms**, all yielding zero links. Valid note bodies permit up to one million characters. | A shared single-pass scanner now drives discovery and rename rewriting. Independent parity probe passed **980,800 input strings**, including Arabic, whitespace, CR/LF, brackets and pipes; **1,961,600 rewrite comparisons** also matched the prior regex semantics. One million unmatched brackets took **3.455 ms** in this warmed probe; one million malformed alias characters took **3.227 ms**. These timings demonstrate the regression fix in this runtime; they are not iPhone measurements or a controlled cross-device benchmark. |

The parser probe is reproducible from `expo-preview`:

```sh
node evidence/v041/adversarial-core-probe.cjs
```

Recorded output: `adversarial-core-probe.json`. The probe transpiles the current
TypeScript in memory and does not modify application code or `.test-build`.

## Preservation and integration checks

- Recovery snapshots and text replacement share one SQLite transaction. The
  latest three snapshots are retained; the requested recovery point is read
  before rotation can remove it. Replacement or snapshot failure rolls back.
- Backup inputs are validated and cloned before asynchronous replacement work.
  Oversized current study data blocks destructive import instead of silently
  skipping the safety snapshot. Existing settings and media remain separate.
- `capturePortableSnapshot` reads study data and supported preferences through
  one SQLite transaction. Appearance/workspace restoration writes both settings
  in one transaction and updates React state after commit.
- Successful study restore clears the old draft where possible and closes the
  quiz/editor. A failed follow-up read is marked stale without claiming that a
  committed write failed. Recovery confirmation cancellation resolves `false`.
- Graph rendering is bounded to 24 nodes per page, while search and relationships
  use the full note set. Off-page relation actions open the missing endpoint;
  isolated notes have an optional textual list. Page bounds are clamped.
- Quiz candidates are shuffled before selecting the requested count; distinct
  questions sharing an answer remain eligible. Choices are deduplicated by
  normalized answer and input card order is not mutated.
- Rename propagation shares the scanner and preserves raw aliases and unrelated
  text. Replacement uses callback strings, so a title containing `$&` is literal.
  Size failures occur inside the transaction and cannot leave partial backlinks.
- Portable import does not overwrite existing media. Stable collision paths and
  publication ordering support retries. SHA checks precede JSON parsing; fixed
  paths and validated media filenames prevent traversal. The completion manifest
  is written after export payloads and read back.

The installed Expo source was also checked: iOS `File.digest('SHA-256')` uses
CryptoKit with 64 KiB streamed reads; `File.delete` is synchronous, matching the
cleanup implementation. Folder picking uses the native directory picker with
security-scoped access. This establishes SDK API compatibility, not physical
provider success.

## Limits retained explicitly

- Filesystem media addition and SQLite study replacement cannot form one atomic
  transaction. An interrupted import may leave added media; the UI explains this
  and permits retry. Existing files are preserved.
- Recovery points are inside app storage and do not survive deletion of the app.
  They exclude photos/audio; portable folders include registered media.
- Portable backup excludes model files, draft state, active recordings and OS
  notification identifiers. Appearance restoration is a separate explicit action.
- Physical iPhone directory selection, iCloud download/provider behavior,
  VoiceOver, low-storage conditions, real memory/battery/thermal measurements
  and native SwiftUI build verification remain outside this review.

## Reviewed source fingerprints

| File | SHA-256 |
|---|---|
| `App.tsx` | `562a2d0004d94affcd28149dcad3f71c7257a1eea35b1fa82066a1989175b678` |
| `src/core.ts` | `7daef77e9cde1be65b4f4acba643688054d8f41ffe4c6ad5d2f3affab12e0152` |
| `src/storage.ts` | `ca85c2b6a9a7a2b783a45e79ab730dd76fcf437c11fa04d613a3e4023f86c4fc` |
| `src/KnowledgeGraph.tsx` | `9164876e833786098642c40788fff84b5b886fe3f5ecf448b87f5ebee72b6d26` |
| `src/backup/RecoveryPointsPanel.tsx` | `bbb97e1e931a113308dca965b4a0e4d45229839e6e61813ab0ed82d5c7b454fc` |
| `src/backup/PortableBackupPanel.tsx` | `cd7a36965bb5109e485574a021c5e55efcf3578cdea9f29a693139ee736d127a` |
| `src/backup/portable.ts` | `f774b5009dcd46f17828725dd40931cc0934b513e330d73792b06f9e0580ae33` |
