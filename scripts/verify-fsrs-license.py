"""Verify the MIT notice is actually shipped in every app build."""
import hashlib
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
