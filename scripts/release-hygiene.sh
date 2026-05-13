#!/usr/bin/env bash
# Pre-release checks: secrets, nested repo, git cleanliness.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'; NC='\033[0m'
fail=0

echo "== Release hygiene (repo: $ROOT) =="

if [[ -d "cliniflow-app/.git" ]]; then
  echo -e "${RED}[BLOCKER]${NC} Nested repo at ./cliniflow-app/ (.git present). Remove the folder or delete cliniflow-app/.git after backup; CI must not nest clones."
  fail=1
else
  echo -e "${GRN}[OK]${NC} No nested .git under ./cliniflow-app/"
fi

if git ls-files --error-unmatch cliniflow-app >/dev/null 2>&1; then
  echo -e "${RED}[BLOCKER]${NC} Path 'cliniflow-app' is still tracked (submodule/gitlink). Run: git rm --cached cliniflow-app"
  fail=1
else
  echo -e "${GRN}[OK]${NC} No gitlink at cliniflow-app"
fi

if [[ -f .gitmodules ]]; then
  echo -e "${YLW}[INFO]${NC} .gitmodules present — verify submodule URLs and CI checkout."
else
  echo -e "${GRN}[OK]${NC} No .gitmodules (expected for single-app repo)."
fi

echo "-- Tracked files matching secret / signing patterns (must be empty) --"
BAD=$(git ls-files | grep -v '^node_modules/' | grep -iE '^\.env$|\.jks$|\.p12$|upload-keystore|upload_certificate\.pem|\.upload-keystore\.pass|clinifly-release-key\.keystore|GoogleService-Info\.plist$|google-services\.json$|\.credentials\.json$' || true)
if [[ -n "${BAD}" ]]; then
  echo -e "${RED}[BLOCKER]${NC} Tracked secret-like files:"
  echo "$BAD"
  fail=1
else
  echo -e "${GRN}[OK]${NC} No tracked matches for configured secret patterns."
fi

echo "-- Large tracked files (>2MB) — sample via find (first 50 matches) --"
# Avoid per-file stat over entire index (slow on large trees).
find . -path ./node_modules -prune -o -path ./.git -prune -o -path './cliniflow-clean' -prune -o \
  -type f -size +2097152c -print 2>/dev/null | head -50 || true

echo "-- Untracked porcelain lines mentioning secrets (informational) --"
git status --porcelain | grep -iE '\.(jks|p12|pem|keystore)|(^|\s)\.env\s|GoogleService|google-services' || echo "(none)"

if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
  echo -e "${YLW}[WARN]${NC} Uncommitted changes present — review before tag/release."
  git status -sb
fi

if [[ $fail -ne 0 ]]; then
  echo -e "\n${RED}FAILED — fix blockers before release.${NC}"
  exit 1
fi
echo -e "\n${GRN}Hygiene checks passed.${NC}"
