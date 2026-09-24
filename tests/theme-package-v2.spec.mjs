import crypto from 'node:crypto'
import { expect, test } from './isolated-fixture.mjs'
import { authHeaders } from './helpers.mjs'
import { strToU8, zipSync } from 'fflate'

const adminCredentials = {
  mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com',
  password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com',
}

function createPackage(id, cssText = ':host { color: var(--yin-primary); }', homeView = false) {
  const color = (red, green, blue) => ({
    $type: 'color',
    $value: { colorSpace: 'srgb', components: [red, green, blue], alpha: 1 },
  })
  const document = {
    $schema: 'https://design-tokens.github.io/community-group/format/2025.10/schema.json',
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
  const script = strToU8(`export default { apiVersion: '1.0.0', setup() { return { views: { home(root, api, snapshot) { const surface = document.createElement('main'); surface.dataset.testid = 'theme-runtime-mounted'; surface.textContent = 'Theme runtime ready: ' + snapshot.status; try { parent.localStorage.getItem('token'); surface.dataset.isolated = 'false'; } catch { surface.dataset.isolated = 'true'; } root.replaceChildren(surface); return { update(next) { surface.dataset.version = String(next.version); }, unmount() { surface.remove(); } }; } } }; } };`)
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
    runtime: { supportedModes: ['sandbox'] },
    contributes: homeView ? { views: ['home'] } : {},
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
    const archive = createPackage(themeId, ':host { color: var(--yin-primary); }', true)
    const multipart = {
      package: { name: 'v2.yin-theme', mimeType: 'application/zip', buffer: archive },
    }

    const preview = await responseData(await request.post('/api/theme/admin/preview', { headers, multipart }))
    expect(preview.package.manifest.formatVersion).toBe(2)
    expect(preview.package.manifest.id).toBe(themeId)
    const previewPackage = await responseData(await request.get(`/api/theme/preview/${preview.token}`))
    expect(previewPackage.revision).toBe(preview.package.revision)
    const previewStyle = previewPackage.manifest.resources.find(resource => resource.path === 'styles/theme.css')
    expect(await (await request.get(previewStyle.url)).text()).toContain('--yin-primary')

    const unconfirmed = await request.post('/api/theme/admin/install', {
      headers,
      multipart: { ...multipart, confirmUnverified: 'false' },
    })
    expect((await unconfirmed.json()).msg).toMatch(/unsigned|unverified/i)

    const install = await request.post('/api/theme/admin/install', {
      headers,
      multipart: { ...multipart, confirmUnverified: 'true' },
    })
    const installedPackage = await responseData(install)
    installed = true
    expect(installedPackage.id).toBe(themeId)
    expect(installedPackage.verified).toBe(false)

    const summary = await responseData(await request.get('/api/theme/packages'))
    expect(summary.some(theme => theme.id === themeId && theme.revision === installedPackage.revision)).toBe(true)
    const detail = await responseData(await request.get(`/api/theme/packages/${themeId}`))
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

    await responseData(await request.post('/api/theme/admin/default', { headers, data: { packageId: themeId } }))
    const current = await responseData(await request.get('/api/theme/current'))
    expect(current.manifest.id).toBe(themeId)
    expect(current.revision).toBe(installedPackage.revision)

    const legacyArchive = Buffer.from(zipSync({ 'manifest.json': strToU8(JSON.stringify({ format: 'yin-theme', formatVersion: 1 })) }))
    const legacy = await request.post('/api/theme/admin/install', {
      headers,
      multipart: { package: { name: 'legacy.yin-theme', mimeType: 'application/zip', buffer: legacyArchive }, confirmUnverified: 'true' },
    })
    expect((await legacy.json()).code).not.toBe(0)

    await responseData(await request.delete(`/api/theme/admin/packages/${themeId}`, { headers }))
    installed = false
    expect((await responseData(await request.get('/api/theme/current'))).manifest.id).toBe('org.yin.default')
    const packages = await responseData(await request.get('/api/theme/packages'))
    expect(packages.some(theme => theme.id === themeId)).toBe(false)
  }
  finally {
    if (installed) {
      const login = await responseData(await request.post('/api/login', { data: adminCredentials }))
      await request.delete(`/api/theme/admin/packages/${themeId}`, { headers: authHeaders(login) })
    }
    await request.dispose()
  }
})

test('sandbox home theme mounts only with a user grant and falls back after grant revocation', async ({ isolated, playwright, page }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const themeId = `community.e2e.runtime-${Date.now().toString(36)}`
  let installed = false
  try {
    const login = await responseData(await request.post('/api/login', { data: adminCredentials }))
    const headers = authHeaders(login)
    const multipart = { package: { name: 'runtime.yin-theme', mimeType: 'application/zip', buffer: createPackage(themeId, undefined, true) } }
    const installation = await responseData(await request.post('/api/theme/admin/install', { headers, multipart: { ...multipart, confirmUnverified: 'true' } }))
    installed = true
    await responseData(await request.post('/api/theme/preference', { headers, data: { revision: installation.revision, mode: 'light' } }))
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
    await expect(runtimeView).toHaveAttribute('data-isolated', 'true')

    await responseData(await request.delete(`/api/theme/v2/grants/${installation.revision}`, { headers }))
    await page.reload()
    await expect(page.locator('[data-testid="theme-home-frame"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="theme-runtime-consent"]')).toBeVisible()
    await expect(page.locator('.home-content')).toBeVisible()
  }
  finally {
    if (installed) {
      const login = await responseData(await request.post('/api/login', { data: adminCredentials }))
      await request.delete(`/api/theme/admin/packages/${themeId}`, { headers: authHeaders(login) })
    }
    await request.dispose()
  }
})
