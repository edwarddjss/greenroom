#!/usr/bin/env bash
# Windows launch bridge.
#
# The app is Windows-only (VB-Cable + DirectShow + Spotify desktop). This repo
# lives in the WSL filesystem with Linux-built node_modules, which cannot run on
# Windows. So we sync the *source* to a Windows-native working copy, install
# Windows deps there, and launch the real Windows Electron app via WSL interop.
#
# Usage (from WSL):  pnpm win:dev
# Override target:   GREENROOM_WIN_DIR='C:\path' pnpm win:dev
set -euo pipefail

SRC="/home/nazk/Projects/spotify-dj-bot"
WIN_DIR_WIN="${GREENROOM_WIN_DIR:-C:\\Users\\edwar\\Greenroom}"
# Convert the Windows path to its /mnt/c form for rsync.
WIN_DIR_WSL="$(printf '%s' "$WIN_DIR_WIN" | sed -E 's|^([A-Za-z]):\\|/mnt/\L\1/|; s|\\|/|g')"

echo "[win-dev] Syncing source -> $WIN_DIR_WIN ($WIN_DIR_WSL)"
mkdir -p "$WIN_DIR_WSL"
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'out' \
  --exclude 'models' \
  --exclude '*.gguf' \
  --exclude 'capture-test.wav' \
  "$SRC/" "$WIN_DIR_WSL/"

echo "[win-dev] Installing Windows deps + building, then launching Electron on Windows..."
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "
  \$ErrorActionPreference = 'Stop'
  Set-Location '$WIN_DIR_WIN'
  pnpm install
  pnpm --filter '@greenroom/shared' build
  pnpm --filter '@greenroom/engine' build
  pnpm --filter '@greenroom/desktop' dev
"
