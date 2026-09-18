# Yin-Panel Automated Acceptance Test

The Playwright suite verifies the main user and API flows against the running service:

- Chromium loads the unpacked `yin-panel-extension` and receives a non-empty icon payload.
- Login failure and success states.
- UI Item creation plus Item field persistence and deletion.
- Multipart Item creation with SHA256-named image files.
- Space groups, members, public access, and viewer permissions.
- Bookmark export/import and multipart file validation.
- Batch bookmark import with duplicate-file protection.

Install and run:

```bash
cd "$YIN_PANEL_E2E_DIR"
npm install
npx playwright install chromium
pnpm provision-member
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' \
DISPLAY=:0 \
npm test
```

The extension test intentionally runs headed Chromium because Chromium does not load unpacked extensions in headless mode. On CI, run the same command under `xvfb-run -a`. Set `YIN_PANEL_ENV_FILE` to the local environment file. It must define `YIN_PANEL_URL`, `YIN_PANEL_EXTENSION_DIR`, and either `YIN_PANEL_TEST_TOKEN` or both `YIN_PANEL_TEST_USER` and `YIN_PANEL_TEST_PASSWORD`. `YIN_PANEL_TEST_SPACE_ID` defaults to `1`.

`pnpm provision-member` uses the configured admin test account to create or reuse a regular test member and writes its credentials to `.env.local`. Tests use the configured test space and remove their own Items and groups; they do not clear or delete the existing space.

Failure artifacts are written to `test-results/` and `playwright-report/`.
