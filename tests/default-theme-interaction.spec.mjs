import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from './isolated-fixture.mjs'
import { authHeaders, createItem, createSharedSpace, createSpace, getGroups, getItems, getSpaces, login, png } from './helpers.mjs'

const testDirectory = path.dirname(fileURLToPath(import.meta.url))

async function compareLegacyBaseline(page, testInfo, mode, width, height) {
  const name = `yin-theme-baseline-6c69d84-${mode}-${width}x${height}`
  const metadata = JSON.parse(await readFile(path.join(testDirectory, 'fixtures', `${name}.json`), 'utf8'))
  const baseline = await readFile(path.join(testDirectory, 'fixtures', `${name}.png`))
  const actual = await page.screenshot({
    path: testInfo.outputPath(`${name}-actual.png`),
    animations: 'disabled',
    caret: 'hide',
  })
  const comparison = await page.evaluate(async ({ expected, actual, viewport }) => {
    const decode = async source => createImageBitmap(await fetch(`data:image/png;base64,${source}`).then(response => response.blob()))
    const [left, right] = await Promise.all([decode(expected), decode(actual)])
    if (left.width !== viewport.width || left.height !== viewport.height
      || right.width % left.width !== 0 || right.height % left.height !== 0
      || right.width / left.width !== right.height / left.height) {
      return { width: right.width, height: right.height, mismatchRatio: 1, reason: 'dimensions are not an integer device-scale multiple of the CSS viewport' }
    }
    const canvas = document.createElement('canvas')
    canvas.width = left.width
    canvas.height = left.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(left, 0, 0)
    const expectedPixels = context.getImageData(0, 0, left.width, left.height).data
    context.clearRect(0, 0, left.width, left.height)
    context.drawImage(right, 0, 0, left.width, left.height)
    const actualPixels = context.getImageData(0, 0, right.width, right.height).data
    let different = 0
    for (let pixel = 0; pixel < expectedPixels.length; pixel += 4) {
      if (Math.abs(expectedPixels[pixel] - actualPixels[pixel]) > 38
        || Math.abs(expectedPixels[pixel + 1] - actualPixels[pixel + 1]) > 38
        || Math.abs(expectedPixels[pixel + 2] - actualPixels[pixel + 2]) > 38)
        different++
    }
    const width = right.width
    const height = right.height
    left.close()
    right.close()
    return { width, height, mismatchRatio: different / (width * height) }
  }, { expected: baseline.toString('base64'), actual: actual.toString('base64'), viewport: metadata.viewport })
  expect(comparison.reason, `screenshot dimensions must match CSS viewport ${metadata.viewport.width}x${metadata.viewport.height} at device scale`)
    .toBeUndefined()
  expect(comparison.mismatchRatio, `pixel difference from ${metadata.commit} baseline must be <= 6% at channel threshold 0.15; got ${(comparison.mismatchRatio * 100).toFixed(2)}%`)
    .toBeLessThanOrEqual(0.06)
}

async function expectLegacyGeometry(locator, expected, label) {
  await expect(locator, `${label} must exist in the real Yin theme`).toBeVisible()
  const box = await locator.boundingBox()
  expect(box, `${label} must have a measurable rectangle`).not.toBeNull()
  expect(Math.abs(box.x - expected.x), `${label} x offset`).toBeLessThanOrEqual(8)
  expect(Math.abs(box.y - expected.y), `${label} y offset`).toBeLessThanOrEqual(8)
  expect(Math.abs(box.width - expected.width) / expected.width, `${label} width`).toBeLessThanOrEqual(0.05)
  expect(Math.abs(box.height - expected.height) / expected.height, `${label} height actual=${box.height} expected=${expected.height}`).toBeLessThanOrEqual(0.05)
}

async function expectHitTestTarget(locator, label) {
  const result = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
    return { target: element.dataset.testid, hit: hit?.closest('[data-testid]')?.getAttribute('data-testid') || hit?.tagName }
  })
  expect(result.hit, `${label} center must hit its own control, got ${result.hit}`).toBe(result.target)
}

async function data(response) {
  const body = await response.json()
  expect(body.code, body.msg).toBe(0)
  return body.data
}

function installMonitorFixture(page) {
  return page.route('**/api/system/monitor/**', async route => {
      const path = new URL(route.request().url()).pathname
      const value = path.endsWith('/getEnableStatus')
      ? { enabled: true, refresh_interval: 30 }
      : path.endsWith('/getSnapshot')
      ? { CPU_INFO: { coreCount: 4, cpuNum: 8, model: 'P0 E2E CPU', usages: [20] }, MEMORY_INFO: { total: 100, used: 50, free: 50, usedPercent: 50 }, NETWORK_INFO: [] }
        : path.endsWith('/getDiskMountpoints') ? [] : { total: 100, used: 20, free: 80, usedPercent: 20 }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: value }) })
  })
}

function installIconifyFixture(page) {
  return page.route('https://api.iconify.design/mdi/home.svg', route => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 10l9-7 9 7v11h-6v-7H9v7H3z"/></svg>',
  }))
}

async function runYinMutationWorkflow({ isolated, page, playwright }, layout) {
  if (!isolated) throw new Error('Yin mutation acceptance requires an isolated Core service')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const user = await login(request, { mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com', password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com' })
  const headers = authHeaders(user)
  const spaceName = `Yin ${layout} mutations ${Date.now()}`
  await createSharedSpace(request, headers, spaceName)
  const spaces = await getSpaces(request, headers)
  const yin = spaces.find(space => space.name === spaceName && space.side === 'yin')
  const yang = spaces.find(space => String(space.id) === String(yin?.pairedSpaceId)) || (yin?.pairedSpaceId ? { id: yin.pairedSpaceId } : undefined)
  expect(yin, 'the Yin mutation fixture must have a Yin Space').toBeTruthy()
  expect(yang, 'the Yin mutation fixture must have a paired Yang Space').toBeTruthy()
  const yinGroups = await getGroups(request, yin.id, headers)
  const yangGroups = await getGroups(request, yang.id, headers)
  expect(yinGroups.length, 'the Yin mutation fixture must have a group').toBeGreaterThan(0)
  expect(yangGroups.length, 'the Yang mutation fixture must have a group').toBeGreaterThan(0)
  const group = yinGroups[0]
  const createdItemIds = []
  const createdGroupIds = []
  let createdFromTheme
  let yangItem

  try {
    const sortA = await createItem(request, yin.id, headers, { title: 'P3 Sort A', url: 'https://example.test/sort-a', lanUrl: '', description: '', openMethod: 3, itemIconGroupId: group.id, icon: { itemType: 1, text: 'A' } })
    const sortB = await createItem(request, yin.id, headers, { title: 'P3 Sort B', url: 'https://example.test/sort-b', lanUrl: '', description: '', openMethod: 3, itemIconGroupId: group.id, icon: { itemType: 1, text: 'B' } })
    createdItemIds.push(sortA.id, sortB.id)
    yangItem = await createItem(request, yang.id, headers, { title: `P3 Yang ${layout}`, url: 'https://example.test/yang', lanUrl: '', description: '', openMethod: 3, itemIconGroupId: yangGroups[0].id, icon: { itemType: 1, text: 'Y' } })
    await data(await request.post('/api/theme/v2/preference', { headers, data: { packageId: 'org.yin.default', mode: 'light' } }))
    await data(await request.post('/api/panel/userConfig/setConfig', {
      headers,
      data: { panel: { homeLayout: layout, systemMonitorShow: false, searchBoxShow: true, searchBoxSearchIcon: true } },
    }))

    await page.addInitScript(({ token, userInfo }) => {
      sessionStorage.removeItem('yin-theme-safe-mode')
      localStorage.setItem('authStorage', JSON.stringify({ data: { token, userInfo }, expire: null }))
    }, { token: user.token, userInfo: { id: user.userId || user.id, name: user.name, mail: 'admin@yiniot.com' } })
    await page.route('**/sw.js', route => route.abort())
    await page.goto(`${isolated.url}/`, { waitUntil: 'domcontentloaded' })
    const frame = page.locator('[data-testid="theme-home-frame"]')
    await expect(frame).toBeVisible()
    await expect(page.getByTestId('theme-safe-mode-banner')).toHaveCount(0)
    const themed = page.frameLocator('[data-testid="theme-home-frame"]')
    await expect(themed.locator('form'), 'Yin must use the supported sandbox-safe submission controls').toHaveCount(0)
    await page.getByRole('button', { name: /My space/ }).first().click()
    await page.getByText(spaceName, { exact: true }).last().click()
    await expect(themed.getByRole('button', { name: 'Switch to Yang-Panel' })).toBeVisible()
    await expect(themed.getByRole('button', { name: 'Open P3 Sort A' })).toBeVisible()
    await expect(themed.getByRole('button', { name: 'Open P3 Sort B' })).toBeVisible()

    const selectDirectoryGroup = async (title) => {
      if (layout !== 'directory') return
      const navigation = themed.getByRole('navigation', { name: 'Bookmark groups' })
      await navigation.getByRole('button', { name: title, exact: true }).click()
    }
    await selectDirectoryGroup(group.title)

    const search = themed.getByRole('searchbox', { name: 'Search bookmarks' })
    await search.fill('P3 Sort B')
    await expect(themed.getByRole('button', { name: 'Open P3 Sort B' })).toBeVisible()
    await expect(themed.getByRole('button', { name: 'Open P3 Sort A' })).toHaveCount(0)
    await search.fill('')

    const addGroup = themed.getByTestId('theme-add-group')
    await expectHitTestTarget(addGroup, 'Add group')
    await addGroup.click()
    const groupDialog = themed.getByTestId('theme-group-dialog')
    await expect(groupDialog).toBeVisible()
    const createdGroupTitle = `P3 Created ${layout}`
    await groupDialog.getByTestId('theme-group-title-input').fill(createdGroupTitle)
    await groupDialog.getByTestId('theme-group-submit').click()
    if (layout === 'directory')
      await expect(themed.getByRole('navigation', { name: 'Bookmark groups' }).getByRole('button', { name: createdGroupTitle, exact: true })).toBeVisible()
    else
      await expect(themed.locator('.yin-group').filter({ hasText: createdGroupTitle })).toBeVisible()
    await selectDirectoryGroup(createdGroupTitle)
    let createdGroup = themed.locator('.yin-group').filter({ hasText: createdGroupTitle })
    await expect(createdGroup).toBeVisible()
    const groupsAfterCreate = await getGroups(request, yin.id, headers)
    const createdGroupRecord = groupsAfterCreate.find(value => value.title === createdGroupTitle)
    expect(createdGroupRecord, 'Core must persist a group created from the Theme').toBeTruthy()
    createdGroupIds.push(createdGroupRecord.id)
    await selectDirectoryGroup(createdGroupTitle)
    createdGroup = themed.locator('.yin-group').filter({ hasText: createdGroupTitle })
    await createdGroup.getByTestId('theme-edit-group').click()
    await expect(groupDialog).toBeVisible()
    const editedGroupTitle = `P3 Edited ${layout}`
    await groupDialog.getByTestId('theme-group-title-input').fill(editedGroupTitle)
    await groupDialog.getByTestId('theme-group-submit').click()
    createdGroup = themed.locator('.yin-group').filter({ hasText: editedGroupTitle })
    await expect(createdGroup).toBeVisible()
    const groupsBeforeReorder = await getGroups(request, yin.id, headers)
    const beforeReorderIds = groupsBeforeReorder.map(value => value.id)
    const beforeIndex = beforeReorderIds.findIndex(value => String(value) === String(createdGroupRecord.id))
    expect(beforeIndex, 'the created group must remain among its Core siblings').toBeGreaterThan(0)
    await createdGroup.getByTestId('theme-reorder-group-up').click()
    await expect.poll(async () => (await getGroups(request, yin.id, headers)).map(value => String(value.id)).indexOf(String(createdGroupRecord.id))).toBe(beforeIndex - 1)
    await selectDirectoryGroup(group.title)
    const groupSection = themed.locator('.yin-group').filter({ hasText: group.title })
    await groupSection.getByTestId('theme-add-item').click()
    const itemModal = page.getByTestId('edit-item-modal')
    await expect(itemModal).toBeVisible()
    await itemModal.getByText(/^(Text|文本)$/).click()
    const itemTitle = `P3 Made ${layout}`
    const editorFields = itemModal.getByRole('textbox')
    await editorFields.nth(0).fill(itemTitle)
    await editorFields.nth(1).fill('P3')
    await editorFields.nth(2).fill(`https://example.test/${layout}-created`)
    await page.getByRole('dialog').last().getByRole('button', { name: /save|保存/i }).click()
    await expect(themed.getByRole('button', { name: `Open ${itemTitle}` })).toBeVisible()
    const createdItemRecord = (await getItems(request, yin.id, headers, group.id)).find(value => value.title === itemTitle)
    expect(createdItemRecord, 'Core must persist an Item created from the Yin Theme').toBeTruthy()
    createdFromTheme = createdItemRecord.id
    createdItemIds.push(createdFromTheme)

    const itemToEdit = themed.getByRole('button', { name: 'Open P3 Sort A' })
    await itemToEdit.click({ button: 'right' })
    await themed.getByTestId('theme-edit-item').click()
    await expect(itemModal).toBeVisible()
    const editedItemTitle = `P3 Edit ${layout}`
    await itemModal.getByRole('textbox').nth(0).fill(editedItemTitle)
    await page.getByRole('dialog').last().getByRole('button', { name: /save|保存/i }).click()
    await expect(themed.getByRole('button', { name: `Open ${editedItemTitle}` })).toBeVisible()
    const editedRecord = (await getItems(request, yin.id, headers, group.id)).find(value => String(value.id) === String(sortA.id))
    expect(editedRecord?.title).toBe(editedItemTitle)

    const orderedBefore = await getItems(request, yin.id, headers, group.id)
    const firstSorted = orderedBefore[0]
    const expectedNext = orderedBefore[1]
    await themed.getByRole('button', { name: `Open ${firstSorted.title}` }).click({ button: 'right' })
    await themed.getByTestId('theme-reorder-item-down').click()
    await expect.poll(async () => (await getItems(request, yin.id, headers, group.id)).map(value => String(value.id)).slice(0, 2).join(','))
      .toBe(`${expectedNext.id},${firstSorted.id}`)

    const itemToDelete = themed.getByRole('button', { name: `Open ${editedItemTitle}` })
    await itemToDelete.click({ button: 'right' })
    await themed.getByTestId('theme-delete-item').click()
    const cancelDialog = page.locator('.n-dialog').filter({ has: page.getByRole('button', { name: /cancel|取消/i }) })
    await expect(cancelDialog).toBeVisible()
    await cancelDialog.getByRole('button', { name: /cancel|取消/i }).click()
    await expect(cancelDialog).toHaveCount(0)
    expect((await getItems(request, yin.id, headers, group.id)).some(value => String(value.id) === String(sortA.id))).toBe(true)

    await themed.getByRole('button', { name: `Open ${editedItemTitle}` }).click({ button: 'right' })
    await themed.getByTestId('theme-delete-item').click()
    const confirmDialog = page.locator('.n-dialog').filter({ has: page.getByRole('button', { name: /confirm|确定/i }) })
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole('button', { name: /confirm|确定/i }).click()
    await expect(themed.getByRole('button', { name: `Open ${editedItemTitle}` })).toHaveCount(0)
    expect((await getItems(request, yin.id, headers, group.id)).some(value => String(value.id) === String(sortA.id))).toBe(false)
    createdItemIds.splice(createdItemIds.indexOf(sortA.id), 1)

    await themed.getByRole('button', { name: 'Switch to Yang-Panel' }).click()
    await expect(themed.getByRole('button', { name: 'Open P3 Yang ' + layout })).toBeVisible()
    await themed.getByRole('button', { name: 'Switch to Yin-Panel' }).click()
    await selectDirectoryGroup(group.title)
    await expect(themed.getByRole('button', { name: 'Open P3 Sort B' })).toBeVisible()
    await expect(page.locator('.sun-main[data-panel-side]')).toHaveAttribute('data-panel-side', 'yin')
  }
  finally {
    for (const itemId of createdItemIds) await request.delete(`/api/spaces/${yin.id}/items/${itemId}`, { headers }).catch(() => {})
    if (yangItem) await request.delete(`/api/spaces/${yang.id}/items/${yangItem.id}`, { headers }).catch(() => {})
    for (const groupId of createdGroupIds) await request.delete(`/api/spaces/${yin.id}/groups/${groupId}`, { headers }).catch(() => {})
    await request.delete(`/api/spaces/${yin.id}`, { headers }).catch(() => {})
    await request.dispose()
  }
}

async function assertNoMonitorItemOverlap(page, themed) {
  const monitor = page.locator('[data-testid="theme-runtime-monitor"]')
  await expect(monitor).toBeVisible()
  const monitorBox = await monitor.boundingBox()
  expect(monitorBox?.width).toBeGreaterThan(0)
  expect(monitorBox?.height).toBeGreaterThan(0)

  const items = themed.locator('.yin-item')
  const itemCount = await items.count()
  expect(itemCount, 'the sandbox must render real Item buttons').toBeGreaterThan(0)
  for (let index = 0; index < itemCount; index++) {
    const item = items.nth(index)
    await expect(item).toBeVisible()
    const itemBox = await item.boundingBox()
    expect(itemBox?.width).toBeGreaterThan(0)
    expect(itemBox?.height).toBeGreaterThan(0)
    const intersects = itemBox.x < monitorBox.x + monitorBox.width
      && itemBox.x + itemBox.width > monitorBox.x
      && itemBox.y < monitorBox.y + monitorBox.height
      && itemBox.y + itemBox.height > monitorBox.y
    expect.soft(intersects, `monitor overlaps Item ${index + 1}`).toBe(false)
  }
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

    await page.addInitScript(({ token, userInfo }) => {
      sessionStorage.removeItem('yin-theme-safe-mode')
      localStorage.setItem('authStorage', JSON.stringify({ data: { token, userInfo }, expire: null }))
      localStorage.setItem('panelStorage', JSON.stringify({ data: { panelConfig: {
        homeLayout: 'directory', backgroundImageSrc: '/assets/bg-forest.webp', wallpaperMode: 'custom', wallpaperKind: 'image',
        wallpaperSource: '/assets/bg-forest.webp', wallpaperPoster: '/assets/bg-forest.webp', backgroundBlur: 0, backgroundMaskNumber: 0,
        iconStyle: 1, iconTextColor: '#ffffff', useThemeDefaults: false, iconTextInfoHideDescription: false, iconTextIconHideTitle: false,
        logoText: 'Yin-Panel', logoImageSrc: '', clockShowSecond: true, searchBoxShow: false, searchBoxSearchIcon: true,
        marginBottom: 5, marginTop: 5, maxWidth: 1200, maxWidthUnit: 'px', marginX: 5, footerHtml: '',
        systemMonitorShow: true, systemMonitorShowTitle: true, netModeChangeButtonShow: true,
      } }, expire: null }))
    }, { token: user.token, userInfo: { id: user.userId || user.id, name: user.name, mail: 'admin@yiniot.com' } })
    await installMonitorFixture(page)
    await installIconifyFixture(page)
    const runtimeErrors = []
    page.on('pageerror', error => runtimeErrors.push(String(error)))
    page.on('console', message => {
      if (message.type() === 'error') runtimeErrors.push(message.text())
    })
    await page.goto(`${isolated.url}/`, { waitUntil: 'domcontentloaded' })
    const frame = page.locator('[data-testid="theme-home-frame"]')
    await expect(frame).toBeVisible()
    await expect(page.locator('[data-testid="theme-safe-mode-banner"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="theme-runtime-fallback"]')).toHaveCount(0)
    expect(await page.evaluate(() => sessionStorage.getItem('yin-theme-safe-mode'))).toBeNull()
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
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return target?.closest('.yin-item') === element
    })
    expect(hit).toBe(true)
    await assertNoMonitorItemOverlap(page, themed)
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

test('standard default Yin theme restores legacy presentation features inside the granted sandbox iframe', async ({ isolated, playwright, page }) => {
  if (!isolated) throw new Error('Default Yin parity requires YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const user = await login(request, { mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com', password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com' })
  const headers = authHeaders(user)
  const yin = await createSpace(request, headers)
  expect(yin, 'the deterministic fixture must have a Yin space').toBeTruthy()
  const groups = await getGroups(request, yin.id, headers)
  const group = groups.find(value => value.title === 'APP') || groups[0]
  expect(group, 'the Yin space must have its default group').toBeTruthy()
  const itemSpecs = [
    { title: 'P0 Text Icon', icon: { itemType: 1, text: 'TX', backgroundColor: '#184f6b' } },
    { title: 'P0 Image Icon', icon: { itemType: 2, src: `data:image/png;base64,${png.toString('base64')}`, backgroundColor: '#5d381e' } },
    { title: 'P0 Vector Icon', icon: { itemType: 3, text: 'mdi:home', backgroundColor: '#285d3c' } },
  ]
  const createdItems = []
  try {
    for (const spec of itemSpecs) {
      createdItems.push(await createItem(request, yin.id, headers, {
        title: spec.title, url: `https://example.test/${encodeURIComponent(spec.title)}`, lanUrl: '', description: `${spec.title} description`,
        openMethod: 3, itemIconGroupId: group.id, icon: spec.icon,
      }))
    }
    await data(await request.post('/api/theme/v2/preference', { headers, data: { packageId: 'org.yin.default', mode: 'light' } }))
    await data(await request.post('/api/panel/userConfig/setConfig', {
      headers,
      data: { panel: {
        homeLayout: 'standard', iconStyle: 1, clockShowSecond: true, searchBoxShow: true,
        iconTextInfoHideDescription: false, iconTextIconHideTitle: false,
        systemMonitorShow: true, systemMonitorShowTitle: true,
        footerHtml: '<span>P0 footer fixture</span>',
        wallpaperMode: 'custom', wallpaperKind: 'image',
        wallpaperSource: '/assets/bg-forest.webp', wallpaperPoster: '/assets/bg-forest.webp',
        backgroundMaskNumber: 0, maxWidth: 1200, maxWidthUnit: 'px', marginTop: 5, marginBottom: 5,
      } },
    }))
    const savedConfig = await data(await request.get('/api/panel/userConfig/getConfig', { headers }))
    expect(savedConfig.panel.footerHtml).toContain('P0 footer fixture')

    await page.addInitScript(({ token, userInfo }) => {
      sessionStorage.removeItem('yin-theme-safe-mode')
      localStorage.setItem('authStorage', JSON.stringify({ data: { token, userInfo }, expire: null }))
    }, { token: user.token, userInfo: { id: user.userId || user.id, name: user.name, mail: 'admin@yiniot.com' } })
    await page.addInitScript(() => {
      const fixedNow = Date.parse('2026-01-01T12:00:00.000Z')
      const NativeDate = Date
      class FrozenDate extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [fixedNow])) }
        static now() { return fixedNow }
      }
      Object.setPrototypeOf(FrozenDate, NativeDate)
      window.Date = FrozenDate
      const NativeDateTimeFormat = Intl.DateTimeFormat
      const FixedDateTimeFormat = function (locales, options = {}) {
        return new NativeDateTimeFormat(locales, { ...options, timeZone: options.timeZone || 'UTC' })
      }
      FixedDateTimeFormat.prototype = NativeDateTimeFormat.prototype
      Object.setPrototypeOf(FixedDateTimeFormat, NativeDateTimeFormat)
      Intl.DateTimeFormat = FixedDateTimeFormat
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await installMonitorFixture(page)
    await installIconifyFixture(page)
    const monitorRequests = []
    page.on('request', request => {
      if (request.url().includes('/system/monitor/getEnableStatus')) monitorRequests.push(request.url())
    })
    await page.goto(`${isolated.url}/`, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('[data-testid="theme-home-frame"]')).toBeVisible()
    await expect(page.locator('[data-testid="theme-safe-mode-banner"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="theme-runtime-fallback"]')).toHaveCount(0)
    expect(await page.evaluate(() => sessionStorage.getItem('yin-theme-safe-mode'))).toBeNull()
    const themed = page.frameLocator('[data-testid="theme-home-frame"]')
    await expect(page.getByRole('button', { name: /My space/ }).first()).toBeVisible()
    for (const spec of itemSpecs)
      await expect(themed.getByRole('button', { name: `Open ${spec.title}` })).toBeVisible()
    await expect(themed.locator('.yin-logo')).toBeVisible()
    const clock = themed.locator('[data-testid="theme-home-clock"]')
    expect.soft(await clock.count(), 'the legacy clock with seconds must be rendered in the theme content').toBeGreaterThan(0)
    if (await clock.count())
      expect.soft(await clock.first().textContent()).toMatch(/^\d{2}:\d{2}:\d{2}/)
    const search = themed.locator('input[type="search"]')
    expect.soft(await search.count(), 'the configured legacy search control must be present in the theme').toBeGreaterThan(0)
    if (await search.count()) {
      await expect.soft(search).toBeVisible()
      await search.fill('P0 Vector Icon')
      await expect.soft(themed.getByRole('button', { name: 'Open P0 Vector Icon' })).toBeVisible()
      await expect.soft(themed.getByRole('button', { name: 'Open P0 Text Icon' })).toHaveCount(0)
      await search.fill('')
      await expect.soft(themed.getByRole('button', { name: 'Open P0 Text Icon' })).toBeVisible()
    }
    await expect.soft(themed.locator('.yin-footer')).toContainText('P0 footer fixture')
    await expect.soft(page.getByTestId('floating-top-button')).toBeVisible()
    await expect.soft(page.getByTestId('floating-refresh-button')).toBeVisible()

    const textIcon = themed.getByRole('button', { name: 'Open P0 Text Icon' }).locator('.yin-item-icon')
    await expect.soft(textIcon).toContainText('TX')
    const imageIcon = themed.getByRole('button', { name: 'Open P0 Image Icon' }).locator('.yin-item-icon img')
    expect.soft(await imageIcon.count(), 'the image icon must be rendered as an image').toBeGreaterThan(0)
    if (await imageIcon.count()) expect.soft(await imageIcon.evaluate(image => image.naturalWidth)).toBeGreaterThan(0)
    const vectorIcon = themed.getByRole('button', { name: 'Open P0 Vector Icon' }).locator('.yin-item-icon')
    expect.soft(await vectorIcon.locator('svg, img').count(), 'Iconify must render as a graphic').toBeGreaterThan(0)
    await expect.soft(vectorIcon).not.toContainText('mdi:home')

    const groupSection = themed.locator('.yin-group').filter({ hasText: group.title })
    expect.soft(await groupSection.count(), 'the fixture group must be rendered').toBeGreaterThan(0)
    const collapse = groupSection.locator('.yin-group-toggle')
    expect.soft(await collapse.count(), 'each group must expose a semantic collapse control').toBe(1)
    if (await collapse.count()) {
      await expect.soft(collapse).toHaveAttribute('aria-label', 'Collapse group')
      await collapse.click()
      await expect.soft(collapse).toHaveAttribute('aria-label', 'Expand group')
      await expect.soft(themed.getByRole('button', { name: 'Open P0 Text Icon' })).toHaveCount(0)
      await collapse.click()
      await expect.soft(themed.getByRole('button', { name: 'Open P0 Text Icon' })).toBeVisible()
    }
    await expect.soft(page.getByTestId('wallpaper-layer')).toBeVisible()
    const wallpaperWidth = await page.getByTestId('wallpaper-layer').locator('img').evaluate(image => image.naturalWidth)
    expect.soft(wallpaperWidth, 'the configured deterministic wallpaper must load').toBeGreaterThan(0)
    await page.mouse.move(0, 0)
    await themed.locator('body').evaluate(element => document.activeElement?.blur())
    await page.mouse.click(1200, 500)
    await expect.poll(() => themed.locator('body').evaluate(() => document.activeElement === document.body)).toBe(true)
    await page.evaluate(() => document.fonts.ready)
    await expect(themed.locator('.yin-group-toggle')).toHaveAttribute('aria-label', 'Collapse group')
    if (await search.count()) await search.fill('')
    const baselineMetadata = JSON.parse(await readFile(path.join(testDirectory, 'fixtures', 'yin-theme-baseline-6c69d84-light-1440x900.json'), 'utf8'))
    await expectLegacyGeometry(page.locator('.space-status-bar'), baselineMetadata.geometry['.space-status-bar'], 'space selector')
    await expectLegacyGeometry(themed.locator('.yin-clock'), baselineMetadata.geometry['.clock'], 'clock')
    await expectLegacyGeometry(themed.locator('.yin-search'), baselineMetadata.geometry['.search-box'], 'search')
    await expectLegacyGeometry(page.getByTestId('theme-runtime-monitor'), baselineMetadata.geometry['.system-monitor-layer'], 'system monitor')
    await expectLegacyGeometry(themed.locator('.yin-group').first(), baselineMetadata.geometry['[data-item-group]'], 'first group')
    await expectLegacyGeometry(themed.locator('.yin-item').first(), baselineMetadata.geometry['.app-icon-small'], 'first Item')
    await expectLegacyGeometry(themed.locator('.yin-footer'), baselineMetadata.geometry['.footer'], 'footer')
    if (test.info().project.name === 'chromium-desktop')
      await compareLegacyBaseline(page, test.info(), 'light', 1440, 900)
    const iframeBackgrounds = await themed.locator('html, body, #theme-root, .builtin-home').evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundColor))
    const opaqueBackgrounds = iframeBackgrounds.filter(color => {
      const channels = color.match(/rgba?\(([^)]+)\)/)?.[1]?.split(',').map(value => value.trim()) || []
      return channels.length < 4 || Number(channels[3]) !== 0
    })
    expect.soft(opaqueBackgrounds, 'the theme layers must be transparent over the configured wallpaper').toEqual([])
    await assertNoMonitorItemOverlap(page, themed)

    for (const scenario of [
      { mode: 'dark', width: 1440, height: 900 },
      { mode: 'light', width: 390, height: 844 },
      { mode: 'dark', width: 390, height: 844 },
    ]) {
      await data(await request.post('/api/theme/v2/preference', { headers, data: { packageId: 'org.yin.default', mode: scenario.mode } }))
      await page.setViewportSize({ width: scenario.width, height: scenario.height })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.locator('[data-testid="theme-home-frame"]')).toBeVisible()
      const modeHome = page.frameLocator('[data-testid="theme-home-frame"]')
      await expect(modeHome.getByRole('button', { name: 'Open P0 Text Icon' })).toBeVisible()
      if (scenario.width === 390)
        expect(monitorRequests.length, `monitor enable status must be queried before ${scenario.mode} mobile baseline`).toBeGreaterThan(0)
    await expect(modeHome.locator('.yin-footer')).toContainText('P0 footer fixture')
    await expect(page.getByTestId('wallpaper-layer')).toBeVisible()
    await expect(page.getByTestId('theme-safe-mode-banner')).toHaveCount(0)
    if (scenario.width === 390) {
      const selector = page.locator('.space-status-bar')
      await expect(selector).toHaveCSS('bottom', '8px')
      const mobileMetadata = JSON.parse(await readFile(path.join(testDirectory, 'fixtures', `yin-theme-baseline-6c69d84-${scenario.mode}-390x844.json`), 'utf8'))
        await expectLegacyGeometry(modeHome.locator('.yin-clock'), mobileMetadata.geometry['.clock'], 'mobile clock')
        await expectLegacyGeometry(modeHome.locator('.yin-search'), mobileMetadata.geometry['.search-box'], 'mobile search')
        await expectLegacyGeometry(page.getByTestId('theme-runtime-monitor'), mobileMetadata.geometry['.system-monitor-layer'], 'mobile system monitor')
        await expectLegacyGeometry(modeHome.locator('.yin-group').first(), mobileMetadata.geometry['[data-item-group]'], 'mobile first group')
        await expectLegacyGeometry(modeHome.locator('.yin-item').first(), mobileMetadata.geometry['.app-icon-small'], 'mobile first Item')
        await expectLegacyGeometry(modeHome.locator('.yin-footer'), mobileMetadata.geometry['.footer'], 'mobile footer')
      }
      await page.mouse.move(0, 0)
      await modeHome.locator('body').evaluate(element => document.activeElement?.blur())
      if (test.info().project.name === 'chromium-desktop')
        await compareLegacyBaseline(page, test.info(), scenario.mode, scenario.width, scenario.height)
    }

    await data(await request.post('/api/theme/v2/preference', { headers, data: { packageId: 'org.yin.default', mode: 'light' } }))
    await data(await request.post('/api/panel/userConfig/setConfig', {
      headers,
      data: { panel: { iconStyle: 0, iconTextInfoHideDescription: false, iconTextIconHideTitle: false } },
    }))
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    const infoHome = page.frameLocator('[data-testid="theme-home-frame"]')
    const infoItem = infoHome.getByRole('button', { name: 'Open P0 Text Icon' })
    await expect(infoItem).toHaveClass(/yin-item--info/)
    await expect(infoItem.locator('.yin-item-description')).toBeVisible()
    await expect(infoItem.locator('.yin-item-title')).toBeVisible()
    await data(await request.post('/api/panel/userConfig/setConfig', {
      headers,
      data: { panel: { iconTextInfoHideDescription: true, iconTextIconHideTitle: true } },
    }))
    await page.reload({ waitUntil: 'domcontentloaded' })
    const hiddenInfoItem = page.frameLocator('[data-testid="theme-home-frame"]').getByRole('button', { name: 'Open P0 Text Icon' })
    await expect(hiddenInfoItem.locator('.yin-item-description')).toBeHidden()
    await expect(hiddenInfoItem.locator('.yin-item-title')).toBeHidden()
    await data(await request.post('/api/panel/userConfig/setConfig', {
      headers,
      data: { panel: { iconStyle: 1, iconTextIconHideTitle: true, wallpaperMode: 'none', footerHtml: '' } },
    }))
    await page.reload({ waitUntil: 'domcontentloaded' })
    const noTitleHome = page.frameLocator('[data-testid="theme-home-frame"]')
    await expect(noTitleHome.getByRole('button', { name: 'Open P0 Text Icon' }).locator('.yin-item-title')).toBeHidden()
    await expect(noTitleHome.locator('.yin-footer')).toBeHidden()
    await expect(noTitleHome.locator('.yin-footer')).toBeEmpty()
    await expect(page.getByTestId('wallpaper-layer')).toHaveCount(0)
  }
  finally {
    for (const item of createdItems) await request.delete(`/api/spaces/${yin.id}/items/${item.id}`, { headers }).catch(() => {})
    await request.dispose()
  }
})

test('default Yin standard layout runs the granted item and group mutation workflow', async ({ isolated, page, playwright }) => {
  await runYinMutationWorkflow({ isolated, page, playwright }, 'standard')
})

test('default Yin directory layout runs the granted item and group mutation workflow', async ({ isolated, page, playwright }) => {
  await runYinMutationWorkflow({ isolated, page, playwright }, 'directory')
})

test('default Yin mobile home exposes loading, empty, error, offline, keyboard focus, and reduced-motion states', async ({ isolated, page, playwright }) => {
  if (!isolated) throw new Error('Yin state acceptance requires an isolated Core service')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const user = await login(request, { mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com', password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com' })
  const headers = authHeaders(user)
  const spaceName = `Yin mobile states ${Date.now()}`
  await createSharedSpace(request, headers, spaceName)
  const space = (await getSpaces(request, headers)).find(value => value.name === spaceName && value.side === 'yin')
  expect(space).toBeTruthy()
  const groups = await getGroups(request, space.id, headers)
  expect(groups.length).toBeGreaterThan(0)
  let gateGroups = true
  let releaseGroups
  let groupRequestSeen
  let signalGroupRequest
  let failGroups = false
  let phase = 'loading'
  let offlineMode = false
  try {
    await data(await request.post('/api/theme/v2/preference', { headers, data: { packageId: 'org.yin.default', mode: 'light' } }))
    await data(await request.post('/api/panel/userConfig/setConfig', { headers, data: { panel: { homeLayout: 'standard', systemMonitorShow: false, searchBoxShow: true } } }))
    await page.addInitScript(({ token, userInfo }) => {
      sessionStorage.removeItem('yin-theme-safe-mode')
      localStorage.setItem('authStorage', JSON.stringify({ data: { token, userInfo }, expire: null }))
    }, { token: user.token, userInfo: { id: user.userId || user.id, name: user.name, mail: 'admin@yiniot.com' } })
    await page.route('**/api/**', async route => {
      const pathname = new URL(route.request().url()).pathname
      if (pathname === '/api/spaces') {
        if (offlineMode) return route.abort('failed')
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 0, data: [space] }) })
      }
      if (pathname !== `/api/spaces/${space.id}/groups`) return route.continue()
      if (offlineMode) return route.continue()
      if (gateGroups) {
        signalGroupRequest()
        await new Promise(resolve => { releaseGroups = resolve })
        gateGroups = false
        const result = phase === 'error'
          ? { status: 503, body: { code: 1, msg: 'Could not load bookmark groups', data: null } }
          : { status: 200, body: { code: 0, data: phase === 'empty' ? [] : groups } }
        return route.fulfill({ status: result.status, contentType: 'application/json', body: JSON.stringify(result.body) })
      }
      if (failGroups && phase === 'error') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 1, msg: 'Could not load bookmark groups', data: null }) })
      return route.continue()
    })
    await page.route('**/sw.js', route => route.abort())

    gateGroups = true
    groupRequestSeen = new Promise(resolve => { signalGroupRequest = resolve })
    await page.goto(`${isolated.url}/`, { waitUntil: 'domcontentloaded' })
    const frame = page.locator('[data-testid="theme-home-frame"]')
    await expect(frame).toBeVisible()
    const themed = page.frameLocator('[data-testid="theme-home-frame"]')
    const addGroup = themed.getByTestId('theme-add-group')
    await expectHitTestTarget(addGroup, 'Add group mobile keyboard control')
    await addGroup.focus()
    await expect(addGroup).toBeFocused()
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false)

    await groupRequestSeen
    await expect(themed.locator('.yin-collection')).toHaveAttribute('aria-busy', 'true')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect.poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await expect.poll(() => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(false)
    releaseGroups()
    await expect(themed.getByText('No items in this space')).toBeVisible()

    offlineMode = true
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    await expect(page.getByTestId('offline-readonly')).toBeVisible()
    await expect(themed.getByText('No items in this space')).toBeVisible()
    offlineMode = false
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    phase = 'error'
    failGroups = true
    gateGroups = true
    groupRequestSeen = new Promise(resolve => { signalGroupRequest = resolve })
    await page.evaluate(spaceId => localStorage.removeItem(`yin-panel-space-cache:1:${spaceId}`), space.id)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await groupRequestSeen
    releaseGroups()
    const erroredTheme = page.frameLocator('[data-testid="theme-home-frame"]')
    await expect(erroredTheme.getByText('Could not load bookmark groups')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('offline-unavailable')).toHaveCount(0)
  }
  finally {
    await request.dispose()
  }
})
