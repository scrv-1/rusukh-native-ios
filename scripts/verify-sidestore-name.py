#!/usr/bin/env python3
"""SideStore 0.7.x registers the App ID name from raw Info.plist CFBundleDisplayName (then CFBundleName).
Apple rejects non-ASCII App ID names, so those keys must be ASCII. The Arabic home-screen name lives in lproj/InfoPlist.strings."""
import plistlib
import re
import sys
import zipfile

def main(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        app = next(n.split("/")[1] for n in names if n.startswith("Payload/") and n.split("/")[1].endswith(".app"))
        root = f"Payload/{app}/"
        info = plistlib.loads(archive.read(root + "Info.plist"))
        for key in ("CFBundleDisplayName", "CFBundleName", "CFBundleExecutable"):
            value = info.get(key, "")
            if not value or not re.fullmatch(r"[A-Za-z0-9 ]+", value):
                raise SystemExit(f"{key}={value!r} must be non-empty ASCII letters, digits or spaces for SideStore App ID registration")
        if not re.fullmatch(r"[A-Za-z0-9.-]+", info.get("CFBundleIdentifier", "")):
            raise SystemExit(f"invalid CFBundleIdentifier {info.get('CFBundleIdentifier')!r}")
        for forbidden in ("_CodeSignature/", "embedded.mobileprovision", "PlugIns/", "Extensions/", "Watch/"):
            if any(n.startswith(root + forbidden) for n in names):
                raise SystemExit(f"unexpected {forbidden} in unsigned IPA")
        strings = root + "ar.lproj/InfoPlist.strings"
        if strings not in names:
            raise SystemExit("missing ar.lproj/InfoPlist.strings with the Arabic display name")
        raw = archive.read(strings)
        try:
            localized = plistlib.loads(raw)
        except Exception:
            text = raw.decode("utf-16") if raw[:2] in (b"\xff\xfe", b"\xfe\xff") else raw.decode("utf-8")
            localized = dict(re.findall(r'"([^"]+)"\s*=\s*"([^"]*)"\s*;', text))
        if localized.get("CFBundleDisplayName") != "رُسوخ":
            raise SystemExit(f"Arabic display name missing: {localized!r}")
    print("SIDESTORE_NAME_OK", info["CFBundleDisplayName"], info["CFBundleName"], info["CFBundleIdentifier"], "home screen:", localized["CFBundleDisplayName"])

if __name__ == "__main__":
    main(sys.argv[1])
