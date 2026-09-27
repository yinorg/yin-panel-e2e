import { expect, test } from './isolated-fixture.mjs'
import { authHeaders, createItem, createSharedSpace, getSpaces, login, png } from './helpers.mjs'

const adminCredentials = {
  mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com',
  password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com',
}

async function responseData(response) {
  const body = await response.json()
  expect(body.code, body.msg).toBe(0)
  return body.data
}

function installMonitorFixture(page) {
  return page.route('**/api/system/monitor/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data
    if (path.endsWith('/getEnableStatus')) data = { enabled: true, refresh_interval: 30 }
    else if (path.endsWith('/getSnapshot')) {
      data = {
        CPU_INFO: { coreCount: 4, cpuNum: 8, model: 'Deterministic P0 E2E CPU', usages: [35] },
        MEMORY_INFO: { total: 8000000000, used: 4000000000, free: 4000000000, usedPercent: 50 },
        NETWORK_INFO: [{ name: 'e2e0', bytesRecv: 2048, bytesSent: 1024 }],
      }
    }
    else if (path.endsWith('/getDiskMountpoints')) data = []
    else if (path.endsWith('/getDiskStateByPath')) data = { total: 1000000, used: 250000, free: 750000, usedPercent: 25 }
    else return route.continue()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data }) })
  })
}

async function assertDirectoryMonitorGeometry(page, themed, viewport) {
  const monitor = page.getByTestId('theme-runtime-monitor')
  await expect(monitor, `monitor must mount at ${viewport.width}x${viewport.height}`).toBeVisible()
  const monitorBounds = await monitor.boundingBox()
  expect(monitorBounds?.width).toBeGreaterThan(0)
  expect(monitorBounds?.height).toBeGreaterThan(0)

  const items = themed.locator('.yin-item')
  const count = await items.count()
  expect(count, `theme iframe must contain bookmarks at ${viewport.width}x${viewport.height}`).toBeGreaterThan(0)
  for (let index = 0; index < count; index++) {
    const item = items.nth(index)
    await item.scrollIntoViewIfNeeded()
    await expect(item).toBeVisible()
    const bounds = await item.boundingBox()
    expect(bounds?.width).toBeGreaterThan(0)
    expect(bounds?.height).toBeGreaterThan(0)
    const overlaps = bounds.x < monitorBounds.x + monitorBounds.width
      && bounds.x + bounds.width > monitorBounds.x
      && bounds.y < monitorBounds.y + monitorBounds.height
      && bounds.y + bounds.height > monitorBounds.y
    expect.soft(overlaps, `system monitor overlaps ${await item.getAttribute('aria-label')} at ${viewport.width}x${viewport.height}`).toBe(false)

    const topDocumentHit = await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y)
      return {
        testId: hit?.getAttribute('data-testid') || hit?.closest('[data-testid]')?.getAttribute('data-testid') || '',
        monitor: !!hit?.closest('[data-testid="theme-runtime-monitor"]'),
      }
    }, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 })
    expect.soft(topDocumentHit.monitor, 'system monitor must not receive hits over an Item').toBe(false)
    expect.soft(topDocumentHit.testId, 'the sandbox iframe must be the top document hit target over an Item').toBe('theme-home-frame')

    const frameHit = await item.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return hit?.closest('.yin-item') === element
    })
    expect.soft(frameHit, 'Item itself must be the iframe hit target at its center').toBe(true)
  }
}

async function selectDirectorySpace(themed, name) {
  const spaceButton = themed.getByRole('button', { name: new RegExp(name) })
  await expect(spaceButton).toHaveCount(1)
  await spaceButton.click()
  const folderNav = themed.getByRole('navigation', { name: 'Bookmark groups' })
  const alphaButton = folderNav.getByRole('button', { name: 'P0 Directory Alpha', exact: true })
  await expect(alphaButton).toBeVisible()
  await alphaButton.click()
  await expect(themed.getByRole('heading', { name: 'P0 Directory Alpha Child', exact: true })).toBeVisible()
}

test('directory layout never renders only its background when bookmark data exists', async ({ isolated, page, playwright }) => {
  if (!isolated) throw new Error('Directory theme acceptance requires YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')

  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const user = await login(request, adminCredentials)
  const headers = authHeaders(user)
  const spaceName = 'P0 Directory Acceptance'
  await createSharedSpace(request, headers, spaceName)
  const spaces = await getSpaces(request, headers)
  const space = spaces.find(value => value.name === spaceName && value.side === 'yin')
  expect(space, 'the deterministic Yin directory space must be returned by Core').toBeTruthy()
  const createdGroups = []
  const createdItems = []
  let betaItemId

  try {
    const alpha = await responseData(await request.post(`/api/spaces/${space.id}/groups`, {
      headers,
      data: { title: 'P0 Directory Alpha' },
    }))
    createdGroups.push(alpha.id)
    const alphaChild = await responseData(await request.post(`/api/spaces/${space.id}/groups`, {
      headers,
      data: { title: 'P0 Directory Alpha Child', parentId: alpha.id },
    }))
    createdGroups.push(alphaChild.id)
    const beta = await responseData(await request.post(`/api/spaces/${space.id}/groups`, {
      headers,
      data: { title: 'P0 Directory Beta' },
    }))
    createdGroups.push(beta.id)

    const nested = await createItem(request, space.id, headers, {
      title: 'P0 Nested Bookmark', url: 'https://example.test/nested', lanUrl: '', description: 'Nested directory bookmark',
      openMethod: 3, itemIconGroupId: alphaChild.id, icon: { itemType: 1, text: 'N', backgroundColor: '#704c2c' },
    })
    createdItems.push(nested.id)
    const betaItem = await createItem(request, space.id, headers, {
      title: 'P0 Beta Bookmark', url: 'https://example.test/beta', lanUrl: '', description: 'Beta directory bookmark',
      openMethod: 3, itemIconGroupId: beta.id, icon: { itemType: 2, src: `data:image/png;base64,${png.toString('base64')}`, backgroundColor: '#384b75' },
    })
    createdItems.push(betaItem.id)
    betaItemId = betaItem.id

    const storedGroups = await responseData(await request.get(`/api/spaces/${space.id}/groups`, { headers }))
    expect(storedGroups.map(group => group.title)).toEqual(expect.arrayContaining([alpha.title, alphaChild.title, beta.title]))
    await responseData(await request.post('/api/theme/v2/preference', { headers, data: { packageId: 'org.yin.default', mode: 'light' } }))
    await responseData(await request.post('/api/panel/userConfig/setConfig', {
      headers,
      data: { panel: {
        homeLayout: 'directory', clockShowSecond: false, searchBoxShow: false,
        systemMonitorShow: true, systemMonitorShowTitle: true, iconStyle: 1,
        wallpaperMode: 'custom', wallpaperKind: 'image',
        wallpaperSource: '/assets/bg-forest.webp', wallpaperPoster: '/assets/bg-forest.webp',
        backgroundMaskNumber: 0, maxWidth: 1200, maxWidthUnit: 'px', marginTop: 5, marginBottom: 5,
      } },
    }))
    const savedConfig = await request.get('/api/panel/userConfig/getConfig', { headers })
    const savedConfigBody = await savedConfig.json()
    expect(savedConfigBody.code, savedConfigBody.msg).toBe(0)
    expect(savedConfigBody.data.panel.homeLayout).toBe('directory')
    expect(savedConfigBody.data.panel.systemMonitorShow).toBe(true)

    await page.addInitScript(({ token, userInfo }) => {
      sessionStorage.removeItem('yin-theme-safe-mode')
      localStorage.setItem('authStorage', JSON.stringify({ data: { token, userInfo }, expire: null }))
    }, { token: user.token, userInfo: { id: user.userId || user.id, name: user.name, mail: adminCredentials.mail } })
    await page.route('**/sw.js', route => route.abort())
    await installMonitorFixture(page)
    await page.goto(`${isolated.url}/login`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      await Promise.all((await navigator.serviceWorker.getRegistrations()).map(registration => registration.unregister()))
      if ('caches' in window) await Promise.all((await caches.keys()).map(cache => caches.delete(cache)))
    })

    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto(`${isolated.url}/`, { waitUntil: 'domcontentloaded' })
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.evaluate(() => window.dispatchEvent(new Event('online')))

      await expect(page.locator('html')).toHaveAttribute('data-yin-layout', 'directory')
      await expect(page.locator('[data-testid="theme-home-frame"]')).toBeVisible()
      await expect(page.getByTestId('theme-safe-mode-banner')).toHaveCount(0)
      await expect(page.getByTestId('theme-runtime-fallback')).toHaveCount(0)
      expect(await page.evaluate(() => sessionStorage.getItem('yin-theme-safe-mode'))).toBeNull()
      const themed = page.frameLocator('[data-testid="theme-home-frame"]')
      await selectDirectorySpace(themed, spaceName)

      const folderNav = themed.getByRole('navigation', { name: 'Bookmark groups' })
      expect.soft(await folderNav.count(), 'directory theme must expose bookmark folder navigation').toBeGreaterThan(0)
      const alphaButton = folderNav.getByRole('button', { name: 'P0 Directory Alpha', exact: true })
      const betaButton = folderNav.getByRole('button', { name: 'P0 Directory Beta', exact: true })
      expect.soft(await alphaButton.count(), 'directory navigation must expose the parent folder').toBe(1)
      expect.soft(await betaButton.count(), 'directory navigation must expose the second folder').toBe(1)
      if (await alphaButton.count() && await betaButton.count()) {
        await expect.soft(alphaButton).toBeVisible()
        await expect.soft(betaButton).toBeVisible()
        for (const button of [alphaButton, betaButton])
          expect.soft(await button.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44)
        await alphaButton.click()
      }
      const nestedItem = themed.getByRole('button', { name: 'Open P0 Nested Bookmark' })
      await expect.soft(nestedItem).toBeVisible()
      await expect.soft(nestedItem.locator('.yin-item-icon')).toBeVisible()
      await expect.soft(nestedItem.locator('.yin-item-title')).toHaveText('P0 Nested Bookmark')

      if (await betaButton.count()) await betaButton.click()
      const betaItemLocator = themed.getByRole('button', { name: 'Open P0 Beta Bookmark' })
      await expect.soft(betaItemLocator).toBeVisible()
      if (await alphaButton.count() && await betaButton.count()) await expect.soft(nestedItem).toHaveCount(0)
      await assertDirectoryMonitorGeometry(page, themed, viewport)

      if (viewport.width === 1440) {
        const topButton = page.getByTestId('floating-top-button')
        await topButton.click()
        await topButton.focus()
        await page.keyboard.press('x')
        const commandInput = page.getByTestId('command-center-input')
        await expect.soft(commandInput, 'the Core command center must open above the theme iframe').toHaveCount(1)
        if (await commandInput.count()) {
          await expect.soft(commandInput).toHaveValue('x')
          await commandInput.fill('P0 Beta Bookmark')
          await expect.soft(page.locator('.command-center-result').filter({ hasText: 'P0 Beta Bookmark' })).toBeVisible()
          await commandInput.fill('/op')
          await expect.soft(page.getByRole('button', { name: /\/open/ })).toBeVisible()
          await commandInput.press('Escape')
          await expect.soft(page.getByTestId('command-center-panel')).toHaveCount(0)
        }
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 })
    const themed = page.frameLocator('[data-testid="theme-home-frame"]')
    const removableItem = themed.getByRole('button', { name: 'Open P0 Beta Bookmark' })
    await expect.soft(removableItem).toBeVisible()
    if (await removableItem.isVisible()) {
      await removableItem.click({ button: 'right' })
      const deleteAction = themed.getByTestId('theme-delete-item')
      expect.soft(await deleteAction.count(), 'right-clicking a themed bookmark must expose its delete action').toBeGreaterThan(0)
      if (await deleteAction.count() && await deleteAction.isVisible()) {
        await deleteAction.click()
        await page.getByRole('dialog').getByRole('button', { name: /confirm|确认/i }).click()
        await expect(removableItem).toHaveCount(0)
        const remainingItems = await responseData(await request.get(`/api/spaces/${space.id}/items?groupId=${createdGroups[2]}&page=1&pageSize=200`, { headers }))
        expect(remainingItems.some(item => String(item.id) === String(betaItemId))).toBe(false)
        createdItems.splice(createdItems.indexOf(betaItemId), 1)
      }
    }
  }
  finally {
    for (const itemId of createdItems) await request.delete(`/api/spaces/${space.id}/items/${itemId}`, { headers }).catch(() => {})
    for (const groupId of createdGroups.reverse()) await request.delete(`/api/spaces/${space.id}/groups/${groupId}`, { headers }).catch(() => {})
    await request.delete(`/api/spaces/${space.id}`, { headers }).catch(() => {})
    await request.dispose()
  }
})
