import crypto from 'node:crypto'
import { expect, test } from './isolated-fixture.mjs'
import { authHeaders } from './helpers.mjs'
import { strToU8, zipSync } from 'fflate'

const adminCredentials = {
  mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com',
  password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com',
}

function createPackage(id, cssText = ':host { color: var(--yin-primary); }', homeView = false, trusted = false, withSlots = false) {
  const color = (red, green, blue) => ({
    $type: 'color',
    $value: { colorSpace: 'srgb', components: [red, green, blue], alpha: 1 },
  })
  const document = {
    $schema: 'https://www.designtokens.org/schemas/2025.10/format.json',
    semantic: {
      canvas: color(1, 1, 1),
      surface: color(0.96, 0.97, 0.98),
      text: color(0.12, 0.15, 0.17),
      muted: color(0.35, 0.4, 0.43),
      border: color(0.82, 0.86, 0.88),
      primary: color(0.04, 0.36, 0.41),
    },
  }
  const css = strToU8(cssText)
  const slots = withSlots ? `, regions: { footer(root, api, snapshot) { const node = document.createElement('aside'); node.dataset.testid = 'theme-region-footer'; node.textContent = 'Footer ' + snapshot.status; root.append(node); return { update(next) { node.dataset.version = String(next.version); }, unmount() { node.remove(); } } } }, components: { 'item-card'(root) { const node = document.createElement('strong'); node.dataset.testid = 'theme-component-card'; node.textContent = 'Card'; root.append(node); return { update(next) { node.dataset.version = String(next.version); }, unmount() { node.remove(); } } } }` : ''
  const script = strToU8(`export default { apiVersion: '1.0.0', setup() { return { views: { home(root, api, snapshot) { const surface = document.createElement('main'); surface.dataset.testid = 'theme-runtime-mounted'; surface.textContent = 'Theme runtime ready: ' + snapshot.status; try { parent.localStorage.getItem('token'); surface.dataset.isolated = 'false'; } catch { surface.dataset.isolated = 'true'; } const refresh = document.createElement('button'); refresh.type = 'button'; refresh.dataset.testid = 'theme-refresh-data'; refresh.textContent = 'Refresh data'; refresh.addEventListener('click', () => api.commands.execute('data.refresh').then(() => { surface.dataset.refreshResult = 'ok'; }, error => { surface.dataset.refreshResult = String(error.code || 'error'); })); surface.append(refresh); api.events.subscribe('state.updated', event => { surface.dataset.eventVersion = String(event.contextVersion); surface.dataset.eventSequence = String(event.sequence); }); api.events.subscribe('environment.changed', event => { surface.dataset.environmentSequence = String(event.sequence); }); root.replaceChildren(surface); return { update(next) { surface.dataset.version = String(next.version); }, unmount() { surface.remove(); } }; } }${slots} }; } };`)
  const resources = [{
    path: 'styles/theme.css',
    sha256: crypto.createHash('sha256').update(css).digest('hex'),
    mediaType: 'text/css',
  }]
  if (homeView) {
    resources.push({
      path: 'scripts/theme.mjs',
      sha256: crypto.createHash('sha256').update(script).digest('hex'),
      mediaType: 'text/javascript',
    })
  }
  const manifest = {
    format: 'yin-theme',
    formatVersion: 2,
    id,
    name: 'Theme Package v2 E2E',
    version: '1.0.0',
    themeApi: '^1.0.0',
    core: '>=0.3.16',
    author: 'Yin E2E',
    license: 'MIT',
    tokens: {
      format: 'DTCG',
      version: '2025.10',
      documents: { light: 'tokens/light.json', dark: 'tokens/dark.json' },
    },
    defaultScheme: 'light',
    entrypoints: { ...(homeView ? { script: 'scripts/theme.mjs' } : {}), styles: ['styles/theme.css'] },
    runtime: { supportedModes: trusted ? ['sandbox', 'trusted'] : ['sandbox'] },
    contributes: homeView ? { views: ['home'], ...(withSlots ? { regions: ['footer'], components: ['item-card'] } : {}) } : {},
    permissions: homeView ? { required: [{ name: 'spaces.read' }, { name: 'groups.read' }, { name: 'items.read' }] } : {},
    resources,
  }
  const files = {
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'tokens/light.json': strToU8(JSON.stringify(document)),
    'tokens/dark.json': strToU8(JSON.stringify(document)),
    'styles/theme.css': css,
  }
  if (homeView) files['scripts/theme.mjs'] = script
  return Buffer.from(zipSync({
    ...files,
  }))
}

async function responseData(response) {
  const body = await response.json()
  expect(body.code, body.msg).toBe(0)
  return body.data
}

test('v2 packages preview, install, activate, serve immutable assets, and roll back on removal', async ({ isolated, playwright }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const themeId = `community.e2e.v2-${Date.now().toString(36)}`
  let installed = false
  try {
    const login = await responseData(await request.post('/api/login', { data: adminCredentials }))
    const headers = authHeaders(login)
    for (const path of ['/api/theme/current', '/api/theme/packages', '/api/theme/admin/install']) {
      const response = await request.fetch(path, { method: path.endsWith('/install') ? 'POST' : 'GET', headers })
      expect(response.status(), `${path} must not provide a legacy package adapter`).toBe(404)
    }
    const archive = createPackage(themeId, ':host { color: var(--yin-primary); }', true)
    const multipart = {
      package: { name: 'v2.yin-theme', mimeType: 'application/zip', buffer: archive },
    }

    const preview = await responseData(await request.post('/api/theme/v2/admin/preview', { headers, multipart }))
    expect(preview.package.manifest.formatVersion).toBe(2)
    expect(preview.package.manifest.id).toBe(themeId)
    const previewPackage = await responseData(await request.get(`/api/theme/v2/preview/${preview.token}`))
    expect(previewPackage.revision).toBe(preview.package.revision)
    const previewStyle = previewPackage.manifest.resources.find(resource => resource.path === 'styles/theme.css')
    expect(await (await request.get(previewStyle.url)).text()).toContain('--yin-primary')

    const unconfirmed = await request.post('/api/theme/v2/admin/install', {
      headers,
      multipart: { ...multipart, confirmUnverified: 'false' },
    })
    expect((await unconfirmed.json()).msg).toMatch(/unsigned|unverified/i)

    const install = await request.post('/api/theme/v2/admin/install', {
      headers,
      multipart: { ...multipart, confirmUnverified: 'true' },
    })
    const installedPackage = await responseData(install)
    installed = true
    expect(installedPackage.id).toBe(themeId)
    expect(installedPackage.verified).toBe(false)

    const summary = await responseData(await request.get('/api/theme/v2/packages'))
    expect(summary.some(theme => theme.id === themeId && theme.revision === installedPackage.revision)).toBe(true)
    const detail = await responseData(await request.get(`/api/theme/v2/package/${themeId}`))
    expect(detail.manifest.tokens.version).toBe('2025.10')
    const asset = detail.manifest.resources[0]
    expect(await (await request.get(asset.url)).text()).toContain('--yin-primary')

    const missingGrant = await responseData(await request.get(`/api/theme/v2/grants/${installedPackage.revision}`, { headers }))
    expect(missingGrant.granted).toBe(false)
    const missingRequired = await request.post(`/api/theme/v2/grants/${installedPackage.revision}`, { headers, data: { permissions: [] } })
    expect((await missingRequired.json()).code).not.toBe(0)
    const permissions = ['spaces.read', 'groups.read', 'items.read']
    await responseData(await request.post(`/api/theme/v2/grants/${installedPackage.revision}`, { headers, data: { permissions } }))
    expect(await responseData(await request.get(`/api/theme/v2/grants/${installedPackage.revision}`, { headers }))).toMatchObject({ granted: true, permissions })
    await responseData(await request.delete(`/api/theme/v2/grants/${installedPackage.revision}`, { headers }))
    expect((await responseData(await request.get(`/api/theme/v2/grants/${installedPackage.revision}`, { headers }))).granted).toBe(false)

    await responseData(await request.post('/api/theme/v2/admin/default', { headers, data: { packageId: themeId } }))
    const current = await responseData(await request.get('/api/theme/v2/current'))
    expect(current.manifest.id).toBe(themeId)
    expect(current.revision).toBe(installedPackage.revision)

    const legacyArchive = Buffer.from(zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'yin-theme', formatVersion: 1 })) }))
    const legacy = await request.post('/api/theme/v2/admin/install', {
      headers,
      multipart: { package: { name: 'legacy.yin-theme', mimeType: 'application/zip', buffer: legacyArchive }, confirmUnverified: 'true' },
    })
    expect((await legacy.json()).code).not.toBe(0)

    await responseData(await request.delete(`/api/theme/v2/admin/packages/${themeId}`, { headers }))
    installed = false
    expect((await responseData(await request.get('/api/theme/v2/current'))).manifest.id).toBe('org.yin.default')
    const packages = await responseData(await request.get('/api/theme/v2/packages'))
    expect(packages.some(theme => theme.id === themeId)).toBe(false)
  }
  finally {
    if (installed) {
      const login = await responseData(await request.post('/api/login', { data: adminCredentials }))
      await request.delete(`/api/theme/v2/admin/packages/${themeId}`, { headers: authHeaders(login) })
    }
    await request.dispose()
  }
})

test('sandbox home theme mounts only with a user grant and falls back after grant revocation', async ({ isolated, playwright, page }, testInfo) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const themeId = `community.e2e.runtime-${Date.now().toString(36)}`
  let installed = false
  try {
    const login = await responseData(await request.post('/api/login', { data: adminCredentials }))
    const headers = authHeaders(login)
    const multipart = { package: { name: 'runtime.yin-theme', mimeType: 'application/zip', buffer: createPackage(themeId, undefined, true, false, true) } }
    const installation = await responseData(await request.post('/api/theme/v2/admin/install', { headers, multipart: { ...multipart, confirmUnverified: 'true' } }))
    installed = true
    await responseData(await request.post('/api/theme/v2/preference', { headers, data: { revision: installation.revision, mode: 'light' } }))
    await responseData(await request.post(`/api/theme/v2/grants/${installation.revision}`, { headers, data: { permissions: ['spaces.read', 'groups.read', 'items.read'] } }))

    await page.goto(`${isolated.url}/login`)
    await page.getByPlaceholder(/email|username/i).fill(adminCredentials.mail)
    await page.getByPlaceholder(/password/i).fill(adminCredentials.password)
    await page.getByRole('button', { name: /login/i }).click()
    await expect(page).toHaveURL(`${isolated.url}/`)
    const frame = page.locator('[data-testid="theme-home-frame"]')
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
    const runtimeView = page.frameLocator('[data-testid="theme-home-frame"]').locator('[data-testid="theme-runtime-mounted"]')
    await expect(runtimeView).toBeVisible()
    await expect(page.frameLocator('[data-testid="theme-home-frame"]').locator('[data-theme-region="footer"] [data-testid="theme-region-footer"]')).toBeVisible()
    await expect(page.frameLocator('[data-testid="theme-home-frame"]').locator('[data-theme-component="item-card"] [data-testid="theme-component-card"]')).toBeVisible()
    await expect(runtimeView).toHaveAttribute('data-isolated', 'true')
    if (testInfo.project.name === 'pixel-7-chromium' || testInfo.project.name === 'iphone-15-webkit') {
      await expect(frame).toBeVisible()
      await expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
      const refreshControl = runtimeView.getByTestId('theme-refresh-data')
      await refreshControl.focus()
      await expect(refreshControl).toBeFocused()
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false)
    }
    const isolation = await runtimeView.evaluate((surface) => {
      const frameWindow = surface.ownerDocument.defaultView
      const accessDenied = (read) => {
        try { read(); return false }
        catch { return true }
      }
      return {
        origin: frameWindow.location.origin,
        parentDocumentDenied: accessDenied(() => frameWindow.parent.document.documentElement),
        parentLocalStorageDenied: accessDenied(() => frameWindow.parent.localStorage.getItem('authStorage')),
        parentSessionStorageDenied: accessDenied(() => frameWindow.parent.sessionStorage.getItem('yin-panel-public-access')),
      }
    })
    expect(isolation).toEqual({
      origin: 'null',
      parentDocumentDenied: true,
      parentLocalStorageDenied: true,
      parentSessionStorageDenied: true,
    })
    await page.evaluate(() => localStorage.setItem('theme-refresh-marker', 'preserved'))
    const initialVersion = Number(await runtimeView.getAttribute('data-version'))
    await runtimeView.getByTestId('theme-refresh-data').evaluate(button => button.click())
    await expect(runtimeView).toHaveAttribute('data-refresh-result', 'ok')
    await expect(page.frameLocator('[data-testid="theme-home-frame"]').locator('[data-theme-region="footer"] [data-testid="theme-region-footer"]')).toHaveAttribute('data-version', /\d+/)
    await expect(page.frameLocator('[data-testid="theme-home-frame"]').locator('[data-theme-component="item-card"] [data-testid="theme-component-card"]')).toHaveAttribute('data-version', /\d+/)
    await expect.poll(async () => Number(await runtimeView.getAttribute('data-event-sequence'))).toBeGreaterThan(0)
    await expect.poll(async () => Number(await runtimeView.getAttribute('data-version'))).toBeGreaterThan(initialVersion)
    expect(await page.evaluate(() => localStorage.getItem('theme-refresh-marker'))).toBe('preserved')
    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()
    await page.setViewportSize({ width: viewport.width - 1, height: viewport.height })
    await expect.poll(async () => Number(await runtimeView.getAttribute('data-environment-sequence'))).toBeGreaterThan(0)

    await responseData(await request.delete(`/api/theme/v2/grants/${installation.revision}`, { headers }))
    await page.reload()
    await expect(page.locator('[data-testid="theme-home-frame"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="theme-runtime-consent"]')).toBeVisible()
    await expect(page.locator('.home-content')).toBeVisible()
    if (testInfo.project.name === 'pixel-7-chromium' || testInfo.project.name === 'iphone-15-webkit') {
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await expect.poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
      await expect(page.locator('[data-testid="theme-home-frame"]')).toHaveCount(0)
    }
  }
  finally {
    if (installed) {
      const login = await responseData(await request.post('/api/login', { data: adminCredentials }))
      await request.delete(`/api/theme/v2/admin/packages/${themeId}`, { headers: authHeaders(login) })
    }
    await request.dispose()
  }
})

test('trusted home theme requires administrator and user approval and exits after administrator revocation', async ({ isolated, playwright, page }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const themeId = `community.e2e.trusted-${Date.now().toString(36)}`
  let installed = false
  let trustedEnabled = false
  let trustedRevision = ''
  const themeRuntimeErrors = []
  const themeResourceResponses = []
  page.on('console', message => themeRuntimeErrors.push(`${message.type()}: ${message.text()}`))
  page.on('pageerror', error => themeRuntimeErrors.push(error.message))
  page.on('response', response => {
    if (response.url().includes('/api/theme/v2/assets/')) themeResourceResponses.push({ status: response.status(), url: response.url() })
  })
  try {
    const login = await responseData(await request.post('/api/login', { data: adminCredentials }))
    const headers = authHeaders(login)
    const archive = createPackage(themeId, undefined, true, true, true)
    const installation = await responseData(await request.post('/api/theme/v2/admin/install', {
      headers,
      multipart: { package: { name: 'trusted.yin-theme', mimeType: 'application/zip', buffer: archive }, confirmUnverified: 'true' },
    }))
    installed = true
    trustedRevision = installation.revision
    await responseData(await request.post('/api/theme/v2/preference', { headers, data: { revision: installation.revision, mode: 'light' } }))
    const selectedTheme = await responseData(await request.get('/api/theme/v2/mine', { headers }))
    expect(selectedTheme.package.revision).toBe(installation.revision)
    expect(selectedTheme.package.manifest.runtime.supportedModes).toContain('trusted')
    expect(selectedTheme.package.manifest.contributes.components).toContain('item-card')

    const deniedGrant = await request.post(`/api/theme/v2/grants/${installation.revision}`, {
      headers,
      data: { executionMode: 'trusted', permissions: ['spaces.read', 'groups.read', 'items.read'] },
    })
    expect((await deniedGrant.json()).code).not.toBe(0)
    const initialGrant = await responseData(await request.get(`/api/theme/v2/grants/${installation.revision}?executionMode=trusted`, { headers }))
    expect(initialGrant).toMatchObject({ available: false, granted: false })

    await responseData(await request.put(`/api/theme/v2/admin/trusted/${installation.revision}`, { headers, data: { enabled: true } }))
    trustedEnabled = true
    expect(await responseData(await request.get(`/api/theme/v2/grants/${installation.revision}?executionMode=trusted`, { headers }))).toMatchObject({ available: true, granted: false })

    await page.goto(`${isolated.url}/login`)
    await page.getByPlaceholder(/email|username/i).fill(adminCredentials.mail)
    await page.getByPlaceholder(/password/i).fill(adminCredentials.password)
    await page.getByRole('button', { name: /login/i }).click()
    await expect(page).toHaveURL(`${isolated.url}/`)
    const trustedGrantResponses = []
    page.on('response', async (response) => {
      if (response.url().includes(`/theme/v2/grants/${installation.revision}?executionMode=trusted`)) {
        try { trustedGrantResponses.push({ status: response.status(), body: await response.json() }) }
        catch { trustedGrantResponses.push({ status: response.status(), body: null }) }
      }
    })
    await page.getByTestId('theme-runtime-consent').getByRole('button').click()
    await expect(page.getByTestId('theme-runtime-consent-dialog')).toBeVisible()
    await page.locator('.theme-runtime-mode-option').filter({ hasText: /trusted same-origin mode/i }).click()
    await expect(page.getByTestId('theme-trusted-risk')).toBeVisible()
    await page.getByRole('checkbox', { name: /trust this theme revision/i }).check()
    await page.getByTestId('theme-runtime-consent-confirm').click()
    await expect(page).toHaveURL(new RegExp(`/__yin/theme-trusted/${installation.revision}$`))
    expect(await responseData(await request.get(`/api/theme/v2/grants/${installation.revision}?executionMode=trusted`, { headers }))).toMatchObject({ available: true, granted: true })

    const host = page.getByTestId('theme-trusted-host')
    await expect(host, `trusted grant responses: ${JSON.stringify(trustedGrantResponses)}`).toBeVisible()
    const runtimeView = host.getByTestId('theme-runtime-mounted')
    const runtimeDiagnostic = async () => {
      const fallback = await page.getByTestId('theme-runtime-fallback').textContent({ timeout: 1000 }).catch(() => '')
      const shadow = await host.evaluate(element => element.shadowRoot?.innerHTML || '').catch(() => '')
      return `runtime errors: ${JSON.stringify(themeRuntimeErrors)}; resources: ${JSON.stringify(themeResourceResponses)}; fallback: ${fallback}; shadow: ${shadow}`
    }
    await expect(runtimeView, await runtimeDiagnostic()).toBeVisible({ timeout: 15000 })
    await expect(runtimeView).toHaveAttribute('data-isolated', 'false')
    await expect(page.getByTestId('theme-trusted-toolbar')).toBeVisible()
    await expect(page.getByTestId('theme-trusted-toolbar').getByRole('button', { name: /exit trusted theme/i })).toBeVisible()
    await expect(runtimeView.getByTestId('theme-refresh-data')).toBeVisible()
    await expect(host.locator('[data-theme-region="footer"] [data-testid="theme-region-footer"]')).toBeVisible()
    await expect(host.locator('[data-theme-component="item-card"]'), await host.evaluate(element => element.shadowRoot?.innerHTML || '')).toBeVisible()
    await expect(host.locator('[data-theme-component="item-card"] [data-testid="theme-component-card"]')).toBeVisible()

    await responseData(await request.put(`/api/theme/v2/admin/trusted/${installation.revision}`, { headers, data: { enabled: false } }))
    trustedEnabled = false
    await expect(page).toHaveURL(`${isolated.url}/`, { timeout: 12000 })
    await expect(page.getByTestId('theme-trusted-host')).toHaveCount(0)
    expect(await responseData(await request.get(`/api/theme/v2/grants/${installation.revision}?executionMode=trusted`, { headers }))).toMatchObject({ available: false, granted: false })
  }
  finally {
    const login = await responseData(await request.post('/api/login', { data: adminCredentials }))
    const headers = authHeaders(login)
    if (trustedEnabled)
      await request.put(`/api/theme/v2/admin/trusted/${trustedRevision}`, { headers, data: { enabled: false } })
    if (installed)
      await request.delete(`/api/theme/v2/admin/packages/${themeId}`, { headers })
    await request.dispose()
  }
})
