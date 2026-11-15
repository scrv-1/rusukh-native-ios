#!/usr/bin/env bash
set -euo pipefail
SIMULATOR_ID=$(cat evidence/simulator-id.txt)
if ! xcrun simctl list devices booted -j | python3 -c 'import json,sys; target=sys.argv[1]; devices=json.load(sys.stdin)["devices"]; sys.exit(0 if any(d["udid"] == target and d["state"] == "Booted" for group in devices.values() for d in group) else 1)' "$SIMULATOR_ID"; then
  xcrun simctl boot "$SIMULATOR_ID"
fi
xcrun simctl bootstatus "$SIMULATOR_ID" -b
# Prefer the software keyboard so XCTest typeText can obtain first-responder focus.
defaults write com.apple.iphonesimulator ConnectHardwareKeyboard -bool false || true
xcrun simctl privacy "$SIMULATOR_ID" grant microphone com.scrv1.rusukhnative
# Warm the simulator before XCTest's first launch to reduce Xcode launch timeouts.
APP_PRODUCT="$RUNNER_TEMP/simulator-build/Build/Products/Debug-iphonesimulator/RusukhNative.app"
if [[ -d "$APP_PRODUCT" ]]; then
  xcrun simctl install "$SIMULATOR_ID" "$APP_PRODUCT" || true
  xcrun simctl launch "$SIMULATOR_ID" com.scrv1.rusukhnative || true
  sleep 2
  xcrun simctl terminate "$SIMULATOR_ID" com.scrv1.rusukhnative || true
fi
FIXTURE_DIR="$RUNNER_TEMP/model-fixture"
mkdir -p "$FIXTURE_DIR"
printf 'abc' > "$FIXTURE_DIR/fixture-a.txt"
printf 'abcd' > "$FIXTURE_DIR/fixture-b.txt"
python3 scripts/fixture-model-server.py --directory "$FIXTURE_DIR" --port 8765 --delay 12 > evidence/fixture-model-server.log 2>&1 &
FIXTURE_SERVER_PID=$!
trap 'kill "$FIXTURE_SERVER_PID" >/dev/null 2>&1 || true; xcrun simctl shutdown "$SIMULATOR_ID" || true' EXIT
set +e
xcodebuild -project RusukhNative.xcodeproj -scheme RusukhNative \
  -configuration Debug -destination "platform=iOS Simulator,id=$SIMULATOR_ID" \
  -derivedDataPath "$RUNNER_TEMP/simulator-build" -resultBundlePath evidence/RusukhUI.xcresult \
  -parallel-testing-enabled NO CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO \
  test 2>&1 | tee evidence/ui-tests.log
TEST_RESULT=${PIPESTATUS[0]}
set -e
xcrun xcresulttool help export attachments > evidence/xcresult-help.txt
xcrun xcresulttool export attachments --path evidence/RusukhUI.xcresult --output-path evidence/ui-attachments
python3 - <<'PY' || true
import json, shutil
from pathlib import Path
manifest_path = Path("evidence/ui-attachments/manifest.json")
destination = Path("evidence/tour")
destination.mkdir(exist_ok=True)
if not manifest_path.exists():
    print("TOUR_SCREENSHOTS none")
    raise SystemExit
manifest = json.loads(manifest_path.read_text())
for test in manifest:
    for attachment in test.get("attachments", []):
        name = attachment.get("suggestedHumanReadableName") or ""
        if "tour-" not in name or not name.endswith(".png"):
            continue
        source = Path("evidence/ui-attachments") / attachment["exportedFileName"]
        label = name.split("_0_")[0]
        if not label.endswith(".png"):
            label += ".png"
        shutil.copyfile(source, destination / Path(label).name)
print("TOUR_SCREENSHOTS", sorted(p.name for p in destination.glob("*.png")))
PY
xcrun xcresulttool get test-results summary --path evidence/RusukhUI.xcresult > evidence/ui-summary.json
xcrun simctl spawn "$SIMULATOR_ID" log show --last 10m --style compact --predicate 'process == "RusukhNative"' > evidence/app-system.log || true
# Keep simulator failures visible in Actions even if artifact downloads are unavailable.
python3 - <<'PYLOG'
import json
from pathlib import Path
summary = json.loads(Path('evidence/ui-summary.json').read_text())
print('UI_TEST_SUMMARY', json.dumps(summary, ensure_ascii=False))
audio_warnings = [warning for warning in summary.get('runtimeWarnings', [])
                  if 'avaudiosession' in str(warning).lower()
                  and 'main thread' in str(warning).lower()]
print('AV_AUDIO_MAIN_THREAD_WARNING_COUNT', len(audio_warnings))
if audio_warnings:
    raise SystemExit('Audio session still blocks the UI thread; inspect xcresult runtime warnings.')
log = Path('evidence/app-system.log')
if log.exists():
    lines = [line for line in log.read_text(errors='replace').splitlines()
             if any(term in line.lower() for term in ['mlx', 'metal', 'fatal', 'abort', 'exception'])]
    print('APP_DIAGNOSTIC_EXCERPT\n' + '\n'.join(lines[-80:]))
PYLOG
# XCTest can reinstall the app and change its data-container UUID. Resolve the
# current container after the final download test, while Simulator is booted.
if [[ "$TEST_RESULT" == 0 ]]; then
  APP_DATA=$(xcrun simctl get_app_container "$SIMULATOR_ID" com.scrv1.rusukhnative data)
  FIXTURE_DIRECTORY="$APP_DATA/Library/Application Support/RusukhTestModels/Qwen3-Fixture"
  test -s "$FIXTURE_DIRECTORY/fixture-a.txt"
  test -s "$FIXTURE_DIRECTORY/fixture-b.txt"
  test -s "$FIXTURE_DIRECTORY/verified.txt"
  echo 'POST_UI_FIXTURE_VERIFIED'
  # Qwen files stay on the host path written before UI tests; confirm they still exist
  # for the offline Mac probe after Simulator reinstalls.
  MODEL_DIRECTORY=$(cat evidence/ai-simulator-model-directory.txt)
  test -s "$MODEL_DIRECTORY/config.json"
  test -s "$MODEL_DIRECTORY/model.safetensors"
  echo 'POST_UI_MODEL_DIRECTORY_VERIFIED'
fi
exit "$TEST_RESULT"
