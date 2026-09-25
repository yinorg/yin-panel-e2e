import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from './isolated-fixture.mjs'
import { authHeaders, createItem, createSpace, deleteItem, login } from './helpers.mjs'

const run = promisify(execFile)
const adminCredentials = {
  mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com',
  password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com',
}

test('author CLI previews its generated package against isolated Core and renders real home data', async ({ isolated, playwright, page }) => {
  if (!isolated)
    throw new Error('Theme acceptance requires YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const cli = process.env.YIN_PANEL_TEST_THEME_CLI
  if (!cli) throw new Error('Theme author preview acceptance requires YIN_PANEL_TEST_THEME_CLI')

  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const runtimeErrors = []
  page.on('console', message => {
    if (message.type() === 'error')
      runtimeErrors.push(message.text())
  })
  const user = await login(request, adminCredentials)
  const headers = authHeaders(user)
  const space = await createSpace(request, headers)
  const group = await request.post(`/api/spaces/${space.id}/groups`, {
    headers,
    data: { title: `Author preview ${Date.now()}` },
  })
  const groupBody = await group.json()
  expect(groupBody.code, groupBody.msg).toBe(0)
  const item = await createItem(request, space.id, headers, {
    title: 'CLI Preview Item',
    url: 'https://example.test/cli-preview',
    lanUrl: '',
    description: 'Rendered by the generated Theme API v1 view',
    openMethod: 2,
    itemIconGroupId: groupBody.data.id,
    icon: { itemType: 1, text: 'P', backgroundColor: '#385a66' },
  })
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'yin-theme-author-e2e-'))
  let packageDir
  try {
    packageDir = path.join(work, 'author-theme')
    await run(process.execPath, [cli, 'init', 'Author Preview', '--author', 'Yin E2E', '--directory', packageDir])
    const { stdout } = await run(process.execPath, [cli, 'preview', packageDir, '--core-url', isolated.url, '--mode', 'light'], {
      env: { ...process.env, YIN_THEME_AUTH_TOKEN: user.token },
    })
    const previewURL = stdout.trim().split(/\r?\n/).at(-1)
    const parsedPreview = new URL(previewURL)
    expect(parsedPreview.origin).toBe(isolated.url)
    expect(parsedPreview.searchParams.get('themePreview')).toBeTruthy()
    expect(parsedPreview.searchParams.get('themePreviewMode')).toBe('light')

    await page.goto(`${isolated.url}/login`)
    await page.getByPlaceholder(/email|username/i).fill(adminCredentials.mail)
    await page.getByPlaceholder(/password/i).fill(adminCredentials.password)
    await page.getByRole('button', { name: /login/i }).click()
    await expect(page).toHaveURL(`${isolated.url}/`)
    await page.goto(previewURL)
    await expect(page.getByTestId('theme-runtime-consent')).toBeVisible()
    await expect(page.getByTestId('theme-runtime-consent')).toContainText('spaces.read')
    page.once('dialog', dialog => dialog.accept())
    await page.getByTestId('theme-runtime-consent').getByRole('button').click()
    await page.getByTestId('theme-runtime-consent-confirm').click()

    const frame = page.locator('[data-testid="theme-home-frame"]')
    await expect(frame, runtimeErrors.join('\n')).toBeVisible()
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
    const themedHome = page.frameLocator('[data-testid="theme-home-frame"]')
    await expect(themedHome.locator('.theme-home')).toBeVisible()
    await expect(themedHome.locator('.theme-item')).toHaveText('CLI Preview Item')
    await expect(themedHome.locator('h1')).toHaveText('My space')
  }
  finally {
    await deleteItem(request, space.id, item.id, headers)
    await request.delete(`/api/spaces/${space.id}/groups/${groupBody.data.id}`, { headers }).catch(() => {})
    await request.dispose()
    await fs.rm(work, { recursive: true, force: true })
  }
})
