#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v swift >/dev/null
command -v xtool >/dev/null
export RUSUKH_XTOOL=1
# Build only: does not authenticate, sign, or install on a device.
exec xtool dev build --configuration release --ipa
