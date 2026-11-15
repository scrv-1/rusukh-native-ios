"""Verify bundled license bytes and document-sharing privacy in app archives."""
import hashlib
import plistlib
from pathlib import Path
from zipfile import ZipFile

expected = Path("App/Resources/FSRS-LICENSE.txt").read_bytes()
for artifact in ("RusukhNative-simulator.zip", "RusukhNative-unsigned.ipa", "RusukhNative-xtool-unsigned.ipa"):
    with ZipFile(artifact) as archive:
        notices = [name for name in archive.namelist()
                   if name.endswith("/FSRS-LICENSE.txt") and not name.startswith("__MACOSX/")]
        if not notices or not any(archive.read(name) == expected for name in notices):
            raise SystemExit(f"Missing or mismatched FSRS license in {artifact}")
        print("FSRS_LICENSE_VERIFIED", artifact, hashlib.sha256(expected).hexdigest(), notices)
        app_plists = [name for name in archive.namelist()
                      if name.endswith("RusukhNative.app/Info.plist") and not name.startswith("__MACOSX/")]
        if len(app_plists) != 1:
            raise SystemExit(f"Expected exactly one app Info.plist in {artifact}")
        info = plistlib.loads(archive.read(app_plists[0]))
        debug_simulator = artifact == "RusukhNative-simulator.zip"
        for key in ("UIFileSharingEnabled", "LSSupportsOpeningDocumentsInPlace"):
            # An absent key defaults to false. A string such as "NO" is not a Boolean.
            actual = info.get(key, False)
            if type(actual) is not bool or actual != debug_simulator:
                raise SystemExit(f"Unexpected {key}={actual!r} in {artifact}")
        print("DOCUMENT_SHARING_VERIFIED", artifact, debug_simulator)
