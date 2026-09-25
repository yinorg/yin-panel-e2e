import { expect, test } from './isolated-fixture.mjs'
import { authHeaders, createItem, createSpace, deleteItem, login } from './helpers.mjs'

const adminCredentials = {
  mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com',
  password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com',
}

async function responseData(response) {
  const body = await response.json()
  expect(body.code, body.msg).toBe(0)
  return body.data
}

test('all built-in theme home views render real items and expose immutable package assets', async ({ isolated, playwright, page }) => {
  if (!isolated)
    throw new Error('Theme acceptance requires YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const user = await login(request, adminCredentials)
  const headers = authHeaders(user)
  const space = await createSpace(request, headers)
  let groupId
  let itemId
  try {
    const group = await responseData(await request.post(`/api/spaces/${space.id}/groups`, {
      headers,
      data: { title: `Theme package E2E ${Date.now()}` },
    }))
    groupId = group.id
    const item = await createItem(request, space.id, headers, {
      title: 'Theme E2E Item',
      url: 'https://example.test/theme-home',
      lanUrl: '',
      description: 'Visible in every built-in view',
      openMethod: 2,
      itemIconGroupId: group.id,
      icon: { itemType: 1, text: 'T', backgroundColor: '#385a66' },
    })
    itemId = item.id

    const packages = await responseData(await request.get('/api/theme/v2/packages'))
    const ids = ['org.yin.default', 'org.yin.glass', 'org.yin.minimal', 'org.yin.cyber']
    const selected = ids.map(id => {
      const pkg = packages.find(entry => entry.id === id)
      expect(pkg, `built-in package ${id} is missing`).toBeTruthy()
      return pkg
    })
    test.info().annotations.push({
      type: 'theme-revisions',
      description: JSON.stringify(selected.map(pkg => ({ id: pkg.id, revision: pkg.revision }))),
    })

    for (const pkg of selected) {
      const detail = await responseData(await request.get(`/api/theme/v2/revisions/${pkg.revision}`))
      expect(detail.manifest.contributes.views).toContain('home')
      expect(detail.manifest.entrypoints.script).toBe('views/home.mjs')
      expect(detail.manifest.entrypoints.styles).toEqual(['styles/home.css'])
      const grant = await responseData(await request.get(`/api/theme/v2/grants/${pkg.revision}`, { headers }))
      expect(grant).toMatchObject({ granted: true, permissions: ['spaces.read', 'groups.read', 'items.read'] })
      for (const asset of detail.manifest.resources) {
        const response = await request.get(asset.url)
        expect(response.ok()).toBeTruthy()
        const body = await response.body()
        expect(body.length).toBeGreaterThan(0)
        if (asset.path.endsWith('.css')) {
          const css = body.toString().replace(/\s+/g, '')
          expect(css).toContain('.builtin-home')
          if (pkg.id === 'org.yin.glass') expect(css).toContain('backdrop-filter')
          if (pkg.id === 'org.yin.minimal') expect(css).toContain('flex-direction:column;gap:0')
          if (pkg.id === 'org.yin.cyber') expect(css).toContain('background-size:28px28px')
        }
      }
    }

    await responseData(await request.post('/api/theme/v2/preference', {
      headers,
      data: { packageId: selected[0].id, mode: 'light' },
    }))
    await page.goto(`${isolated.url}/login`)
    await page.getByPlaceholder(/email|username/i).fill(adminCredentials.mail)
    await page.getByPlaceholder(/password/i).fill(adminCredentials.password)
    await page.getByRole('button', { name: /login/i }).click()
    await expect(page).toHaveURL(`${isolated.url}/`)
    for (const pkg of selected) {
      await responseData(await request.post('/api/theme/v2/preference', {
        headers,
        data: { packageId: pkg.id, mode: 'light' },
      }))
      await page.reload()
      const frame = page.locator('[data-testid="theme-home-frame"]')
      await expect(frame, `${pkg.name} should mount its home view`).toBeVisible()
      const themedHome = page.frameLocator('[data-testid="theme-home-frame"]')
      await expect(themedHome.locator('.item-button')).toHaveCount(1)
      await expect(themedHome.locator('.item-title')).toHaveText('Theme E2E Item')
      await expect(themedHome.locator('.group-title').filter({ hasText: group.title })).toBeVisible()
      await expect(themedHome.locator('.item-icon')).toHaveText('T')
    }

    const beforeTrial = await responseData(await request.get('/api/theme/v2/admin/packages', { headers }))
    const trialRevision = beforeTrial.revisions.find(revision => revision.id !== beforeTrial.activeRevision)
    expect(trialRevision, 'a different immutable revision is needed to verify recovery').toBeTruthy()
    const startedTrial = await responseData(await request.post('/api/theme/v2/admin/trial', { headers, data: { revision: trialRevision.id } }))
    expect(startedTrial.expiresInSeconds).toBe(30)
    let trialState = await responseData(await request.get('/api/theme/v2/admin/packages', { headers }))
    expect(trialState.pendingRevision).toBe(trialRevision.id)
    await responseData(await request.post('/api/theme/v2/admin/rollback', { headers }))
    trialState = await responseData(await request.get('/api/theme/v2/admin/packages', { headers }))
    expect(trialState.activeRevision).toBe(beforeTrial.activeRevision)
    expect(trialState.pendingRevision).toBe('')

    await responseData(await request.post('/api/theme/v2/admin/trial', { headers, data: { revision: trialRevision.id } }))
    await responseData(await request.post('/api/theme/v2/admin/confirm', { headers, data: { revision: trialRevision.id } }))
    trialState = await responseData(await request.get('/api/theme/v2/admin/packages', { headers }))
    expect(trialState.activeRevision).toBe(trialRevision.id)
    expect(trialState.lastGoodRevision).toBe(trialRevision.id)
  }
  finally {
    if (itemId) await deleteItem(request, space.id, itemId, headers)
    if (groupId) await request.delete(`/api/spaces/${space.id}/groups/${groupId}`, { headers }).catch(() => {})
    await request.dispose()
  }
})
