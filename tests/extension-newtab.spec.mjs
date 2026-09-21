import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'

const extensionPath = process.env.YIN_PANEL_EXTENSION_DIR

async function launchExtension(playwright) {
  expect(extensionPath, 'Set YIN_PANEL_EXTENSION_DIR').toBeTruthy()
  const userDataDir = await fs.mkdtemp(`${os.tmpdir()}/yin-panel-newtab-e2e-`)
  const context = await playwright.chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-proxy-server',
    ],
  })
  const workerDeadline = Date.now() + 10000
  let extensionWorker
  while (!extensionWorker && Date.now() < workerDeadline) {
    extensionWorker = context.serviceWorkers().find(worker => worker.url().startsWith('chrome-extension://'))
    if (!extensionWorker) await new Promise(resolve => setTimeout(resolve, 100))
  }
  expect(extensionWorker, 'Chrome extension service worker was not loaded').toBeTruthy()
  return { context, extensionId: new URL(extensionWorker.url()).host, userDataDir }
}

test('new-tab redirect has no visible placeholder before navigation', async ({ playwright }) => {
  const { context, extensionId, userDataDir } = await launchExtension(playwright)
  try {
    const page = await context.newPage()
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        console.log('E2E_INITIAL_DOCUMENT:' + JSON.stringify({
          bodyText: document.body.textContent?.trim() || '',
          targetCount: document.querySelectorAll('#target').length,
        }))
      }, { once: true })
    })
    const initialDocument = page.waitForEvent('console', message => message.text().startsWith('E2E_INITIAL_DOCUMENT:'))

    await page.goto(`chrome-extension://${extensionId}/newtab.html`, { waitUntil: 'commit' })
    const documentState = JSON.parse((await initialDocument).text().slice('E2E_INITIAL_DOCUMENT:'.length))

    expect(documentState.bodyText).toBe('')
    expect(documentState.targetCount).toBe(0)
  } finally {
    await context.close()
    await fs.rm(userDataDir, { recursive: true, force: true })
  }
})
