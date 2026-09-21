# Yin-Panel E2E Agent Guide

This repository contains Playwright acceptance tests for a running Yin-Panel service and the unpacked browser extension.

## Workflow

- Inspect `git status --short` before changes and preserve unrelated worktree changes.
- Keep changes scoped to E2E tests. Core and extension source changes belong in their separate repositories.
- Check `package.json` and `playwright.config.mjs` before changing test commands or fixtures.
- Run focused Playwright tests for changed scenarios, then run the broader suite when the shared helpers or configuration change.
- Run `git diff --check` and report every skipped or failed check.

## Test Placement and Ownership

- Store all Playwright tests in `tests/` and name them `*.spec.mjs`; group files by user workflow or subsystem, such as `extension-newtab.spec.mjs`.
- Use this repository for cross-repository acceptance coverage and real-browser behavior, including loading the unpacked extension and exercising Core plus extension workflows.
- Keep tests that exercise only extension-local logic in the extension repository under its `tests/` directory; do not duplicate them here.
- Load the extension from `YIN_PANEL_EXTENSION_DIR` and test the checked-out or packaged source explicitly. Do not copy extension or Core source into this repository and do not modify those repositories from tests.
- Keep test fixtures, helpers, and browser setup in this repository; keep test results and generated reports ignored and untracked.

## Environment and Commands

- Use `npm test` for the default suite and `npm run test:headed` for headed local debugging.
- Use `npm run provision-member` only with an explicitly configured test environment and administrator test account.
- Tests require `YIN_PANEL_URL`, `YIN_PANEL_EXTENSION_DIR`, and either `YIN_PANEL_TEST_TOKEN` or `YIN_PANEL_TEST_USER` plus `YIN_PANEL_TEST_PASSWORD`.
- Extension tests use headed Chromium; use a configured `DISPLAY` locally or `xvfb-run -a` in CI.

## Data and Artifact Safety

- `.env.local` may contain test credentials and proxy addresses. Keep it untracked, never print it, and never commit it.
- `test-results/` and `playwright-report/` are generated artifacts. Do not commit them unless explicitly requested.
- Tests must clean up Items and groups they create. Do not delete existing spaces, databases, uploads, or other users' data.
- Report failing tests and their traces, screenshots, and videos accurately; generated failure artifacts do not indicate a passing run.
