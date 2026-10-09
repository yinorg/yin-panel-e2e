# k6 Performance Tests

Cross-repository k6 smoke and load tests for a running Yin-Panel service. These
complement the Playwright acceptance suite in `tests/`: Playwright verifies
functional correctness, these scripts verify that the public entry points stay
within latency and error budgets under traffic.

## Prerequisites

- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) v2.0 or later on
  your `PATH` (`brew install k6` on macOS).

## Targets

The scripts exercise the unauthenticated entry points, so no login is required:

- `/` — SPA entry document (static).
- `/login` — SPA login route (static fallback).
- `/api/theme/v2/packages` — public theme catalogue (real backend work).
- `/api/spaces/<spaceId>/public` — public space config.

## Configuration

Both scripts read their target from the environment:

| Variable    | Default                  | Meaning                     |
| ----------- | ------------------------ | --------------------------- |
| `BASE_URL`  | `http://127.0.0.1:3002`  | Service under test          |
| `SPACE_ID`  | `1`                      | Space id for the public API |

## Run

```bash
# Quick smoke: 10s, 3 VUs, p(95) < 500ms, <1% errors.
k6 run perf/smoke.js

# Ramp load: 10 -> 30 -> 0 VUs over 2 minutes.
k6 run perf/load.js

# Override the target.
BASE_URL=http://127.0.0.1:3002 SPACE_ID=1 k6 run perf/smoke.js
```

Or through the npm wrappers:

```bash
npm run perf:smoke
npm run perf:load
```

## Budgets

A breached threshold makes k6 exit non-zero, so these scripts can gate CI:

- `checks` rate > 99% (every request answered 200).
- `http_req_failed` rate < 1%.
- `http_req_duration` p(95) < 500ms and p(99) < 1500ms.

Treat a red threshold line as a failing test, not a warning. Adjust the budgets
only after recording a baseline on the target environment.

## Relation to Core

The Core repository wires the official Grafana k6 MCP server
(`k6 x mcp`) and its bundled skills, so an agent can author and validate k6
scripts directly. This repository owns the scripts and their run history; do not
duplicate them into Core.
