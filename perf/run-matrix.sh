#!/usr/bin/env bash
# Run the mixed-workload capacity test with the SUT resource monitor attached.
#
# Usage: run-matrix.sh [outdir]
# Env:   START_RATE PEAK_RATE RAMP BUDGET  (defaults 20 / 3000 / 4m / 800)
set -u

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
env_file="${YIN_PANEL_ENV_FILE:-$root/.env.local}"
if [ ! -f "$env_file" ]; then echo "missing env file: $env_file" >&2; exit 1; fi
set -a; . "$env_file"; set +a

export PATH="${HOME}/.nvm/versions/node/v24.21.0/bin:/opt/homebrew/bin:${PATH:-}"
K6_BIN="${K6_BIN:-k6}"

out="${1:-$here/results/matrix-$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$out"
csv="$out/resources.csv"

bash "$here/monitor.sh" "$csv" 1 3002 &
mon=$!
trap 'kill "$mon" 2>/dev/null || true' EXIT INT TERM

K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT="$out/report.html" \
  "$K6_BIN" run \
  -e BASE_URL="${YIN_PANEL_URL:-http://127.0.0.1:3002}" \
  -e ADMIN_USER="${YIN_PANEL_TEST_ADMIN_USER}" \
  -e ADMIN_PASS="${YIN_PANEL_TEST_ADMIN_PASSWORD}" \
  -e SPACE_ID="${YIN_PANEL_TEST_SPACE_ID:-1}" \
  -e START_RATE="${START_RATE:-20}" \
  -e PEAK_RATE="${PEAK_RATE:-3000}" \
  -e RAMP="${RAMP:-4m}" \
  -e BUDGET="${BUDGET:-800}" \
  "$here/capacity.js" > "$out/k6.log" 2>&1
code=$?

kill "$mon" 2>/dev/null || true
trap - EXIT INT TERM

echo "k6 exit=$code"
echo "resources: $csv"
echo "report:    $out/report.html"
echo "log:       $out/k6.log"
