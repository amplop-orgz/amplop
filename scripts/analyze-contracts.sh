#!/usr/bin/env bash
# Slither and Aderyn, then the findings gate (S02-16). Tool versions come from tools/versions.env.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p contracts/build
rm -f contracts/build/slither.json contracts/build/aderyn.json  # slither refuses to overwrite
(cd contracts && slither . --config-file slither.config.json --json build/slither.json >/dev/null 2>&1 || true)
[ -s contracts/build/slither.json ] || { echo "slither produced no output" >&2; exit 1; }
aderyn contracts --output contracts/build/aderyn.json >/dev/null
node scripts/check-analysis.mjs
