# Security Policy

## Supported versions

There are no tagged releases yet. Security fixes target the current development branch (`fix/sidestore-compat` at the time of writing) and then `main`.

## Reporting a vulnerability

Please **do not** put vulnerability details in a public issue, PR or discussion.

- Preferred: GitHub private vulnerability reporting, under the repository's **Security** tab › *Report a vulnerability*. (The maintainer must enable this. If the button is missing, use the next option.)
- Otherwise, open a public issue titled "Security contact request" **without details**, and the maintainer ([@scrv-1](https://github.com/scrv-1)) will arrange a private channel.

Please include the affected file or commit, steps to reproduce, and impact. This is a volunteer project, so there is no response-time guarantee. Reports will be acknowledged when they are read.

## Threat model and data handling (summary)

- **Local only.** Notes, cards, reviews, images and audio are stored in one JSON file under Application Support. iOS file protection is `completeUntilFirstUserAuthentication`. There is no server, account, analytics or tracking (`App/PrivacyInfo.xcprivacy`).
- **Backups are unencrypted JSON** that the user exports through the share sheet. The app says so in Settings. Treat them like the notes themselves.
- **Imports are untrusted input.** Size limits apply (80 MB file, plus per-field limits), as do referential-integrity checks and strict FSRS state decoding (`StudySnapshot.isValid`, `FSRSSchedule.init(from:)`). A failed import never replaces existing data.
- **Network.** The only network use is the optional, user-initiated model download: pinned Hugging Face revision, Wi-Fi only, ephemeral session, per-file size limit and SHA-256 verification (`App/ArabicModelAssets.swift`). Study text is never sent anywhere.
- **Permissions.** Camera, microphone (usage strings in `project.yml`) and local notifications, each requested only when used.
- **Signing.** The CI produces unsigned IPAs. No certificates, provisioning profiles, Apple IDs or tokens belong in this repository.

## Out of scope

Issues that need a jailbroken device or physical access to an unlocked phone, and the security of third-party sideloading tools (SideStore, iloader, xtool), are out of scope. Report those upstream.
