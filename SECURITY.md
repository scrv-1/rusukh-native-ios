# Security Policy

## Supported versions

Rusukh is early-stage software with no stable release yet. Only the latest commit on `main` receives security fixes.

## Reporting a vulnerability

**Please do not report security vulnerabilities in public issues, discussions or pull requests.**

Preferred channel: GitHub **private vulnerability reporting** — open the repository's *Security* tab and choose **Report a vulnerability**.

> **TODO (owner):** private vulnerability reporting is currently **disabled** for this repository (checked 2026-11-17). Enable it in *Settings → Code security → Private vulnerability reporting* so the link above works. Until it is enabled, open a short public issue titled "Security contact request" **without any vulnerability details**, and the maintainer will arrange a private channel.

Please include: affected commit or release, steps to reproduce, impact, and any suggested fix.

### What to expect

- Acknowledgement within 7 days (single volunteer maintainer — best effort).
- A fix or mitigation plan agreed with the reporter before public disclosure.
- Credit in the release notes / advisory if you want it.

## Scope

In scope: the code in this repository — local data storage and backup import/export (`Sources/RusukhCore/`), PDF and media import, local model download and checksum verification, and the GitHub Actions workflows.

Out of scope: vulnerabilities in third-party dependencies (please report upstream; see `THIRD_PARTY_NOTICES.md`), and issues that require a jailbroken device or physical access to an unlocked phone.

## Design notes relevant to security

- No accounts, servers or cloud API keys; all user data stays on the device.
- Backup imports are size-limited and validated before replacing data.
- Optional model files are downloaded only on user request and verified against pinned SHA-256 hashes (`docs/qwen-model-manifest.json`).
- No secrets are stored in this repository or its workflows. If you find one, report it privately as above.
