# Yin-Panel end-to-end acceptance tests

**English** | [简体中文](docs/zh-CN/README.md) | [繁體中文](docs/zh-TW/README.md) | [日本語](docs/ja-JP/README.md) | [한국어](docs/ko-KR/README.md) | [Deutsch](docs/de-DE/README.md) | [Français](docs/fr-FR/README.md) | [Español](docs/es-ES/README.md) | [Português (Brasil)](docs/pt-BR/README.md) | [Русский](docs/ru-RU/README.md)

Playwright acceptance tests for a running Yin-Panel service and the unpacked browser extension. The suite drives real browsers against the Core application — and the extension's new-tab override — so cross-repository workflows are verified end to end: login and accounts, spaces and permissions, items and bookmark transfer, the theme system, and PWA behaviour. A separate k6 suite measures the same service under load.

## Requirements

- Node.js with npm
- Playwright browsers (`npx playwright install`)
- A running Yin-Panel instance to test against, plus its environment file from the Core repository
- The unpacked extension source, for the extension suite
- k6 for the performance scripts under `perf/`

## Installation

```bash
cd "$YIN_PANEL_E2E_DIR"
npm ci
npx playwright install
```

## Configuration

Every config loads the environment file named by `YIN_PANEL_ENV_FILE`, which defaults to `./.env.local`.

- `YIN_PANEL_URL` — base URL of the running service (the PWA suite requires an HTTPS origin)
- `YIN_PANEL_EXTENSION_DIR` — unpacked extension source loaded by the new-tab test
- `YIN_PANEL_TEST_USER` and `YIN_PANEL_TEST_PASSWORD`, or `YIN_PANEL_TEST_TOKEN` — test account
- `YIN_PANEL_TEST_SPACE_ID` — space under test, default `1`
- `DISPLAY` — required by the headed extension tests; use `xvfb-run -a` in CI
- `YIN_PANEL_TEST_ADMIN_USER` and `YIN_PANEL_TEST_ADMIN_PASSWORD` — administrator account used by `npm run provision-member` and the theme suites
- The isolated theme and visual suites start a throwaway instance from `YIN_PANEL_TEST_BINARY`, `YIN_PANEL_TEST_WEB_DIR`, and `YIN_PANEL_TEST_LANG_DIR`

Keep `.env.local` untracked; it holds test credentials.

## Quick start

```bash
# with the Core service running on http://127.0.0.1:3002 and the extension checked out
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' DISPLAY=:0 npm test
```

## What it covers

- Login, session expiry, and account lifecycle
- Spaces: groups, members, public access codes, paired spaces, viewer permissions, and migration
- Items: creation, editing, icons, and bookmark import/export
- Theme system: built-in home views, package v2 install and preview, Core surfaces, and visual baselines
- PWA offline behaviour and the extension's new-tab override
- Load, latency, and capacity measurements under `perf/`

## Commands

| Command | Purpose |
| --- | --- |
| `npm test` | Default Playwright suite |
| `npm run test:headed` | Headed run for local debugging |
| `npm run test:theme` | Theme architecture and package suites |
| `npm run test:theme:visual` | Theme visual baselines |
| `npm run test:pwa` | PWA suite, against an HTTPS origin |
| `npm run perf:smoke` / `npm run perf:load` | k6 smoke and load tests |
| `npm run perf:sweep` / `npm run perf:matrix` / `npm run perf:summary` | Capacity sweep, mixed-workload matrix, and report |
| `npm run provision-member` | Create or reuse the regular test member |

## Documentation

- [AGENTS.md](./AGENTS.md) — test placement, ownership, and data-safety rules
- [perf/README.md](./perf/README.md) — k6 scripts, capacity sweep, and measurement caveats
- [tests/theme-package-requirements.md](./tests/theme-package-requirements.md) — theme package requirement-to-test map
- Core: [yinorg/Yin-Panel](https://github.com/yinorg/Yin-Panel); extension: [yinorg/yin-panel-extension](https://github.com/yinorg/yin-panel-extension)
- `scripts/readme-screenshots.mjs` regenerates the Core README screenshots from an isolated instance

Failure artifacts are written to `test-results/` and `playwright-report/`, both of which stay untracked.
