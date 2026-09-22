import { defineConfig } from '@playwright/test'
import path from 'node:path'

const envFile = process.env.YIN_PANEL_ENV_FILE || path.resolve('.env.local')
try { process.loadEnvFile(envFile) } catch (error) {
  if (error.code !== 'ENOENT') throw error
}

const baseURL = process.env.YIN_PANEL_URL
if (!baseURL || new URL(baseURL).protocol !== 'https:') {
  throw new Error('PWA tests require YIN_PANEL_URL to be an HTTPS origin')
}

export default defineConfig({
  testDir: './tests/pwa',
  timeout: 120000,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure' },
  outputDir: 'test-results',
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
})
