#!/usr/bin/env bash
set -euo pipefail
SIMULATOR_ID=$(cat evidence/simulator-id.txt)
if ! xcrun simctl list devices booted -j | python3 -c 'import json,sys; target=sys.argv[1]; devices=json.load(sys.stdin)["devices"]; sys.exit(0 if any(d["udid"] == target and d["state"] == "Booted" for group in devices.values() for d in group) else 1)' "$SIMULATOR_ID"; then
  xcrun simctl boot "$SIMULATOR_ID"
fi
xcrun simctl bootstatus "$SIMULATOR_ID" -b
trap 'xcrun simctl shutdown "$SIMULATOR_ID" || true' EXIT
xcrun simctl privacy "$SIMULATOR_ID" grant microphone com.scrv1.rusukhnative
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
  MODEL_DIRECTORY="$APP_DATA/Library/Application Support/RusukhTestModels/Qwen3-Instruct-2507"
  test -s "$MODEL_DIRECTORY/config.json"
  test -s "$MODEL_DIRECTORY/model.safetensors"
  printf '%s\n' "$MODEL_DIRECTORY" > evidence/ai-simulator-model-directory.txt
  echo 'POST_UI_MODEL_DIRECTORY_VERIFIED'
fi
exit "$TEST_RESULT"
