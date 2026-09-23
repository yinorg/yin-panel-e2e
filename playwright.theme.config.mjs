import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

const envFile = process.env.YIN_PANEL_ENV_FILE || path.resolve('.env.local')
try { process.loadEnvFile(envFile) } catch (error) {
  if (error.code !== 'ENOENT') throw error
}

export default defineConfig({
  testDir: './tests',
  testMatch: 'theme-package.spec.mjs',
  timeout: 120000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/theme', open: 'never' }]],
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
