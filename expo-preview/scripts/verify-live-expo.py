"""Verify the live iOS development manifest and bundle, without launching a web build."""
import datetime
import hashlib
import json
import subprocess
import tempfile
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

headers = {"Expo-Platform": "ios", "Accept": "application/expo+json"}
expected_version = json.loads(Path('app.json').read_text())["expo"]["version"]
evidence = Path("evidence") / ("v" + expected_version.replace('.', ''))
evidence.mkdir(parents=True, exist_ok=True)
with urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8081/", headers=headers), timeout=60) as response:
    local = json.load(response)
host = local["extra"]["expoClient"]["hostUri"]
def fetch(url, target, manifest=False):
    args = ["curl", "--fail", "--silent", "--show-error", "--max-time", "120", "--output", str(target), "--write-out", "%{http_code}"]
    if manifest:
        for key, value in headers.items():
            args += ["--header", key + ": " + value]
    result = subprocess.run(args + [url], check=True, text=True, capture_output=True)
    return int(result.stdout)

with tempfile.TemporaryDirectory(prefix="rusukh-expo-verify-") as tmp:
    manifest_path = Path(tmp) / "manifest.json"
    manifest_status = fetch("https://" + host + "/", manifest_path, manifest=True)
    manifest = json.loads(manifest_path.read_text())
client = manifest["extra"]["expoClient"]
assert client["version"] == expected_version, client["version"]
assert client.get("extra", {}).get("appVersion") == expected_version, client.get("extra")
parsed = urlsplit(manifest["launchAsset"]["url"])
bundle = urlunsplit(("https", parsed.netloc, parsed.path, parsed.query, parsed.fragment))
digest, size = hashlib.sha256(), 0
with tempfile.TemporaryDirectory(prefix="rusukh-expo-bundle-") as tmp:
    bundle_path = Path(tmp) / "bundle.js"
    bundle_status = fetch(bundle, bundle_path)
    with bundle_path.open("rb") as response:
        while chunk := response.read(1024 * 1024):
            digest.update(chunk)
            size += len(chunk)
result = {
    "observedAtUTC": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "version": client["version"], "extraAppVersion": client["extra"]["appVersion"], "sdkVersion": client["sdkVersion"],
    "expoGoURL": "exp://" + host, "manifestHTTPStatus": manifest_status,
    "bundleHTTPStatus": bundle_status, "bundleBytes": size, "bundleSHA256": digest.hexdigest(),
    "limits": "HTTP verification from Codespaces; not an iPhone launch. The development tunnel requires a running Codespace."
}
(evidence / "live-expo-verification.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2), flush=True)
