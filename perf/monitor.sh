#!/usr/bin/env bash
# Sample the service under test and the host while k6 runs.
#
# Columns: ts_ms,sut_pid,sut_cpu_pct,sut_rss_mb,load1,disk_mbs,sys_user_pct,sys_sys_pct
# The SUT CPU/RSS are process-scoped (isolated from k6); disk and system CPU are
# host-wide and therefore include the load generator's own footprint.
#
# Usage: monitor.sh <out.csv> [interval_seconds] [port]
set -u

out="${1:?usage: monitor.sh <out.csv> [interval_s] [port]}"
interval="${2:-1}"
port="${3:-3002}"

echo "ts_ms,sut_pid,sut_cpu_pct,sut_rss_mb,k6_cpu_pct,load1,disk_mbs,sys_user_pct,sys_sys_pct" > "$out"

trap 'exit 0' TERM INT

while :; do
  ts=$(python3 -c 'import time;print(int(time.time()*1000))')

  pid=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -1)
  if [ -n "${pid:-}" ]; then
    stats=$(ps -p "$pid" -o %cpu=,rss= 2>/dev/null | tr -s ' ' | sed 's/^ //')
    cpu=$(echo "$stats" | awk '{print $1+0}')
    rss_kb=$(echo "$stats" | awk '{print $2+0}')
  else
    cpu=0
    rss_kb=0
  fi
  rss_mb=$(python3 -c "print(round(${rss_kb}/1024,1))")

  k6_cpu=$(ps -A -o %cpu=,comm= 2>/dev/null | grep -w '/k6$\| k6$' | awk '{s+=$1} END{print s+0}')
  [ -z "${k6_cpu:-}" ] && k6_cpu=0

  load=$(sysctl -n vm.loadavg 2>/dev/null | tr -d '{}' | awk '{print $1+0}')

  # CPU usage line: "CPU usage: 5.0% user, 10.0% sys, 85.0% idle"
  cpu_line=$(top -l 1 -n 0 2>/dev/null | grep -m1 'CPU usage')
  sys_user=$(echo "$cpu_line" | awk -F'[ %]+' '{print $3+0}')
  sys_sys=$(echo "$cpu_line" | awk -F'[ %]+' '{print $5+0}')

  # macOS iostat -d reports per-disk KB/t, tps, MB/s (combined read+write).
  io=$(iostat -d -w "$interval" -c 2 2>/dev/null)
  if [ -z "$io" ]; then
    sleep "$interval"
    disk=0
  else
    disk=$(printf '%s\n' "$io" | tail -1 | awk '{s+=$NF} END{print s+0}')
  fi

  echo "$ts,${pid:-0},$cpu,$rss_mb,$k6_cpu,$load,$disk,$sys_user,$sys_sys" >> "$out"
done
