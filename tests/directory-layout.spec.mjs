import { expect, test } from './isolated-fixture.mjs'
import { authHeaders, createItem, deleteItem, login } from './helpers.mjs'

const adminCredentials = {
  mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com',
  password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com',
}

async function responseData(response) {
  const body = await response.json()
  expect(body.code, body.msg).toBe(0)
  return body.data
}

test('directory layout never renders only its background when bookmark data exists', async ({ isolated, page, playwright }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')

  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const user = await login(request, adminCredentials)
  const headers = authHeaders(user)
  const spaceName = `Directory acceptance ${Date.now()}`
  await responseData(await request.post('/api/spaces/teams', {
    headers,
    data: { name: spaceName },
  }))
  const spaces = await responseData(await request.get('/api/spaces', { headers }))
  const space = spaces.find(value => value.name === spaceName && value.side === 'yin')
  expect(space, 'new directory test space is returned by Core').toBeTruthy()
  const createdGroups = []
  const createdItems = []
  let betaItemId
  try {
    const alpha = await responseData(await request.post(`/api/spaces/${space.id}/groups`, {
      headers,
      data: { title: `Directory Alpha ${Date.now()}` },
    }))
    createdGroups.push(alpha.id)
    const alphaChild = await responseData(await request.post(`/api/spaces/${space.id}/groups`, {
      headers,
      data: { title: 'Directory Alpha child', parentId: alpha.id },
    }))
    createdGroups.push(alphaChild.id)
    const beta = await responseData(await request.post(`/api/spaces/${space.id}/groups`, {
      headers,
      data: { title: 'Directory Beta' },
    }))
    createdGroups.push(beta.id)

    const nested = await createItem(request, space.id, headers, {
      title: 'Nested bookmark', url: 'https://example.test/nested', lanUrl: '', description: '',
      openMethod: 3, itemIconGroupId: alphaChild.id, icon: { itemType: 1, text: 'N', backgroundColor: '#704c2c' },
    })
    createdItems.push(nested.id)
    const betaItem = await createItem(request, space.id, headers, {
      title: 'Beta bookmark', url: 'https://example.test/beta', lanUrl: '', description: '',
      openMethod: 3, itemIconGroupId: beta.id, icon: { itemType: 1, text: 'B', backgroundColor: '#384b75' },
    })
    createdItems.push(betaItem.id)
    betaItemId = betaItem.id

    const storedGroups = await responseData(await request.get(`/api/spaces/${space.id}/groups`, { headers }))
    expect(storedGroups.map(group => group.title)).toEqual(expect.arrayContaining([alpha.title, alphaChild.title, beta.title]))

    await responseData(await request.post('/api/panel/userConfig/setConfig', {
      headers,
      data: { panel: {
        homeLayout: 'directory', clockShowSecond: false, searchBoxShow: false,
        systemMonitorShow: true, systemMonitorShowTitle: true, maxWidth: 1200, maxWidthUnit: 'px',
      } },
    }))
    const savedConfig = await request.get('/api/panel/userConfig/getConfig', { headers })
    const savedConfigBody = await savedConfig.json()
    expect(savedConfigBody.code, savedConfigBody.msg).toBe(0)
    expect(savedConfigBody.data.panel.homeLayout).toBe('directory')
    expect(savedConfigBody.data.panel.systemMonitorShow).toBe(true)

  }
  catch (error) {
    await request.dispose()
    throw error
  }

  await page.addInitScript(({ token, userInfo, space }) => {
    sessionStorage.setItem('yin-theme-safe-mode', '1')
    localStorage.setItem('authStorage', JSON.stringify({
      data: { token, userInfo },
      expire: null,
    }))
    localStorage.setItem(`yin-panel-spaces-cache:${userInfo.id}`, JSON.stringify({
      data: [space],
      expire: null,
    }))
  }, { token: user.token, userInfo: { id: user.userId || user.id, name: user.name, mail: adminCredentials.mail }, space })
  await page.route('**/sw.js', route => route.abort())
  await page.goto(`${isolated.url}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(async () => {
    await Promise.all((await navigator.serviceWorker.getRegistrations()).map(registration => registration.unregister()))
    if ('caches' in window)
      await Promise.all((await caches.keys()).map(cache => caches.delete(cache)))
  })
  await page.route('**/api/system/monitor/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    let data
    if (path.endsWith('/getEnableStatus')) data = { enabled: true, refresh_interval: 30 }
    else if (path.endsWith('/getSnapshot')) {
      data = {
        CPU_INFO: { coreCount: 4, cpuNum: 8, model: 'Deterministic E2E CPU', usages: [35] },
        MEMORY_INFO: { total: 8_000_000_000, used: 4_000_000_000, free: 4_000_000_000, usedPercent: 50 },
        NETWORK_INFO: [{ name: 'e2e0', bytesRecv: 2048, bytesSent: 1024 }],
      }
    }
    else if (path.endsWith('/getDiskMountpoints')) data = []
    else if (path.endsWith('/getDiskStateByPath')) data = { total: 1_000_000, used: 250_000, free: 750_000, usedPercent: 25 }
    else return route.continue()

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data }),
    })
  })

  try {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport)
      await page.goto(isolated.url, { waitUntil: 'domcontentloaded' })
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.evaluate(() => window.dispatchEvent(new Event('online')))
      await expect(page.locator('html')).toHaveAttribute('data-yin-layout', 'directory')
      const activeSpaceButton = page.locator('.space-status-button')
      await expect(activeSpaceButton).toBeVisible()
      await activeSpaceButton.dispatchEvent('mouseenter')
      await page.getByText(spaceName, { exact: true }).click()
      await expect(page.getByRole('button', { name: spaceName })).toBeVisible()

      const folderNav = page.getByRole('navigation', { name: 'Bookmark groups' })
      await expect(folderNav).toBeVisible()
      const alphaButton = folderNav.getByRole('button', { name: /^Directory Alpha/ })
      const betaButton = folderNav.getByRole('button', { name: 'Directory Beta', exact: true })
      await expect(alphaButton).toBeVisible()
      await expect(betaButton).toBeVisible()
      for (const button of [alphaButton, betaButton])
        expect(await button.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44)
      await alphaButton.click()

      const nestedItem = page.getByTestId('home-item').filter({ has: page.getByText('Nested bookmark', { exact: true }) })
      await expect(nestedItem).toHaveCount(1)
      await expect(nestedItem).toBeVisible()
      await expect(nestedItem.getByText('Nested bookmark', { exact: true })).toBeVisible()
      const icon = nestedItem.locator('.app-icon-small-icon')
      await expect(icon).toBeVisible()
      const itemBounds = await nestedItem.boundingBox()
      const iconBounds = await icon.boundingBox()
      expect(itemBounds?.width).toBeGreaterThan(0)
      expect(itemBounds?.height).toBeGreaterThan(0)
      expect(iconBounds?.width).toBeGreaterThan(0)
      expect(iconBounds?.height).toBeGreaterThan(0)

      const hitTarget = await icon.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        return target?.closest('[data-testid="home-item"]')?.getAttribute('data-item-title')
      })
      expect(hitTarget).toBe('Nested bookmark')

      await page.getByRole('button', { name: 'Directory Beta', exact: true }).click()
      await expect(page.getByTestId('home-item').filter({ has: page.getByText('Beta bookmark', { exact: true }) })).toBeVisible()
      await expect(nestedItem).toHaveCount(0)

      const monitor = page.locator('.system-monitor-layer')
      const betaItem = page.getByTestId('home-item').filter({ has: page.getByText('Beta bookmark', { exact: true }) })
      await expect(betaItem).toBeVisible()
      const betaIcon = betaItem.locator('.app-icon-small-icon')
      const monitorHitTarget = await betaIcon.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        return target?.closest('[data-testid="home-item"]')?.getAttribute('data-item-title')
      })
      expect(monitorHitTarget).toBe('Beta bookmark')

      await expect(monitor, `system monitor must mount when enabled at ${viewport.width}x${viewport.height}`).toHaveCount(1)
      await expect(monitor).toBeVisible()
      await expect(page.getByText('CPU', { exact: true }).first()).toBeVisible()
      const monitorBounds = await monitor.boundingBox()
      const betaBounds = await betaItem.boundingBox()
      expect(monitorBounds?.height).toBeGreaterThan(0)
      expect(betaBounds?.y).toBeGreaterThanOrEqual((monitorBounds?.y || 0) + (monitorBounds?.height || 0))

      if (viewport.width === 1440) {
        await page.keyboard.press('x')
        const commandInput = page.getByTestId('command-center-input')
        await expect(commandInput).toHaveValue('x')
        await commandInput.fill('Beta')
        await expect(page.locator('.command-center-result').filter({ hasText: 'Beta bookmark' })).toBeVisible()
        await commandInput.fill('/op')
        await expect(page.getByRole('button', { name: /\/open/ })).toBeVisible()
        await commandInput.press('Escape')
        await expect(page.getByTestId('command-center-panel')).toHaveCount(0)
      }
    }

    await page.setViewportSize({ width: 1440, height: 900 })
    const removableItem = page.getByTestId('home-item').filter({ has: page.getByText('Beta bookmark', { exact: true }) })
    await expect(removableItem).toBeVisible()
    await removableItem.click({ button: 'right' })
    await page.getByText(/delete|删除/i, { exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: /confirm|确认/i }).click()
    await expect(removableItem).toHaveCount(0)
    createdItems.splice(createdItems.indexOf(betaItemId), 1)
  }
  finally {
    for (const itemId of createdItems) await deleteItem(request, space.id, itemId, headers)
    for (const groupId of createdGroups.reverse()) await request.delete(`/api/spaces/${space.id}/groups/${groupId}`, { headers }).catch(() => {})
    await request.delete(`/api/spaces/${space.id}`, { headers }).catch(() => {})
    await request.dispose()
  }
})
