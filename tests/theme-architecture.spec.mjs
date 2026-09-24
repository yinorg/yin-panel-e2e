import { expect, test } from './isolated-fixture.mjs'
import { authHeaders } from './helpers.mjs'

const adminCredentials = {
  mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com',
  password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com',
}

async function responseData(response) {
  const body = await response.json()
  expect(body.code, body.msg).toBe(0)
  return body.data
}

async function login(request, credentials) {
  return responseData(await request.post('/api/login', { data: credentials }))
}

test('official DTCG themes change the visual system without changing panel layout settings', async ({ isolated, playwright, page }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  try {
    const admin = await login(request, adminCredentials)
    const headers = authHeaders(admin)
    for (const id of ['org.yin.glass', 'org.yin.minimal', 'org.yin.cyber']) {
      await responseData(await request.post('/api/theme/admin/default', { headers, data: { packageId: id } }))
      await responseData(await request.post('/api/theme/admin/default', { headers, data: { packageId: 'org.yin.default' } }))
    }
    const themes = await responseData(await request.get('/api/theme/packages'))
    for (const id of ['org.yin.default', 'org.yin.glass', 'org.yin.minimal', 'org.yin.cyber'])
      expect(themes.some(theme => theme.id === id), `${id} is installed`).toBe(true)

    const saved = {
      homeLayout: 'directory',
      maxWidth: 1240,
      maxWidthUnit: 'px',
      marginTop: 7,
      marginBottom: 9,
    }
    await responseData(await request.post('/api/panel/userConfig/setConfig', { headers, data: { panel: saved } }))

    await page.goto(`${isolated.url}/login`)
    await page.getByPlaceholder(/email|username/i).fill(adminCredentials.mail)
    await page.getByPlaceholder(/password/i).fill(adminCredentials.password)
    await page.getByRole('button', { name: /login/i }).click()
    await expect(page).toHaveURL(`${isolated.url}/`)

    const readAppearance = () => page.evaluate(() => ({
      font: getComputedStyle(document.documentElement).getPropertyValue('--yin-fontBody').trim(),
      radius: getComputedStyle(document.documentElement).getPropertyValue('--yin-shape-card').trim(),
      surface: document.documentElement.dataset.yinSurface,
      density: document.documentElement.dataset.yinDensity,
      texture: document.documentElement.dataset.yinTexture,
      layout: document.documentElement.dataset.yinLayout,
    }))
    const appearances = new Map()
    for (const id of ['org.yin.default', 'org.yin.glass', 'org.yin.minimal', 'org.yin.cyber']) {
      await responseData(await request.post('/api/theme/preference', { headers, data: { packageId: id, mode: 'light' } }))
      await page.reload()
      const expected = id === 'org.yin.default'
        ? { surface: 'solid' }
        : id === 'org.yin.glass'
          ? { surface: 'glass' }
          : id === 'org.yin.minimal'
            ? { density: 'spacious' }
            : { density: 'compact', texture: 'grid' }
      await expect.poll(readAppearance).toMatchObject({ layout: 'directory', ...expected })
      appearances.set(id, await readAppearance())
    }

    expect(appearances.get('org.yin.default').surface).toBe('solid')
    expect(appearances.get('org.yin.glass').surface).toBe('glass')
    expect(appearances.get('org.yin.minimal').density).toBe('spacious')
    expect(appearances.get('org.yin.cyber').density).toBe('compact')
    expect(appearances.get('org.yin.cyber').texture).toBe('grid')
    expect(new Set([...appearances.values()].map(value => value.radius)).size).toBe(4)
    expect(appearances.get('org.yin.cyber').font).toContain('monospace')

    await page.emulateMedia({ colorScheme: 'dark' })
    await responseData(await request.post('/api/theme/preference', { headers, data: { packageId: 'org.yin.glass', mode: 'auto' } }))
    await page.reload()
    await expect.poll(() => page.locator('html').evaluate(element => element.classList.contains('dark'))).toBe(true)

    const after = await responseData(await request.get('/api/panel/userConfig/getConfig', { headers }))
    expect(after.panel).toMatchObject({ homeLayout: 'directory', maxWidth: 1240, marginTop: 7, marginBottom: 9 })
  }
  finally {
    await request.dispose()
  }
})
