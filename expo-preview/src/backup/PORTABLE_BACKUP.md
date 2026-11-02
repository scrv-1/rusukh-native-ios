# Portable Files backup

The settings panel exports an ordinary folder, not a ZIP or an installable iOS app. It contains `study.json`, `preferences.json`, `media/` payloads, and a final `manifest.json`. Selecting a destination and selecting an existing backup use SDK 58 `Directory.pickDirectoryAsync`; the user must select the folder again in a later session. No persistent external URI is saved.

## Public API

`PortableBackupPanel` accepts `p`, `getSnapshot(): Promise<PortableSnapshot>`, `restoreStudy(Backup): Promise<boolean>`, optional `applyPreferences(PortablePreferences): Promise<void>`, and optional `disabled`.

`PortableSnapshot = { study: Backup; preferences: { isDark: boolean; workspace: Workspace } }`.

The host owns the SQLite transaction for snapshot capture, automatic pre-restore recovery point, text replacement, and draft invalidation. The panel performs no SQL. Preferences are a separate explicit action; text restore does not apply them.

## Preservation and validation

- Exports create a uniquely named child directory. Existing directories and files are not overwritten. A failed copy does not publish a completion manifest.
- All copied payloads receive native SHA-256 and size verification. Study and preference JSON are read back before the manifest is published. SHA-256 detects corruption; it does not authenticate the author of a backup.
- Preview bounds the source files before reading JSON, copies JSON into unique app-owned cache files, checks size/hash, and only then parses that owned copy. This avoids checking an external file and subsequently consuming changed bytes. Temporary cache files are removed in `finally`.
- Manifest schema, media types, canonical relative filenames, duplicate IDs, hashes, sizes, and backup data are validated. No arbitrary external paths are accepted. Media filenames are derived from validated lowercase IDs and a fixed extension allowlist.
- Import revalidates the selected manifest and every payload. Files are added to the app's media directory before text replacement. Existing payloads are reused only when identity, size, metadata, and hash match. Conflicting IDs get stable hash-derived imported IDs; pre-existing files are never overwritten.
- File-system and SQLite changes are **not** one atomic transaction. A failed or interrupted import can leave additional valid media, while text is unchanged. The UI states this explicitly. Retrying reuses complete media or repairs metadata after a payload was published. Unpublished attempt-owned `.pending` files are cleaned using their original URI, because Expo `File.move` changes an object's URI.
- Cancellation and app backgrounding are checked between file operations. In-progress native copies cannot be instantly aborted. After the SQL restore begins, the cancel control is hidden; the host owns atomic text recovery.

## Scope and limits

| Item | Limit / behavior |
| --- | --- |
| Study JSON | Existing core backup limit: 15 MiB; existing schema validation |
| Manifest | 1 MiB before JSON read |
| Presentation settings | 16 KiB; only dark mode and normalized workspace configuration |
| Media count | 1,000 files |
| Individual image / audio | 50 / 100 MiB |
| Study, preferences and media total | 512 MiB, excluding the at-most-1-MiB manifest |
| Copying | Sequential; no base64 archive or simultaneous large payload allocation |
| Excluded | Downloaded GGUF, active/pending recordings, drafts, notification identifiers, OS permissions, account credentials |
| Protection | Ordinary unencrypted files in the destination chosen by the user |

Only complete registered media-library items are exported. Unreadable registered items block a purported complete export instead of silently dropping them. Source PDF files are not in the current photo/audio library and therefore are not included; any imported study text remains in study JSON. The feature does not claim to preserve files the app has never registered or retained.

## Verification and remaining device work

Dedicated tests use a custom memory-filesystem adapter that computes real SHA-256 with Node crypto. These tests verify hashing and application behavior through that adapter; they do not exercise Expo’s native digest implementation. They cover corruption, oversized manifest before read, path traversal, duplicate IDs, external JSON mutation, failed copy, missing metadata recovery, stable collision handling, idempotency, selective preferences, exclusions, cancellation and temporary-file cleanup. UI tests cover read-only preview, explicit confirmation, success only after completion, failure reporting, disabled/double-submission behavior, preference-only restore and background cancellation.

These are behavioral adapter tests, **not** tests of iPhone Files, iCloud Drive permissions, or physical-device storage exhaustion. Before claiming physical support, test export to On My iPhone and iCloud Drive, terminate/reopen the app, select the backup folder again, preview, then restore on an empty installation and compare media hashes. Retain the original data during that test. SDK 58's actual native directory picker/digest APIs and the project's installed declarations were inspected; a fresh Expo Go session still needs this native end-to-end check.

## Primary sources consulted (2026-11-02)

- Expo SDK 58 FileSystem reference: https://docs.expo.dev/versions/v58.0.0/sdk/filesystem/
- Expo FileSystem changelog (async file operations and digest support): https://github.com/expo/expo/blob/main/packages/expo-file-system/CHANGELOG.md
- Community reproduction about iOS temporary-file copy permissions: https://github.com/expo/expo/issues/30108 (historical report, not evidence that SDK 58 still has the defect).
- Apple file management concepts: https://developer.apple.com/documentation/foundation/filemanager

The implementation responds to those reports by using the OS picker, awaiting SDK 58 writes/copies/moves, retaining original media, avoiding saved external absolute paths, and verifying each result before reporting completion. No additional runtime dependency, paid storage service, cloud upload, or account permission is introduced.
