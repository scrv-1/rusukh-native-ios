#!/bin/bash
set -euo pipefail
mkdir -p evidence
xcrun simctl list devices available -j > evidence/simulators.json
SIMULATOR_ID=$(python3 - <<'PY'
import json
with open('evidence/simulators.json') as f:
    devices=json.load(f)['devices']
for runtime in sorted(devices, reverse=True):
    if '.iOS-' not in runtime:
        continue
    for device in sorted(devices[runtime], key=lambda d: ('Duo' in d['name'], d['name'])):
        if device.get('isAvailable') and device['name'].startswith('iPhone'):
            print(device['udid'])
            raise SystemExit(0)
raise SystemExit('No available iPhone simulator')
PY
)
printf "%s\n" "$SIMULATOR_ID" > evidence/simulator-id.txt
APP_PATH="$RUNNER_TEMP/simulator-build/Build/Products/Debug-iphonesimulator/RusukhNative.app"
xcrun simctl boot "$SIMULATOR_ID"
xcrun simctl bootstatus "$SIMULATOR_ID" -b
xcrun simctl status_bar "$SIMULATOR_ID" override --time '9:41' --batteryState charged --batteryLevel 100
xcrun simctl install "$SIMULATOR_ID" "$APP_PATH"
xcrun simctl launch "$SIMULATOR_ID" com.scrv1.rusukhnative | tee evidence/simulator-launch.txt
sleep 5
xcrun simctl io "$SIMULATOR_ID" screenshot --display=1 evidence/simulator-home.png
xcrun simctl terminate "$SIMULATOR_ID" com.scrv1.rusukhnative
xcrun simctl shutdown "$SIMULATOR_ID"
