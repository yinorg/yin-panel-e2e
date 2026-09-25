import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './isolated-fixture.mjs'
import { authHeaders } from './helpers.mjs'
import { createThemeArchive } from './theme-package-fixture.mjs'
import { restartIsolatedService } from './isolated-service.mjs'
import { strToU8, zipSync } from 'fflate'
import { readFile } from 'node:fs/promises'

const adminCredentials = {
  mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com',
  password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com',
}

function uniqueThemeId(name) {
  return `test.e2e.${name}.${Date.now().toString(36)}`
}

async function responseData(response) {
  const body = await response.json()
  expect(body.code, body.msg).toBe(0)
  return body.data
}

async function login(request, credentials) {
  return responseData(await request.post('/api/login', { data: credentials }))
}

async function install(request, headers, archive, confirmUnverified = true) {
  return request.post('/api/theme/v2/admin/install', {
    headers,
    multipart: {
      package: { name: 'fixture.yin-theme', mimeType: 'application/zip', buffer: archive },
      confirmUnverified: String(confirmUnverified),
    },
  })
}

async function createRegularUser(request, headers, suffix) {
  const user = {
    mail: `theme-e2e-${suffix}@example.test`,
    password: 'Theme-E2E-password',
    name: 'Theme E2E User',
    role: 2,
  }
  const data = await responseData(await request.post('/api/panel/users/create', { headers, data: user }))
  return { ...user, id: data.userId }
}

async function loginInBrowser(page, baseUrl, credentials) {
  await page.goto(`${baseUrl}/login`)
  await page.getByPlaceholder(/email|username/i).fill(credentials.mail)
  await page.getByPlaceholder(/password/i).fill(credentials.password)
  await page.getByRole('button', { name: /login/i }).click()
  await expect(page).toHaveURL(`${baseUrl}/`)
}

async function openStyleSettings(page) {
  await page.getByTestId('system-settings-button').click()
  if (await page.evaluate(() => window.innerWidth < 640))
    await page.getByText('System Settings', { exact: true }).click()
  await page.getByText('Style Settings', { exact: true }).click()
}

async function canvasColor(page) {
  return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--yin-canvas').trim())
}

test('unsigned install confirmation, authorization, preferences, audit, and uninstall fallback', async ({ isolated, playwright }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  try {
    const publicTheme = await responseData(await request.get('/api/theme/v2/current'))
    expect(publicTheme.manifest.id).toBe('org.yin.default')
    expect(publicTheme.manifest.dtcgVersion).toBe('2025.10')

    const admin = await login(request, adminCredentials)
    const adminHeaders = authHeaders(admin)
    const themeId = uniqueThemeId('lifecycle')
    const archive = createThemeArchive({ id: themeId, name: 'Lifecycle Theme' })
    const unconfirmed = await install(request, adminHeaders, archive, false)
    expect((await unconfirmed.json()).msg).toMatch(/unverified/i)

    const accepted = await install(request, adminHeaders, archive, true)
    expect((await responseData(accepted)).verified).toBe(false)

    const listed = await responseData(await request.get('/api/theme/v2/admin/packages', { headers: adminHeaders }))
    expect(listed.packages.some(item => item.id === themeId && item.verified === false)).toBe(true)

    const regular = await createRegularUser(request, adminHeaders, Date.now())
    const user = await login(request, regular)
    const userHeaders = authHeaders(user)
    expect(user.role).toBe(2)
    for (const [method, url, data] of [
      ['get', '/api/theme/v2/admin/packages'],
      ['post', '/api/theme/v2/admin/default', { packageId: themeId }],
      ['delete', `/api/theme/v2/admin/packages/${themeId}`],
    ]) {
      const response = await request[method](url, { headers: userHeaders, data })
      expect((await response.json()).code).not.toBe(0)
    }

    expect((await request.get('/api/theme/v2/admin/packages').then(response => response.json())).code).not.toBe(0)
    await responseData(await request.post('/api/theme/v2/preference', {
      headers: userHeaders,
      data: { packageId: themeId, mode: 'dark' },
    }))

    await responseData(await request.post('/api/theme/v2/admin/default', {
      headers: adminHeaders,
      data: { packageId: themeId },
    }))
    let mine = await responseData(await request.get('/api/theme/v2/mine', { headers: userHeaders }))
    expect(mine.package.manifest.id).toBe(themeId)
    expect(mine.preference.mode).toBe('dark')
    expect(mine.preference.packageId).toBe(themeId)

    const audit = await responseData(await request.get('/api/theme/v2/admin/audit', { headers: adminHeaders }))
    expect(audit.map(row => row.action)).toEqual(expect.arrayContaining(['install', 'default', 'select']))

    await responseData(await request.delete(`/api/theme/v2/admin/packages/${themeId}`, { headers: adminHeaders }))
    const current = await responseData(await request.get('/api/theme/v2/current'))
    mine = await responseData(await request.get('/api/theme/v2/mine', { headers: userHeaders }))
    expect(current.manifest.id).toBe('org.yin.default')
    expect(mine.package.manifest.id).toBe('org.yin.default')
    expect(mine.preference.packageId).toBe('org.yin.default')
    expect(mine.preference.mode).toBe('dark')
  }
  finally {
    await request.dispose()
  }
})

test('built-in Yin Mist is selectable, renders both schemes, and stays removed after restart', async ({ isolated, playwright, page }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  try {
    const admin = await login(request, adminCredentials)
    const adminHeaders = authHeaders(admin)
    const publicPackages = await responseData(await request.get('/api/theme/v2/packages'))
    expect(publicPackages.some(item => item.id === 'org.yin.mist' && item.name === 'Yin Mist')).toBe(true)
    const adminPackages = await responseData(await request.get('/api/theme/v2/admin/packages', { headers: adminHeaders }))
    expect(adminPackages.defaultPackage).toBe('org.yin.default')

    const regular = await createRegularUser(request, adminHeaders, Date.now())
    const user = await login(request, regular)
    const userHeaders = authHeaders(user)
    await page.emulateMedia({ colorScheme: 'light' })
    await loginInBrowser(page, isolated.url, regular)
    await page.getByTestId('system-settings-button').click()
    const packageSelect = page.locator('.theme-page .n-select').nth(2)
    await expect(packageSelect).toBeVisible()
    const selectionSaved = page.waitForResponse(response => response.url().includes('/api/theme/v2/preference') && response.request().method() === 'POST')
    await packageSelect.click()
    await page.getByText('Yin Mist', { exact: true }).last().click()
    expect((await (await selectionSaved).json()).code).toBe(0)
    await page.reload()
    await expect.poll(() => canvasColor(page)).toBe('#f4f7f6')

    await responseData(await request.post('/api/theme/v2/preference', {
      headers: userHeaders,
      data: { packageId: 'org.yin.mist', mode: 'dark' },
    }))
    await page.reload()
    await expect.poll(() => canvasColor(page)).toBe('#151d1c')

    await responseData(await request.post('/api/theme/v2/admin/default', {
      headers: adminHeaders,
      data: { packageId: 'org.yin.mist' },
    }))
    await responseData(await request.delete('/api/theme/v2/admin/packages/org.yin.mist', { headers: adminHeaders }))
    const current = await responseData(await request.get('/api/theme/v2/current'))
    const mine = await responseData(await request.get('/api/theme/v2/mine', { headers: userHeaders }))
    expect(current.manifest.id).toBe('org.yin.default')
    expect(mine.package.manifest.id).toBe('org.yin.default')
    expect(mine.preference.packageId).toBe('org.yin.default')
    expect(mine.preference.mode).toBe('dark')

    await restartIsolatedService(isolated)
    const packagesAfterRestart = await responseData(await request.get('/api/theme/v2/packages'))
    expect(packagesAfterRestart.some(item => item.id === 'org.yin.mist')).toBe(false)
    const selectionAfterRemoval = await request.post('/api/theme/v2/preference', {
      headers: userHeaders,
      data: { packageId: 'org.yin.mist', mode: 'light' },
    })
    expect((await selectionAfterRemoval.json()).code).not.toBe(0)
  }
  finally {
    await request.dispose()
  }
})

test('browser confirms an unsigned package, renders it, and preserves stored panel values when adopting defaults', async ({ isolated, playwright, page }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  try {
    const admin = await login(request, adminCredentials)
    const headers = authHeaders(admin)
    const savedConfig = await request.post('/api/panel/userConfig/setConfig', {
      headers,
      data: { panel: { iconTextColor: '#fa00aa', backgroundImageSrc: '/uploads/legacy.png' } },
    })
    expect((await savedConfig.json()).code).toBe(0)

    await loginInBrowser(page, isolated.url, adminCredentials)
    await openStyleSettings(page)
    let confirmationCount = 0
    page.on('dialog', async (dialog) => {
      confirmationCount++
      expect(dialog.message()).toMatch(/not signed by Yin/i)
      await dialog.accept()
    })
    const uiThemeId = uniqueThemeId('ui')
    const archive = createThemeArchive({ id: uiThemeId, name: 'Browser Theme', apiVersion: '2' })
    await page.locator('input[type="file"][accept*=".yin-theme"]').setInputFiles({
      name: 'browser-theme.yin-theme',
      mimeType: 'application/zip',
      buffer: archive,
    })
    await expect(page.getByText('Preview theme', { exact: true })).toBeVisible()
    const beforeInstall = await responseData(await request.get('/api/theme/v2/admin/packages', { headers }))
    expect(beforeInstall.packages.some(item => item.id === uiThemeId)).toBe(false)
    await page.getByRole('button', { name: 'Install package' }).last().click()
    await expect(page.getByText(new RegExp(uiThemeId.replaceAll('.', '\\.')))).toBeVisible()
    expect(confirmationCount).toBe(1)

    await responseData(await request.post('/api/theme/v2/admin/default', {
      headers,
      data: { packageId: uiThemeId },
    }))
    await page.goto(`${isolated.url}/`)
    await expect.poll(() => canvasColor(page)).toBe('#eff7ff')

    const adoptResponse = page.waitForResponse(response => response.url().includes('/api/panel/userConfig/setConfig') && response.request().method() === 'POST')
    await openStyleSettings(page)
    const adopt = page.getByRole('button', { name: 'Use theme colors' })
    await adopt.scrollIntoViewIfNeeded()
    await adopt.click()
    expect((await (await adoptResponse).json()).code).toBe(0)

    const config = await responseData(await request.get('/api/panel/userConfig/getConfig', { headers }))
    expect(config.panel.useThemeDefaults).toBe(true)
    expect(config.panel.iconTextColor).toBe('#fa00aa')
    expect(config.panel.backgroundImageSrc).toBe('/uploads/legacy.png')

    await page.evaluate(() => {
      localStorage.removeItem('authStorage')
      sessionStorage.clear()
    })
    await page.goto(`${isolated.url}/login`)
    const axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    const results = await axe.analyze()
    expect(results.violations.map(violation => violation.id)).toEqual([])
  }
  finally {
    await request.dispose()
  }
})

test('v2 external web wallpaper requires admin confirmation and renders its static poster', async ({ isolated, playwright, page }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  try {
    const admin = await login(request, adminCredentials)
    const headers = authHeaders(admin)
    const themeId = uniqueThemeId('external')
    const poster = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64')
    const wallpaper = { kind: 'externalUrl', source: 'https://wallpaper.example.test/live', poster: 'wallpaper/poster.png' }
    const archive = createThemeArchive({
      id: themeId, name: 'External Wallpaper Theme', apiVersion: '2',
      wallpapers: { light: wallpaper, dark: wallpaper },
      extraResources: [{ path: 'wallpaper/poster.png', mediaType: 'image/png', content: poster }],
      designValues: { layoutTemplate: 'split', controlHeight: { value: 44, unit: 'px' } },
    })
    await responseData(await install(request, headers, archive))
    const rejected = await request.post('/api/theme/v2/admin/default', { headers, data: { packageId: themeId } })
    expect((await rejected.json()).code).not.toBe(0)
    await responseData(await request.post('/api/theme/v2/admin/default', { headers, data: { packageId: themeId, confirmExternalWallpaper: true } }))

    const regular = await createRegularUser(request, headers, Date.now())
    const user = await login(request, regular)
    const userHeaders = authHeaders(user)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await loginInBrowser(page, isolated.url, regular)
    await expect(page.getByTestId('wallpaper-layer')).toBeVisible()
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--yin-controlHeight').trim())).toBe('44px')
    await expect(page.getByTestId('wallpaper-layer').getByRole('button')).toHaveCount(0)
    await expect(page.locator('iframe[title="Wallpaper"]')).toHaveCount(0)
    await expect(page.getByTestId('wallpaper-layer').locator('img')).toHaveAttribute('src', /poster\.png/)

    await responseData(await request.post('/api/panel/userConfig/setConfig', {
      headers: userHeaders,
      data: { panel: { wallpaperMode: 'none', maxWidthUnit: 'px' } },
    }))
    await page.reload()
    await expect(page.getByTestId('wallpaper-layer')).toHaveCount(0)
    const audit = await responseData(await request.get('/api/theme/v2/admin/audit', { headers }))
    expect(audit.some(item => item.action === 'default-external' && item.packageId === themeId)).toBe(true)
  }
  finally {
    await request.dispose()
  }
})

test('a user can upload an isolated local web wallpaper package', async ({ isolated, playwright, page }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  try {
    const admin = await login(request, adminCredentials)
    const headers = authHeaders(admin)
    const regular = await createRegularUser(request, headers, Date.now())
    const user = await login(request, regular)
    const userHeaders = authHeaders(user)
    const poster = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64')
    const bundle = Buffer.from(zipSync({
      'index.html': strToU8('<!doctype html><html><body><button onclick="this.textContent=\'Clicked\'">Local wallpaper</button></body></html>'),
      'poster.png': poster,
    }))
    const uploaded = await responseData(await request.post('/api/theme/v2/wallpaper/web', {
      headers: userHeaders,
      multipart: { package: { name: 'local.yin-wallpaper', mimeType: 'application/zip', buffer: bundle } },
    }))
    const asset = await request.get(uploaded.source)
    expect(asset.headers()['content-security-policy']).toContain("connect-src 'none'")
    await responseData(await request.post('/api/panel/userConfig/setConfig', {
      headers: userHeaders,
      data: { panel: { wallpaperMode: 'custom', wallpaperKind: 'webBundle', wallpaperSource: uploaded.source, wallpaperPoster: uploaded.poster, maxWidthUnit: 'px' } },
    }))
    await loginInBrowser(page, isolated.url, regular)
    await expect(page.getByTestId('wallpaper-layer')).toBeVisible()
    await page.getByRole('button', { name: 'Interact with wallpaper' }).click()
    const frame = page.frameLocator('iframe[title="Wallpaper"]')
    await frame.getByRole('button', { name: 'Local wallpaper' }).click()
    await expect(frame.getByRole('button', { name: 'Clicked' })).toBeVisible()
    await page.getByRole('button', { name: 'Exit wallpaper interaction' }).click()
    await expect(page.getByRole('button', { name: 'Interact with wallpaper' })).toBeVisible()
  }
  finally {
    await request.dispose()
  }
})

test('a user video wallpaper pauses and follows reduced-motion preference', async ({ isolated, playwright, page }, testInfo) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  try {
    const admin = await login(request, adminCredentials)
    const regular = await createRegularUser(request, authHeaders(admin), Date.now())
    const user = await login(request, regular)
    const userHeaders = authHeaders(user)
    const video = await readFile(new URL('./theme-wallpaper.mp4', import.meta.url))
    const upload = await responseData(await request.post('/api/file/uploadImg', {
      headers: userHeaders,
      multipart: { imgfile: { name: 'wallpaper.mp4', mimeType: 'video/mp4', buffer: video } },
    }))
    const videoUrl = upload.imageUrl
    const ranged = await request.get(videoUrl, { headers: { Range: 'bytes=0-15' } })
    expect(ranged.status()).toBe(206)
    await responseData(await request.post('/api/panel/userConfig/setConfig', {
      headers: userHeaders,
      data: { panel: { wallpaperMode: 'custom', wallpaperKind: 'video', wallpaperSource: videoUrl, wallpaperPoster: '/assets/bg-forest.webp', maxWidthUnit: 'px' } },
    }))
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const videoRequest = page.waitForRequest(request => request.url().endsWith(videoUrl))
    await loginInBrowser(page, isolated.url, regular)
    await videoRequest
    if (testInfo.project.name.includes('webkit')) {
      await expect(page.getByTestId('wallpaper-layer').locator('img')).toHaveAttribute('src', '/assets/bg-forest.webp')
      await expect(page.getByRole('button', { name: 'Pause wallpaper' })).toBeVisible()
    }
    else {
      await expect(page.getByTestId('wallpaper-layer').locator('video')).toBeVisible()
      await page.getByRole('button', { name: 'Pause wallpaper' }).click()
      await expect(page.getByTestId('wallpaper-layer').locator('video')).toHaveCount(0)
      await page.getByRole('button', { name: 'Play wallpaper' }).click()
      await expect(page.getByTestId('wallpaper-layer').locator('video')).toBeVisible()
    }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.getByTestId('wallpaper-layer').locator('video')).toHaveCount(0)
    await expect(page.getByTestId('wallpaper-layer').locator('img')).toBeVisible()
  }
  finally {
    await request.dispose()
  }
})

test('OS mode, explicit mode, and single-scheme packages select the expected colors', async ({ isolated, playwright, page }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  try {
    const admin = await login(request, adminCredentials)
    const adminHeaders = authHeaders(admin)
    const themeId = uniqueThemeId('mode')
    const archive = createThemeArchive({ id: themeId, name: 'Mode Theme' })
    expect((await responseData(await install(request, adminHeaders, archive))).id).toBe(themeId)
    const regular = await createRegularUser(request, adminHeaders, Date.now())
    const user = await login(request, regular)
    const userHeaders = authHeaders(user)
    await page.emulateMedia({ colorScheme: 'dark' })
    await loginInBrowser(page, isolated.url, regular)

    await page.getByTestId('system-settings-button').click()
    const selects = page.locator('.theme-page .n-select')
    await expect(selects).toHaveCount(3)
    const packageSaved = page.waitForResponse(response => response.url().includes('/api/theme/v2/preference') && response.request().method() === 'POST')
    await selects.nth(2).click()
    await page.getByText('Mode Theme', { exact: true }).last().click()
    expect((await (await packageSaved).json()).code).toBe(0)
    await expect.poll(() => canvasColor(page)).toBe('#171d20')

    const modeSaved = page.waitForResponse(response => response.url().includes('/api/theme/v2/preference') && response.request().method() === 'POST')
    await selects.nth(1).click()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    expect((await (await modeSaved).json()).code).toBe(0)
    await page.reload()
    await expect.poll(() => canvasColor(page)).toBe('#eff7ff')
    let mine = await responseData(await request.get('/api/theme/v2/mine', { headers: userHeaders }))
    expect(mine.preference.packageId).toBe(themeId)
    expect(mine.preference.mode).toBe('light')

    const singleId = uniqueThemeId('single')
    const singleArchive = createThemeArchive({ id: singleId, name: 'Single Scheme', schemes: ['light'] })
    expect((await responseData(await install(request, adminHeaders, singleArchive))).id).toBe(singleId)
    await page.reload()
    await page.getByTestId('system-settings-button').click()
    const singleSelectSaved = page.waitForResponse(response => response.url().includes('/api/theme/v2/preference') && response.request().method() === 'POST')
    await page.locator('.theme-page .n-select').nth(2).click()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    expect((await (await singleSelectSaved).json()).code).toBe(0)
    mine = await responseData(await request.get('/api/theme/v2/mine', { headers: userHeaders }))
    expect(mine.preference.packageId).toBe(singleId)
    const darkModeSaved = page.waitForResponse(response => response.url().includes('/api/theme/v2/preference') && response.request().method() === 'POST')
    await page.locator('.theme-page .n-select').nth(1).click()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    expect((await (await darkModeSaved).json()).code).toBe(0)
    await page.reload()
    await expect.poll(() => canvasColor(page)).toBe('#eff7ff')
    mine = await responseData(await request.get('/api/theme/v2/mine', { headers: userHeaders }))
    expect(mine.preference.mode).toBe('dark')
    expect(mine.preference.packageId).toBe(singleId)
  }
  finally {
    await request.dispose()
  }
})

test('upgrade changes the immutable asset URL and serves the new asset bytes', async ({ isolated, playwright, page }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  try {
    const admin = await login(request, adminCredentials)
    const headers = authHeaders(admin)
    const themeId = uniqueThemeId('upgrade')
    const oldBytes = 'immutable-asset-v1'
    const newBytes = 'immutable-asset-v2'
    const firstArchive = createThemeArchive({ id: themeId, name: 'Upgrade Theme', assetContent: oldBytes })
    expect((await responseData(await install(request, headers, firstArchive))).id).toBe(themeId)
    await responseData(await request.post('/api/theme/v2/admin/default', { headers, data: { packageId: themeId } }))
    const before = await responseData(await request.get('/api/theme/v2/current'))
    const oldUrl = before.manifest.resources[0].url
    await page.goto(`${isolated.url}/`)
    const oldContent = await page.evaluate(async url => await (await fetch(url)).text(), new URL(oldUrl, isolated.url).href)
    expect(oldContent).toBe(oldBytes)

    const nextArchive = createThemeArchive({
      id: themeId,
      name: 'Upgrade Theme',
      version: '1.0.1',
      assetContent: newBytes,
      colorVariant: 'blue',
    })
    expect((await responseData(await install(request, headers, nextArchive))).id).toBe(themeId)
    const after = await responseData(await request.get('/api/theme/v2/current'))
    const newUrl = after.manifest.resources[0].url
    expect(newUrl).not.toBe(oldUrl)
    expect(after.manifest.packageVersion).toBe('1.0.1')
    const newContent = await page.evaluate(async url => await (await fetch(url)).text(), new URL(newUrl, isolated.url).href)
    expect(newContent).toBe(newBytes)
  }
  finally {
    await request.dispose()
  }
})

test('invalid packages are rejected without installing partial state', async ({ isolated, playwright }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  try {
    const admin = await login(request, adminCredentials)
    const headers = authHeaders(admin)
    const currentBefore = await responseData(await request.get('/api/theme/v2/current'))
    const invalidId = uniqueThemeId('invalid')
    const invalid = await install(request, headers, createThemeArchive({
      id: invalidId,
      invalidDtcgVersion: true,
    }))
    expect((await invalid.json()).code).not.toBe(0)
    const list = await responseData(await request.get('/api/theme/v2/admin/packages', { headers }))
    expect(list.packages.some(item => item.id === invalidId)).toBe(false)
    const defaultResponse = await responseData(await request.get('/api/theme/v2/current'))
    expect(defaultResponse.manifest.id).toBe(currentBefore.manifest.id)
  }
  finally {
    await request.dispose()
  }
})

test('theme login renders within performance budgets without runtime or network errors', async ({ isolated, page }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('requestfailed', request => errors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`))
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
  })
  await page.addInitScript(() => {
    window.__themeCls = 0
    new PerformanceObserver((list) => {
      const latest = list.getEntries().at(-1)
      if (latest) window.__themeLcp = latest.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__themeCls = (window.__themeCls || 0) + (entry.value || 0)
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.goto(`${isolated.url}/login`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-lcp="brand"]').last()).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__themeLcp || 0)).toBeGreaterThan(0)
  const metrics = await page.evaluate(() => {
    return { lcp: window.__themeLcp || 0, cls: window.__themeCls || 0 }
  })
  expect(metrics.lcp).toBeLessThan(2500)
  expect(metrics.cls).toBeLessThan(0.1)
  expect(errors).toEqual([])
})
