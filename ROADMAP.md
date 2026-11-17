# Roadmap

Planned work, not promises. Items come from the open entries in [docs/IMPLEMENTATION_LEDGER.md](docs/IMPLEMENTATION_LEDGER.md) (IDs in brackets) and the OSS-readiness audit of 2026-11-17. Nothing here is implemented unless it is also listed in the README's feature table.

## Project health (next)

- Choose and add a `LICENSE` (owner decision).
- Enable private vulnerability reporting, Dependabot alerts and secret scanning (repository settings).
- Triage the open stacked pull requests (#5–#23): merge, rebase or close each with a written reason.
- First tagged, non-pre-release version with release notes.
- English translations of the key Arabic docs.

## Reliability and data

- Move storage from a single JSON file to SQLite (GRDB) with atomic migration and rollback copy [R-02].
- Import that lets the user choose merge vs replace, with a restore point; ZIP export with attachments and safe extraction limits [R-10].
- Stable note IDs for links, backlinks, rename handling and large-graph tests [R-08].
- Licence/NOTICE audit for every shipped dependency, font and model before a stable release [R-13].

## Learning features

- OCR for scanned Arabic PDFs (Vision first, evaluated on an Arabic reference set) [R-07].
- Optional on-device Arabic transcription for voice notes (e.g. WhisperKit) with measured WER/CER [R-06].
- Markdown / math rendering in notes with RTL + mixed LTR tests [R-05].
- Measured local semantic search with correct source links [R-09].

## Device verification

- Install and test on a real iPhone: persistence, camera, microphone, notifications [R-11, R-12].
- VoiceOver, Dynamic Type and visual RTL regression tests [R-04].
- Local model memory, thermal and battery measurements on an eligible device [R-11].
