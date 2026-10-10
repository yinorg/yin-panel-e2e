# k6 Performance Tests

Cross-repository k6 tests for a running Yin-Panel service. They complement the
Playwright acceptance suite: Playwright verifies functional correctness, these
scripts measure throughput, latency and error budgets under load.

## Prerequisites

- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) v2.0+ on `PATH`.
- Node (for the sweep driver) — the repo's configured Node is fine.
- Target service reachable at `YIN_PANEL_URL` (default `http://127.0.0.1:3002`).
- Test credentials in `YIN_PANEL_ENV_FILE` (default `../yin-panel-e2e/.env.local`):
  `YIN_PANEL_TEST_ADMIN_USER` / `YIN_PANEL_TEST_ADMIN_PASSWORD` (and optionally
  the member account).

## Quick tests (no auth)

```bash
k6 run perf/smoke.js     # 10s, 3 VUs, public entry points
k6 run perf/load.js      # 2m ramp 10->30->0 VUs
npm run perf:smoke
npm run perf:load
```

## Capacity sweep — per-endpoint ceiling

`perf/sweep.mjs` walks the whole endpoint catalogue (`perf/lib/catalog.mjs`) and
for each route runs `perf/probe.js` at a doubling constant arrival rate until the
error or latency budget breaks. The highest passing rate is that endpoint's
ceiling.

```bash
export YIN_PANEL_ENV_FILE=../yin-panel-e2e/.env.local
set -a; . "$YIN_PANEL_ENV_FILE"; set +a

# read-safe classes (public / read / admin) against the test space
node perf/sweep.mjs --class public,read,admin --start 20 --max 8000 --duration 10s

# write / upload classes: the driver creates a throwaway space and removes it
node perf/sweep.mjs --class write,upload --start 10 --max 1000 --duration 8s

# summarise a run
node perf/summarize.mjs perf/results/run-<ts>
```

Endpoints that cannot be built safely (destructive clears, account creation,
multipart uploads, S3/OAuth/external favourites) are recorded as `skipped` with
a reason instead of being guessed.

## Mixed-workload matrix — resources under load

`perf/capacity.js` ramps a weighted mix of endpoints while `perf/monitor.sh`
samples the service process and host.

```bash
PERF/run-matrix.sh                       # defaults: 20 -> 3000 req/s over 4m
START_RATE=20 PEAK_RATE=5000 RAMP=6m perf/run-matrix.sh
```

Outputs, under `perf/results/matrix-<ts>/`:

- `report.html` — k6 Web Dashboard export (interactive charts).
- `resources.csv` — `ts_ms,sut_pid,sut_cpu_pct,sut_rss_mb,load1,disk_mbs,sys_user_pct,sys_sys_pct`.
- `k6.log` — full k6 output.

## Reading the results

- **p95 / p99** are the numbers that matter, not the average.
- A latency curve that stays flat as the rate rises means you have not reached a
  bottleneck yet; a curve that bends upward is the knee.
- A breached threshold makes k6 exit non-zero, so these scripts can gate CI.

## Measurement caveats (important)

- **Same-host**: the load generator runs on the same machine as the service, so
  it competes for CPU and disk. `sut_cpu_pct` and `sut_rss_mb` are process-scoped
  and isolate the service; `disk_mbs` and system CPU are host-wide and include
  k6's own footprint. Loopback also bypasses the real network path.
- **SQLite**: writes are serialised behind WAL fsync, so write ceilings are
  bounded by disk, not CPU. Treat write numbers separately from read numbers.
- A red threshold line is a failing test, not a warning.

Generated output under `perf/results/` is not committed.
