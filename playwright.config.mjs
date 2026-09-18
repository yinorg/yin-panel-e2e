import { defineConfig } from '@playwright/test'
import path from 'node:path'

const envFile = process.env.YIN_PANEL_ENV_FILE || path.resolve('.env.local')
try { process.loadEnvFile(envFile) } catch (error) {
  if (error.code !== 'ENOENT') throw error
}

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  fullyParallel: false,
  retries: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.YIN_PANEL_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  outputDir: 'test-results',
})
