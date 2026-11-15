#!/usr/bin/env python3
"""Check the unsigned device IPA is an arm64 iPhone app a free Apple ID can re-sign."""
import plistlib
import struct
import sys
import zipfile

FORBIDDEN = (
    b"com.apple.developer.kernel.increased-memory-limit",
    b"aps-environment",
    b"com.apple.developer.icloud",
    b"com.apple.developer.ubiquity",
    b"com.apple.security.application-groups",
    b"com.apple.developer.associated-domains",
)

def main(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        apps = {name.split("/")[1] for name in names if name.startswith("Payload/") and name.count("/") >= 1 and name.split("/")[1].endswith(".app")}
        if len(apps) != 1:
            raise SystemExit(f"expected one Payload app, found {apps}")
        app = f"Payload/{next(iter(apps))}"
        info = plistlib.loads(archive.read(app + "/Info.plist"))
        if info.get("CFBundleIdentifier") != "com.scrv1.rusukhnative":
            raise SystemExit(f"unexpected bundle id {info.get('CFBundleIdentifier')}")
        binary_name = info.get("CFBundleExecutable", "RusukhNative")
        binary = archive.read(app + "/" + binary_name)
        if len(binary) < 8 or struct.unpack("<I", binary[:4])[0] != 0xFEEDFACF:
            raise SystemExit("device binary is not a thin 64-bit Mach-O")
        cpu = struct.unpack("<I", binary[4:8])[0]
        if cpu != 0x0100000C:
            raise SystemExit(f"device binary cpu type is {cpu:#x}, expected arm64")
        for name in names:
            if not name.startswith(app + "/"):
                continue
            blob = archive.read(name)
            for marker in FORBIDDEN:
                if marker in blob:
                    raise SystemExit(f"{name} contains {marker.decode()} which a free Apple ID cannot sign")
    print("FREE_IPA_OK", path, "arm64", "com.scrv1.rusukhnative")

if __name__ == "__main__":
    main(sys.argv[1])
