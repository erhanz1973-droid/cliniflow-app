#!/usr/bin/env bash
# Run after changing native deps or before `eas build` / `expo run:ios` if AsyncStorage (or other pods) is null at runtime.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
exec npx pod-install "$@"
