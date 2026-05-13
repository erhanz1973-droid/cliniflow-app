#!/usr/bin/env bash
# After native dep changes, before `expo run:ios` / EAS iOS build.
# If you see "[@RNC/AsyncStorage]: NativeModule ... is null":
#   • Rebuild the dev client (EAS) — JS-only OTA cannot add native modules.
#   • Delete the old app from the device before installing the new binary (Expo Go vs dev client mismatch causes null natives).
#   • Optional deep clean: rm -rf node_modules && npm install (keep package-lock.json unless you know why to drop it).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
exec npx pod-install "$@"
