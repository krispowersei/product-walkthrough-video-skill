#!/usr/bin/env bash
# Idempotent box setup for this skill. Installs Playwright (chromium) and edge-tts in a venv.
set -e
D=$(cd "$(dirname "$0")/.." && pwd)
cd "$D"; [ -f package.json ] || npm init -y >/dev/null
[ -d node_modules/playwright ] || npm i -s playwright
npx playwright install chromium
V=/workspace/demo-studio/tools/.venv
[ -x $V/bin/edge-tts ] || { python3 -m venv $V; $V/bin/pip install -q edge-tts; }
echo "ready: playwright=$(npx playwright --version) edge-tts=$V/bin/edge-tts"
