#!/usr/bin/env bash
set -euo pipefail
SIMULATOR_ID=$(cat evidence/simulator-id.txt)
xcrun simctl boot "$SIMULATOR_ID"
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
exit "$TEST_RESULT"
