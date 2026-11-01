#!/usr/bin/env bash
set -euo pipefail

echo '==> Node and npm'
node --version
npm --version

echo '==> Installing project dependencies'
npm install

echo '==> Checking compatibility with Expo SDK'
npx expo install --check

echo '==> Sign in to the same Expo account used by Expo Go'
npx expo login

echo '==> Installing tunnel helper'
if ! npm install --global @expo/ngrok; then
  echo 'Global install was not available; installing tunnel helper locally.'
  npm install --save-dev @expo/ngrok
fi

echo '==> Starting Expo Go link via tunnel'
npx expo start --tunnel
