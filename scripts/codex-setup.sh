#!/usr/bin/env bash
set -euo pipefail

mode="${1:-install}"
if [[ "$mode" != install && "$mode" != --check ]]; then
  echo 'Usage: bash scripts/codex-setup.sh [--check]' >&2
  exit 2
fi
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/.." && pwd)"
project="$repo_root/expo-preview"
if [[ ! -f "$project/package-lock.json" || ! -f "$project/ai-lab/package-lock.json" ]]; then
  echo 'This checkout lacks the Expo lockfiles. Select the intended Expo branch; do not scaffold a replacement.' >&2
  exit 1
fi
node --version
npm --version
cd -- "$project"
if [[ "$mode" == install ]]; then
  npm ci
  (cd ai-lab && npm ci)
fi
npm run typecheck
npm test
npm run test:ui
node --test ai-lab/test.mjs ai-lab/engine-runtime.test.mjs
node scripts/verify-ai-build.cjs
echo 'Expo code checks passed. This does not start Metro, publish, or verify an iPhone.'
