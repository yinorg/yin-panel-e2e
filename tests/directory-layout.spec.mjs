import { expect, test } from './isolated-fixture.mjs'

const groups = [
  { id: 10, title: 'Alpha', sort: 1, parentId: null },
  { id: 11, title: 'Alpha child', sort: 1, parentId: 10 },
  { id: 20, title: 'Beta', sort: 2, parentId: null },
]

const bookmarks = {
  10: [],
  11: [{ id: 111, title: 'Nested bookmark', url: 'https://example.test/nested', description: '', openMethod: 3, itemIconGroupId: 11, icon: { itemType: 1, text: 'N', backgroundColor: '#704c2c' } }],
  20: [{ id: 201, title: 'Beta bookmark', url: 'https://example.test/beta', description: '', openMethod: 3, itemIconGroupId: 20, icon: { itemType: 1, text: 'B', backgroundColor: '#384b75' } }],
}

test('directory layout never renders only its background when bookmark data exists', async ({ isolated, page }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')

  const monitorVisible = true
  await page.addInitScript(() => {
    localStorage.setItem('authStorage', JSON.stringify({
      data: { token: 'theme-e2e-token', userInfo: { id: 1 } },
      expire: null,
    }))
  })
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    let data = {}

    if (path.endsWith('/getConfig')) {
      data = { panel: { homeLayout: 'directory', clockShowSecond: false, searchBoxShow: false, systemMonitorShow: monitorVisible, systemMonitorShowTitle: true } }
    }
    else if (path.endsWith('/getEnableStatus')) {
      data = { enabled: monitorVisible, refresh_interval: 30 }
    }
    else if (path.endsWith('/getAll')) {
      data = []
    }
    else if (path.endsWith('/getSnapshot')) {
      data = {
        CPU_INFO: { coreCount: 4, cpuNum: 8, model: 'E2E CPU', usages: [35] },
        MEMORY_INFO: { total: 8_000_000_000, used: 4_000_000_000, free: 4_000_000_000, usedPercent: 50 },
        NETWORK_INFO: [{ name: 'eth0', bytesRecv: 2048, bytesSent: 1024 }],
      }
    }
    else if (path.endsWith('/spaces')) {
      data = [{ id: 1, name: 'Acceptance Space', type: 'personal', ownerUserId: 1 }]
    }
    else if (path.endsWith('/groups')) {
      data = groups
    }
    else if (path.endsWith('/items')) {
      data = bookmarks[Number(url.searchParams.get('groupId'))] || []
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 0, data }),
    })
  })

  let loaded = false
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    if (!loaded) {
      await page.goto(isolated.url, { waitUntil: 'domcontentloaded' })
      loaded = true
    }
    await expect(page.locator('html')).toHaveAttribute('data-yin-layout', 'directory')

    const folderNav = page.getByRole('navigation', { name: 'Bookmark groups' })
    await expect(folderNav).toBeVisible()
    const folderButtons = folderNav.getByRole('button')
    await expect(folderButtons).toHaveCount(2)
    for (const button of await folderButtons.all())
      expect(await button.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44)
    await page.getByRole('button', { name: 'Alpha', exact: true }).click()

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

    await page.getByRole('button', { name: 'Beta', exact: true }).click()
    await expect(page.getByTestId('home-item').filter({ has: page.getByText('Beta bookmark', { exact: true }) })).toBeVisible()
    await expect(nestedItem).toHaveCount(0)

    const monitor = page.locator('.system-monitor-layer')
    await expect(monitor).toBeVisible()
    await expect(page.getByText('CPU', { exact: true }).first()).toBeVisible()
    const betaItem = page.getByTestId('home-item').filter({ has: page.getByText('Beta bookmark', { exact: true }) })
    await expect(betaItem).toBeVisible()
    const monitorBounds = await monitor.boundingBox()
    const betaBounds = await betaItem.boundingBox()
    expect(monitorBounds?.height).toBeGreaterThan(0)
    expect(betaBounds?.y).toBeGreaterThanOrEqual((monitorBounds?.y || 0) + (monitorBounds?.height || 0))

    const betaIcon = betaItem.locator('.app-icon-small-icon')
    const monitorHitTarget = await betaIcon.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return target?.closest('[data-testid="home-item"]')?.getAttribute('data-item-title')
    })
    expect(monitorHitTarget).toBe('Beta bookmark')
  }
})
