import { expect, test } from './isolated-fixture.mjs'
import { authHeaders, createItem, createSharedSpace, getGroups, getSpaces, login } from './helpers.mjs'

async function data(response) {
  const body = await response.json()
  expect(body.code, body.msg).toBe(0)
  return body.data
}

test('default theme switches Yin/Yang and keeps items clickable with system monitor enabled', async ({ isolated, playwright, page }) => {
  if (!isolated) throw new Error('Default theme acceptance requires YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const user = await login(request, { mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com', password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com' })
  const headers = authHeaders(user)
  const spaceName = `Default theme interaction ${Date.now()}`
  await createSharedSpace(request, headers, spaceName)
  const spaces = await getSpaces(request, headers)
  const yinRecord = spaces.find(space => space.name === spaceName && space.side === 'yin')
  expect(yinRecord).toBeTruthy()
  const yang = spaces.find(space => String(space.id) === String(yinRecord.pairedSpaceId)) || { id: yinRecord.pairedSpaceId }
  const yinGroup = (await getGroups(request, yinRecord.id, headers))[0]
  const yangGroup = (await getGroups(request, yang.id, headers))[0]
  let yinItem, yangItem
  try {
    yinItem = await createItem(request, yinRecord.id, headers, { title: 'Yin acceptance item', url: 'https://example.test/yin', lanUrl: '', description: '', openMethod: 3, itemIconGroupId: yinGroup.id, icon: { itemType: 1, text: 'Y' } })
    yangItem = await createItem(request, yang.id, headers, { title: 'Yang acceptance item', url: 'https://example.test/yang', lanUrl: '', description: '', openMethod: 3, itemIconGroupId: yangGroup.id, icon: { itemType: 1, text: 'G' } })
    await data(await request.post('/api/theme/v2/preference', { headers, data: { packageId: 'org.yin.default', mode: 'light' } }))
    await data(await request.post('/api/panel/userConfig/setConfig', { headers, data: { panel: { homeLayout: 'directory', systemMonitorShow: true, systemMonitorShowTitle: true, searchBoxShow: false } } }))

    await page.addInitScript(({ token, userInfo }) => localStorage.setItem('authStorage', JSON.stringify({ data: { token, userInfo }, expire: null })), { token: user.token, userInfo: { id: user.userId || user.id, name: user.name, mail: 'admin@yiniot.com' } })
    await page.route('**/api/system/monitor/**', async route => {
      const path = new URL(route.request().url()).pathname
      const value = path.endsWith('/getEnableStatus') ? { enabled: true, refresh_interval: 30 } : path.endsWith('/getSnapshot') ? { CPU_INFO: { coreCount: 4, cpuNum: 8, model: 'E2E CPU', usages: [20] }, MEMORY_INFO: { total: 100, used: 50, free: 50, usedPercent: 50 }, NETWORK_INFO: [] } : path.endsWith('/getDiskMountpoints') ? [] : { total: 100, used: 20, free: 80, usedPercent: 20 }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: value }) })
    })
    const runtimeErrors = []
    page.on('pageerror', error => runtimeErrors.push(String(error)))
    page.on('console', message => {
      if (message.type() === 'error') runtimeErrors.push(message.text())
    })
    await page.goto(`${isolated.url}/`, { waitUntil: 'domcontentloaded' })
    const frame = page.locator('[data-testid="theme-home-frame"]')
    await expect(frame).toBeVisible()
    const themed = page.frameLocator('[data-testid="theme-home-frame"]')
    const yinSpaceButton = themed.getByRole('button', { name: new RegExp(spaceName) })
    await expect(yinSpaceButton).toHaveCount(1)
    const coreSpaceTrigger = page.getByRole('button', { name: /My space/ }).first()
    await coreSpaceTrigger.click()
    await page.getByText(spaceName, { exact: true }).last().click()
    await expect.poll(async () => yinSpaceButton.getAttribute('aria-current'), { timeout: 15000, intervals: [100, 250, 500] }).toBe('page')
    await expect(themed.getByRole('button', { name: 'Switch to Yang-Panel' })).toBeVisible()
    await expect(themed.getByText('Yin acceptance item', { exact: true })).toBeVisible()
    await expect(themed.getByText('Yang acceptance item', { exact: true })).toHaveCount(0)
    await expect(page.locator('.sun-main[data-panel-side]')).toHaveAttribute('data-panel-side', 'yin')

    const toggle = themed.getByRole('button', { name: 'Switch to Yang-Panel' })
    const toggleBox = await toggle.boundingBox()
    expect(toggleBox?.width).toBeGreaterThan(0)
    await themed.getByRole('button', { name: 'Switch to Yang-Panel' }).click()
    await expect(themed.getByRole('button', { name: 'Switch to Yin-Panel' })).toBeVisible({ timeout: 10000 })
    await expect(themed.getByText('Yang acceptance item', { exact: true })).toBeVisible()
    await expect(themed.getByText('Yin acceptance item', { exact: true })).toHaveCount(0)
    await expect(page.locator('.sun-main[data-panel-side]')).toHaveAttribute('data-panel-side', 'yang')

    const item = themed.getByRole('button', { name: 'Open Yang acceptance item' })
    const box = await item.boundingBox()
    expect(box?.width).toBeGreaterThan(0)
    const hit = await item.evaluate(element => {
      const rect = element.getBoundingClientRect()
      return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('.item-button') !== null
    })
    expect(hit).toBe(true)
    await item.click()
    const itemDialog = page.getByRole('dialog')
    await expect(itemDialog).toBeVisible()
    await itemDialog.getByRole('button', { name: 'close' }).click()
    await expect(itemDialog).toBeHidden()

    await themed.getByRole('button', { name: 'Switch to Yin-Panel' }).click()
    await expect(themed.getByRole('button', { name: 'Switch to Yang-Panel' })).toBeVisible({ timeout: 10000 })
    await expect(themed.getByText('Yin acceptance item', { exact: true })).toBeVisible()
    await expect(page.locator('.sun-main[data-panel-side]')).toHaveAttribute('data-panel-side', 'yin')
    expect(runtimeErrors.filter(error => /randomUUID|Theme sandbox failed|Theme unavailable|API request failed/i.test(error))).toEqual([])
  } finally {
    if (yinItem) await request.delete(`/api/spaces/${yinRecord.id}/items/${yinItem.id}`, { headers }).catch(() => {})
    if (yangItem) await request.delete(`/api/spaces/${yang.id}/items/${yangItem.id}`, { headers }).catch(() => {})
    await request.delete(`/api/spaces/${yinRecord.id}`, { headers }).catch(() => {})
    await request.dispose()
  }
})
