#!/usr/bin/env bash
# Run from a browser-hosted GitHub Codespace; no local computer is needed.
set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

if [[ ! -f package-lock.json || ! -f package.json ]]; then
  echo 'Missing Expo package.json/package-lock.json in expo-preview.' >&2
  exit 1
fi

echo '==> Node and npm in the Codespace'
node --version
npm --version

if [[ ! -x node_modules/.bin/expo ]]; then
  echo '==> Installing exactly the locked project dependencies'
  npm ci --no-audit --no-fund
else
  echo '==> Reusing installed Expo dependencies'
fi

echo '==> Checking compatibility with the current Expo SDK'
npx --no-install expo install --check

# Expo Go on a physical iPhone and Expo CLI must use the same Expo account.
# This prompt runs inside the Codespaces terminal; never paste passwords in chat.
if ! npx --no-install expo whoami >/dev/null 2>&1; then
  echo '==> Sign in to Expo in this Codespaces terminal'
  npx --no-install expo login
fi

# Never change package.json/package-lock.json merely to install a tunnel helper.
# A local, unsaved helper is sufficient for the current Codespaces session.
if ! node -e "require.resolve('@expo/ngrok')" >/dev/null 2>&1; then
  echo '==> Installing the optional Expo tunnel helper without saving dependencies'
  npm install --no-save --package-lock=false --no-audit --no-fund @expo/ngrok
fi

echo '==> Starting Expo tunnel (keep the Codespace open while testing)'
exec npx --no-install expo start --tunnel
