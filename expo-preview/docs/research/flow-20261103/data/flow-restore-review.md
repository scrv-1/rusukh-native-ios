# Independent App restore barrier review — 2026-11-03

Result: **29/29 focused UI tests pass; no new data-loss bug reproduced in this scope.**

Command: `./node_modules/.bin/jest --runInBand tests/flow-restore.ui.test.jsx`

Final output: `flow-restore-green.log`. Initial output before adding six positive controls: `flow-restore-first.log` (23/23). These log files may be excluded by the repository's ignore rules.

`tests/flow-restore.ui.test.jsx` mounts the real App and its real `useNoteDraft`, `usePersistentDraft`, and `useAIStudySession` hooks. Storage, picker, sharing, and native file adapters are mocked; the backup panels expose their normal callbacks. No product file was changed for this review.

Coverage:

- Each retained `sourceDraft.v1`, `cardDraft.v1`, and `aiStudySession.v1` blocks JSON import, portable-folder replacement, and recovery-point replacement with editors closed (nine cases).
- Both absent slots and explicit null tombstones allow replacement on all three restore routes; App rereads all four draft keys without writing tombstones (six positive controls).
- Each new slot's failed initial read blocks replacement and preserves unread storage bytes (three cases).
- Each new slot's failed commit-time read blocks SQL after startup successfully found no draft (three cases).
- Each slot written directly to storage after mount is protected by the commit-time reread even when the hook's in-memory state is empty (three cases).
- Editing each new draft through its actual UI after the JSON picker opened, with its storage write held pending, prevents the older import callback from replacing study data. Completing the write retains the new text (three cases).
- Settings passes `file:///cache/` to the snapshot helper, shares only its successful result, and retries after snapshot failure without sharing a failed result (two cases).

Installed SDK source check: `expo-file-system` 58.0.11 `src/Paths.ts:10–11` returns a `Directory` from `Paths.cache`; `src/internal/NativeFileSystem.types.ts:51` declares its URI string. `expo-sqlite` 58.0.14 `src/pathUtils.ts:24–35` accepts the directory string and joins it with the database name. App's use of `Paths.cache.uri` is consistent with these installed interfaces. Settings explicitly says SQLite rescue cannot currently be imported in-app and excludes photos/audio.

Limits: this review does not execute Expo SQLite or native sharing on iPhone, does not prove successful device restore, and does not close D002's missing full-archive roundtrip requirement. The rescue helper's disk SQLite adapter coverage is recorded separately. No full suite was run in this review.

Source SHA-256 at verification:

```
47561d8f5fa7e0f1b27115479f2a4c928b695a6fbf1bfa44e9d31472af2d00ba  App.tsx
bc6a6f07760ebf886ab3226b2029e71e4f73b78d8a4736f0471a1f221d722f9b  src/usePersistentDraft.ts
42463f74b31273238fe41f6cbc7d02e06343bf83e32546a72aefcacb4c93e82a  src/ai/useAIStudySession.ts
1a044a6abe2c378b1696b5fa4b1260d9db02fc5fa9e67ae15584739143b82dbb  src/databaseSnapshot.ts
f9305a7476c8c200f49c340d7a89cba8cdeec297871de02e1e8acf8cbbefb9e7  tests/flow-restore.ui.test.jsx
```
