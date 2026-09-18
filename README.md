# Yin-Panel Automated Acceptance Test

This test verifies the complete icon path against the running service:

- Chromium loads the unpacked `yin-panel-extension` and receives a non-empty icon payload.
- One multipart batch request imports two bookmarks using the same icon.
- The backend stores one SHA256-named file and returns image icons for both bookmarks.

Install and run:

```bash
cd "$YIN_PANEL_E2E_DIR"
npm install
npx playwright install chromium
YIN_PANEL_ENV_FILE='/path/to/Yin-Panel/.env.local' \
DISPLAY=:0 \
npm test
```

The extension test intentionally runs headed Chromium because Chromium does not load unpacked extensions in headless mode. On CI, run the same command under `xvfb-run -a`. Set `YIN_PANEL_ENV_FILE` to the local environment file. It must define `YIN_PANEL_URL`, `YIN_PANEL_EXTENSION_DIR`, and either `YIN_PANEL_TEST_TOKEN` or both `YIN_PANEL_TEST_USER` and `YIN_PANEL_TEST_PASSWORD`. `YIN_PANEL_TEST_SPACE_ID` defaults to `1`.

The batch test creates a uniquely named group and removes its bookmarks, group, and uploaded file during cleanup. Test credentials are read only from environment variables and are never stored in this project.

Failure artifacts are written to `test-results/` and `playwright-report/`.
