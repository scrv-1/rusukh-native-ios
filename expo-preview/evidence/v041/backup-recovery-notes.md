# Recovery protection for Expo 0.4.1

## Implemented

`restoreBackup(db, data)` still accepts the existing `rusukh-backup` version 1 format. Before replacing study content, it reads the current notes, cards and reviews through the same exclusive SQLite transaction, validates and serializes them, and inserts a recovery point. Only after that succeeds does it replace the study tables. Any failure rolls back the replacement, the new point and retention rotation together.

The additive `study_recovery_v1` table has an explicit schema version. It retains the newest three points, each bounded by the existing 15 MiB UTF-8 backup limit. The payload bound is not a bound on peak process memory or SQLite/WAL disk use. If the current library cannot produce a valid bounded point, import is refused instead of silently proceeding without recovery.

New APIs in `src/storage.ts`:

- `listRecoveryPoints(db)` returns newest-first metadata: `id`, `schemaVersion`, `createdAt`, `reason`, note/card/review counts and payload bytes.
- `readRecoveryPoint(db, id)` validates the selected persisted payload without modifying study data.
- `restoreRecoveryPoint(db, id)` reads the chosen point before retention rotation, stores the present library as a `before-recovery` point, then restores the chosen library within one transaction.

The new `RecoveryPointsPanel` is collapsed by default. It refreshes on mount/open and after a successful restore. The app owns confirmation and the actual mutation callback; a cancelled callback must return `false`. The panel has retry, in-flight submission protection, date/count presentation, and separate wording for successful restore followed by failed list refresh.

Integration:

```tsx
import { RecoveryPointsPanel } from './src/backup/RecoveryPointsPanel';
import { restoreRecoveryPoint, type RecoveryPoint } from './src/storage';

// Root supplies an async confirmation/action wrapper returning the real outcome.
<RecoveryPointsPanel db={db} p={p} disabled={busy} onRestore={restorePoint} />
```

After successful recovery, refresh study state and clear or explicitly reconcile the old editor draft. Do not pass recovery through `restoreBackup` again: `restoreRecoveryPoint` reads the selected target and rotates points atomically.

## Decisions and limits

- These points protect **study text and review history only**. Media files, workspace preferences, draft, theme and reminder settings are not rewound.
- In particular, do not replay saved operating-system notification identifiers. Reminder preferences and actual OS schedules need reconciliation through the reminder service.
- Points reside in the same application database. They are not protection from deletion of the app/container, device loss or physical database corruption. External export remains necessary.
- They do not change the portable JSON format or claim complete portable media backup. A separate archive implementation must stage and validate file payloads, preserve relative paths, reject traversal/size abuse, and coordinate failure rollback across files and SQL.
- No raw live `.db` file is copied. That would not reliably capture the associated WAL. The implementation instead takes a logical snapshot while holding the transaction; a future binary export should use SQLite's backup API or another consistent snapshot mechanism.
- Expo's exclusive helper uses a separate connection. Every query in this mutation runs through the supplied `tx`; unrelated writers can still encounter `database is locked`. The app's existing mutation lock remains important.

## Actual verification

- Initial red run: all seven initial recovery checks failed against the prior API/behavior. See `backup-recovery-red.txt`.
- Final storage run: **16/16** passed, comprising nine new recovery tests and seven existing storage tests. See `backup-recovery-green.txt`.
- New component run: **7/7** passed; `tsc --noEmit` completed successfully. See `backup-recovery-panel-green.txt`. The component's initial missing-module red evidence is separate and is not evidence of a previously shipped rendering failure.
- Coverage: real SQLite WAL close/reopen, original library roundtrip, metadata persistence, snapshot write failure, insertion failure, rollback after retention pruning, preservation of all three previous recovery points on failure, corrupted/incompatible/missing target rejection, validated-input mutation protection, and safe refusal when current library exceeds the snapshot bound.
- UI checks cover collapsed scope, empty state, read failure/retry, duplicate-tap prevention, cancellation, restore failure, actual restore success followed by refresh failure, and externally disabled mutations.
- These are Node SQLite and React component tests. No iPhone storage, VoiceOver, app-kill or device-full behavior was directly exercised.

## Sources used

- SQLite Online Backup API: https://www.sqlite.org/backup.html — consistent live snapshots and alternatives; source reference `turn172search0`.
- SQLite corruption guidance: https://www.sqlite.org/howtocorrupt.html — live-copy/WAL caveats; `turn172search2`.
- Expo SDK 58 SQLite docs: https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/ — transaction scope and competing writers; `turn172search18`.
- Expo maintainer documentation discussion: https://github.com/expo/expo/issues/41986 — exclusive helper opens a distinct connection; `turn172search17`.

The implementation is our application-specific choice informed by these sources; it is not a claim that SQLite recommends this exact retention policy or JSON schema.
