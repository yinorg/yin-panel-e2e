import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

const envFile = process.env.YIN_PANEL_ENV_FILE || path.resolve('.env.local')
try { process.loadEnvFile(envFile) } catch (error) {
  if (error.code !== 'ENOENT') throw error
}
for (const name of ['NO_PROXY', 'no_proxy']) {
  process.env[name] = [...new Set(`${process.env[name] || ''},localhost,127.0.0.1,::1`.split(',').filter(Boolean))].join(',')
}

export default defineConfig({
  testDir: './tests',
  forbidOnly: true,
  testMatch: ['directory-layout.spec.mjs', 'theme-architecture.spec.mjs', 'theme-package-v2.spec.mjs', 'builtin-theme-home.spec.mjs', 'theme-author-preview.spec.mjs', 'item-editor.spec.mjs', 'default-theme-interaction.spec.mjs'],
  timeout: 120000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/theme', open: 'never' }], ['./tests/strict-gate-reporter.mjs']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  outputDir: 'test-results/theme',
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox-desktop', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-desktop', use: { ...devices['Desktop Safari'] } },
    { name: 'pixel-7-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'iphone-15-webkit', use: { ...devices['iPhone 15'] } },
  ],
})
