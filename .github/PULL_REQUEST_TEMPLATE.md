## What and why · ماذا ولماذا

<!-- One logical change. Link the issue if there is one: Fixes #123 -->

## How it was tested · كيف اختُبر

- [ ] `swift test` (state the platform: macOS / Linux)
- [ ] Xcode build, AppTests, UITests (local, or a linked Actions run)
- [ ] On a physical iPhone (describe it). Leave this unchecked if you did not run it on one.

## Checklist

- [ ] No secrets, certificates, provisioning profiles, Apple IDs, model weights or personal data
- [ ] Arabic/RTL layout checked for UI changes; new controls have accessibility labels
- [ ] `CFBundleDisplayName` is still ASCII `Rusukh` (SideStore)
- [ ] Data compatibility kept (v1/v2 backups, Expo migration); FSRS parameters unchanged, or the change is justified
- [ ] New dependencies are pinned and listed in THIRD_PARTY_NOTICES.md
- [ ] Docs updated if behaviour changed

## Risks · المخاطر

<!-- What could break, and how to roll back -->
