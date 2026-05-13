#!/usr/bin/env bash
# EAS / local pre-build report: npm ci, expo doctor, quick route audit.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
REPORT="${REPORT:-$ROOT/release-build-report.txt}"
: >"$REPORT"

log() { echo "$1" | tee -a "$REPORT"; }

log "=== Release build report $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
log "Node: $(node -v 2>/dev/null || echo missing)"
log "npm: $(npm -v 2>/dev/null || echo missing)"
log ""

log "== git status (summary) =="
git status -sb >>"$REPORT" 2>&1 || true
log ""

log "== npm ci =="
if npm ci >>"$REPORT" 2>&1; then
  log "[OK] npm ci"
else
  log "[FAIL] npm ci — see $REPORT"
  exit 1
fi
log ""

log "== expo doctor =="
set +e
npx --yes expo-doctor >>"$REPORT" 2>&1
doc=$?
set -e
if [[ $doc -eq 0 ]]; then
  log "[OK] expo doctor (expo-doctor exit 0)"
else
  log "[WARN] expo doctor exit $doc — review $REPORT (try: npx expo install --check)"
fi
log ""

log "== _layout.tsx under app/ =="
find app -name '_layout.tsx' 2>/dev/null | sort | tee -a "$REPORT"
log ""

log "== duplicate basenames under app/ (informational) =="
find app \( -name '*.tsx' -o -name '*.ts' \) 2>/dev/null | sed 's|.*/||' | sort | uniq -d | tee -a "$REPORT" || true
log ""

log "Full report: $REPORT"
echo "Wrote: $REPORT"
