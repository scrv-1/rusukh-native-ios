#!/usr/bin/env bash
set -euo pipefail

# Core study features do not use this script, ngrok, or a running Metro server.
# Notes, review, search, and local backup run from the installed bundle.
# A tunnel is an optional development convenience only.

if [[ "${1:-}" != "--tunnel" ]]; then
  echo 'رُسوخ does not need ngrok or a development server for notes, review, search, or backup.'
  echo 'Standalone updates are documented in docs/EAS_UPDATE_2026-11.md.'
  echo 'Pass --tunnel only when you intentionally want a temporary Expo Go session.'
  exit 0
fi

echo '==> Optional development tunnel. This is not required for core features.'
node --version
npm --version
npm install
npx expo install --check || true
if ! npm install --global @expo/ngrok; then
  echo 'Global install was not available; installing the tunnel helper locally.'
  npm install --save-dev @expo/ngrok
fi
npx expo start --tunnel
