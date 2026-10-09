import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from './isolated-fixture.mjs'
import { authHeaders, createItem, createSharedSpace, createSpace, getGroups, getItems, getSpaces, login, png, seedBrowserSession, themeHomeRoot } from './helpers.mjs'

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
    // The Core's CSP restricts connect-src/img-src to 'self', so a data: URL
    // cannot be fetched from the page. Decode the base64 directly instead.
    const decode = async source => {
      const binary = atob(source)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
      return createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    }
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

async function expectLegacyGeometry(locator, expected, label, options = {}) {
  await expect(locator, `${label} must exist in the real Yin theme`).toBeVisible()
  const box = await locator.boundingBox()
  expect(box, `${label} must have a measurable rectangle`).not.toBeNull()
  if (!options.skipX)
    expect(Math.abs(box.x - expected.x), `${label} x offset`).toBeLessThanOrEqual(8)
  if (!options.skipY) {
    const expectedY = expected.y + (options.offsetY || 0)
    expect(Math.abs(box.y - expectedY), `${label} y offset`).toBeLessThanOrEqual(8)
  }
  // The clock's width is derived from its rendered date string, which the theme
  // intentionally localizes (long weekday and month), so the legacy width is no
  // longer an invariant; the height and the centering checks still are.
  if (!options.skipWidth)
    expect(Math.abs(box.width - expected.width) / expected.width, `${label} width`).toBeLessThanOrEqual(0.05)
  expect(Math.abs(box.height - expected.height) / expected.height, `${label} height actual=${box.height} expected=${expected.height}`).toBeLessThanOrEqual(0.05)
}

/**
 * The masthead is a centred flex box holding `logo | clock`, so the clock's
 * absolute x is a *derived* value: it moves with the rendered width of the
 * logo text, which differs per font stack and per rendering engine. Comparing
 * it to a legacy absolute x therefore measures the font, not the layout.
 * Assert the engine-independent invariant instead — the identity block is
 * centred in the masthead and the clock stays clear of the logo.
 */
async function expectIdentityBlockCentered(themed, label) {
  const [masthead, identity, clock, logo] = await Promise.all([
    themed.locator('.yin-masthead').boundingBox(),
    themed.locator('.yin-identity').boundingBox(),
    themed.locator('.yin-clock').boundingBox(),
    themed.locator('.yin-logo').boundingBox(),
  ])
  for (const [name, box] of Object.entries({ masthead, identity, clock, logo }))
    expect(box, `${label} ${name} must have a measurable rectangle`).not.toBeNull()
  const mastheadCenter = masthead.x + masthead.width / 2
  const identityCenter = identity.x + identity.width / 2
  expect(Math.abs(identityCenter - mastheadCenter), `${label} identity block must stay horizontally centred in the masthead`).toBeLessThanOrEqual(1)
  expect(clock.x, `${label} clock must sit to the right of the logo without overlapping it`).toBeGreaterThanOrEqual(logo.x + logo.width - 1)
  expect(clock.x + clock.width, `${label} clock must stay inside the masthead`).toBeLessThanOrEqual(masthead.x + masthead.width + 1)
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

    await seedBrowserSession(page, request, user)
    await page.route('**/sw.js', route => route.abort())
    await page.goto(`${isolated.url}/`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('theme-trusted-host')).toBeVisible()
    await expect(page.getByTestId('theme-safe-mode-banner')).toHaveCount(0)
    const themed = themeHomeRoot(page)
    await expect(themed.locator('form'), 'Yin must keep its submission controls in script, not native forms').toHaveCount(0)
    await page.getByRole('button', { name: /My space/ }).first().click()
    await page.getByText(spaceName, { exact: true }).last().click()
    await expect(themed.getByRole('button', { name: 'Switch to Yang-Panel' })).toBeVisible()
    await expect(themed.getByRole('link', { name: 'Open P3 Sort A' })).toBeVisible()
    await expect(themed.getByRole('link', { name: 'Open P3 Sort B' })).toBeVisible()

    const selectDirectoryGroup = async (title) => {
      if (layout !== 'directory') return
      const navigation = themed.getByRole('navigation', { name: 'Bookmark groups' })
      await navigation.getByRole('button', { name: title, exact: true }).click()
    }
    await selectDirectoryGroup(group.title)

    const search = themed.getByRole('textbox', { name: 'Search bookmarks' })
    await search.fill('P3 Sort B')
    await expect(themed.getByRole('link', { name: 'Open P3 Sort B' })).toBeVisible()
    await expect(themed.getByRole('link', { name: 'Open P3 Sort A' })).toHaveCount(0)
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
    await expect(themed.getByRole('link', { name: `Open ${itemTitle}` })).toBeVisible()
    const createdItemRecord = (await getItems(request, yin.id, headers, group.id)).find(value => value.title === itemTitle)
    expect(createdItemRecord, 'Core must persist an Item created from the Yin Theme').toBeTruthy()
    createdFromTheme = createdItemRecord.id
    createdItemIds.push(createdFromTheme)

    const itemToEdit = themed.getByRole('link', { name: 'Open P3 Sort A' })
    await itemToEdit.click({ button: 'right' })
    await themed.getByTestId('theme-edit-item').click()
    await expect(itemModal).toBeVisible()
    const editedItemTitle = `P3 Edit ${layout}`
    await itemModal.getByRole('textbox').nth(0).fill(editedItemTitle)
    await page.getByRole('dialog').last().getByRole('button', { name: /save|保存/i }).click()
    await expect(themed.getByRole('link', { name: `Open ${editedItemTitle}` })).toBeVisible()
    const editedRecord = (await getItems(request, yin.id, headers, group.id)).find(value => String(value.id) === String(sortA.id))
    expect(editedRecord?.title).toBe(editedItemTitle)

    const orderedBefore = await getItems(request, yin.id, headers, group.id)
    const firstSorted = orderedBefore[0]
    const expectedNext = orderedBefore[1]
    await themed.getByRole('link', { name: `Open ${firstSorted.title}` }).click({ button: 'right' })
    await themed.getByTestId('theme-reorder-item-down').click()
    await expect.poll(async () => (await getItems(request, yin.id, headers, group.id)).map(value => String(value.id)).slice(0, 2).join(','))
      .toBe(`${expectedNext.id},${firstSorted.id}`)

    const itemToDelete = themed.getByRole('link', { name: `Open ${editedItemTitle}` })
    await itemToDelete.click({ button: 'right' })
    await themed.getByTestId('theme-delete-item').click()
    const cancelDialog = page.locator('.n-dialog').filter({ has: page.getByRole('button', { name: /cancel|取消/i }) })
    await expect(cancelDialog).toBeVisible()
    await cancelDialog.getByRole('button', { name: /cancel|取消/i }).click()
    await expect(cancelDialog).toHaveCount(0)
    expect((await getItems(request, yin.id, headers, group.id)).some(value => String(value.id) === String(sortA.id))).toBe(true)

    await themed.getByRole('link', { name: `Open ${editedItemTitle}` }).click({ button: 'right' })
    await themed.getByTestId('theme-delete-item').click()
    const confirmDialog = page.locator('.n-dialog').filter({ has: page.getByRole('button', { name: /confirm|确定/i }) })
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.getByRole('button', { name: /confirm|确定/i }).click()
    await expect(themed.getByRole('link', { name: `Open ${editedItemTitle}` })).toHaveCount(0)
    expect((await getItems(request, yin.id, headers, group.id)).some(value => String(value.id) === String(sortA.id))).toBe(false)
    createdItemIds.splice(createdItemIds.indexOf(sortA.id), 1)

    await themed.getByRole('button', { name: 'Switch to Yang-Panel' }).click()
    await expect(themed.getByRole('link', { name: 'Open P3 Yang ' + layout })).toBeVisible()
    await themed.getByRole('button', { name: 'Switch to Yin-Panel' }).click()
    await selectDirectoryGroup(group.title)
    await expect(themed.getByRole('link', { name: 'Open P3 Sort B' })).toBeVisible()
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

// The default theme renders the Core's monitor component itself, in flow: the
// band is `.yin-monitor` inside the theme root and the Core's own overlay steps
// aside. It sits right below the search box and travels with the Core-owned page
// scroll instead of floating over it. At rest the collection is offset below the
// band, so nothing hides behind it.
async function assertMonitorScrollsWithContentWithoutOverlap(page, themed) {
  const monitor = themed.locator('.yin-monitor')
  await expect(monitor).toBeVisible()
  const shell = page.locator('.theme-runtime-shell')
  await expect(shell).toBeVisible()

  const atRest = await monitor.boundingBox()
  expect(atRest?.width, 'the monitor must be measurable').toBeGreaterThan(0)
  expect(atRest?.height, 'the monitor must be measurable').toBeGreaterThan(0)

  const items = themed.locator('.yin-item')
  const itemCount = await items.count()
  expect(itemCount, 'the theme must render real Item buttons').toBeGreaterThan(0)
  for (let index = 0; index < itemCount; index++) {
    const box = await items.nth(index).boundingBox()
    if (!box || box.width <= 0 || box.height <= 0) continue
    const intersects = box.x < atRest.x + atRest.width
      && box.x + box.width > atRest.x
      && box.y < atRest.y + atRest.height
      && box.y + box.height > atRest.y
    expect.soft(intersects, `monitor overlaps Item ${index + 1} at rest`).toBe(false)
  }

  // When the fixture is tall enough to scroll, the band must travel upward
  // together with the content rather than staying pinned to the viewport. The
  // Core owns the page scroll; the direct-mounted theme must not become a
  // second scroller that would leave the band behind.
  const scrollable = await shell.evaluate(element => element.scrollHeight > element.clientHeight + 1)
  if (scrollable) {
    for (const scrollTop of [400, 100000]) {
      await shell.evaluate((element, top) => { element.scrollTop = top }, scrollTop)
      await page.waitForTimeout(150)
      const scrolled = await monitor.boundingBox()
      expect(scrolled, 'the monitor must stay measurable after scrolling').toBeTruthy()
      expect.soft(scrolled.y, `monitor must travel upward with the content at scrollTop ${scrollTop}`)
        .toBeLessThan(atRest.y)
    }
    await shell.evaluate(element => { element.scrollTop = 0 })
  }
}

// The theme renders the Core's monitor in flow, so its legacy overlay geometry no
// longer applies. The invariant that matters is the band's position in the page:
// it must sit below the search box and above the collection, with a real size.
async function expectMonitorBetweenSearchAndItems(themed, label) {
  const monitor = themed.locator('.yin-monitor')
  const search = themed.getByTestId('theme-home-search')
  const collection = themed.locator('.yin-collection')
  await expect(monitor, `${label}: the theme must render the monitor band`).toBeVisible()
  await expect(search, `${label}: the theme must render the search box`).toBeVisible()
  await expect(collection, `${label}: the theme must render the collection`).toBeVisible()
  const [monitorBox, searchBox, collectionBox] = await Promise.all([
    monitor.boundingBox(),
    search.boundingBox(),
    collection.boundingBox(),
  ])
  for (const [name, box] of Object.entries({ monitor: monitorBox, search: searchBox, collection: collectionBox }))
    expect(box, `${label}: ${name} must have a measurable rectangle`).not.toBeNull()
  expect(monitorBox.width, `${label}: the monitor must span a real band`).toBeGreaterThan(0)
  expect(monitorBox.height, `${label}: the monitor must have a real height`).toBeGreaterThan(0)
  expect(monitorBox.y, `${label}: the monitor must start below the search box`).toBeGreaterThanOrEqual(searchBox.y + searchBox.height - 1)
  expect(monitorBox.y + monitorBox.height, `${label}: the monitor must end above the collection`).toBeLessThanOrEqual(collectionBox.y + 1)
}

// The vertical order of the home is the layout contract the theme must keep:
// search, then the in-flow monitor band, then the collection with its items, and
// finally the footer. The absolute legacy y coordinates are not usable below the
// monitor because it now occupies flow space instead of floating over it.
async function expectHomeVerticalOrder(themed, label) {
  const [search, monitor, collection, firstItem, footer] = await Promise.all([
    themed.getByTestId('theme-home-search').boundingBox(),
    themed.locator('.yin-monitor').boundingBox(),
    themed.locator('.yin-collection').boundingBox(),
    themed.locator('.yin-item').first().boundingBox(),
    themed.locator('.yin-footer').boundingBox(),
  ])
  for (const [name, box] of Object.entries({ search, monitor, collection, firstItem, footer }))
    expect(box, `${label}: ${name} must have a measurable rectangle`).not.toBeNull()
  expect(monitor.y, `${label}: the monitor must start below the search box`).toBeGreaterThanOrEqual(search.y + search.height - 1)
  expect(collection.y, `${label}: the collection must start below the monitor`).toBeGreaterThanOrEqual(monitor.y + monitor.height - 1)
  expect(firstItem.y, `${label}: the first Item must sit inside the collection`).toBeGreaterThanOrEqual(collection.y - 1)
  expect(firstItem.y + firstItem.height, `${label}: the first Item must end above the footer`).toBeLessThanOrEqual(footer.y + 1)
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

    await seedBrowserSession(page, request, user)
    await page.addInitScript(() => {
      localStorage.setItem('panelStorage', JSON.stringify({ data: { panelConfig: {
        homeLayout: 'directory', backgroundImageSrc: '/assets/bg-forest.webp', wallpaperMode: 'custom', wallpaperKind: 'image',
        wallpaperSource: '/assets/bg-forest.webp', wallpaperPoster: '/assets/bg-forest.webp', backgroundBlur: 0, backgroundMaskNumber: 0,
        iconStyle: 1, iconTextColor: '#ffffff', useThemeDefaults: false, iconTextInfoHideDescription: false, iconTextIconHideTitle: false,
        logoText: 'Yin-Panel', logoImageSrc: '', clockShowSecond: true, searchBoxShow: false, searchBoxSearchIcon: true,
        marginBottom: 5, marginTop: 5, maxWidth: 1200, maxWidthUnit: 'px', marginX: 5, footerHtml: '',
        systemMonitorShow: true, systemMonitorShowTitle: true, netModeChangeButtonShow: true,
      } }, expire: null }))
    })
    await installMonitorFixture(page)
    await installIconifyFixture(page)
    const runtimeErrors = []
    page.on('pageerror', error => runtimeErrors.push(String(error)))
    page.on('console', message => {
      if (message.type() === 'error') runtimeErrors.push(message.text())
    })
    await page.goto(`${isolated.url}/`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('theme-trusted-host')).toBeVisible()
    await expect(page.locator('[data-testid="theme-safe-mode-banner"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="theme-runtime-fallback"]')).toHaveCount(0)
    expect(await page.evaluate(() => sessionStorage.getItem('yin-theme-safe-mode'))).toBeNull()
    const themed = themeHomeRoot(page)
    // Space selection is a Core surface; the theme no longer renders its own
    // space navigation, so assert the theme follows the Core selection.
    await expect(themed.locator('.yin-spaces')).toHaveCount(0)
    const coreSpaceTrigger = page.getByRole('button', { name: /My space/ }).first()
    await coreSpaceTrigger.click()
    await page.getByText(spaceName, { exact: true }).last().click()
    await expect(page.locator('.space-status-button')).toContainText(spaceName, { timeout: 15000 })
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

    const item = themed.getByRole('link', { name: 'Open Yang acceptance item' })
    const box = await item.boundingBox()
    expect(box?.width).toBeGreaterThan(0)
    const hit = await item.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      return target?.closest('.yin-item') === element
    })
    expect(hit).toBe(true)
    await assertMonitorScrollsWithContentWithoutOverlap(page, themed)
    // Playwright auto-scroll aligns to the viewport edge, which on narrow
    // viewports lands the item under the fixed space selector pinned to the
    // bottom. The frame no longer scrolls itself, so centre the item by
    // scrolling the Core shell by the measured offset.
    const shellLocator = page.locator('.theme-runtime-shell')
    const shellBox = await shellLocator.boundingBox()
    const centredBox = await item.boundingBox()
    if (shellBox && centredBox) {
      const delta = (centredBox.y + centredBox.height / 2) - (shellBox.y + shellBox.height / 2)
      await shellLocator.evaluate((element, offset) => { element.scrollTop += offset }, delta)
      await page.waitForTimeout(150)
    }
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

    await seedBrowserSession(page, request, user)
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

    await expect(page.getByTestId('theme-trusted-host')).toBeVisible()
    await expect(page.locator('[data-testid="theme-safe-mode-banner"]')).toHaveCount(0)
    await expect(page.locator('[data-testid="theme-runtime-fallback"]')).toHaveCount(0)
    expect(await page.evaluate(() => sessionStorage.getItem('yin-theme-safe-mode'))).toBeNull()
    const themed = themeHomeRoot(page)
    await expect(page.getByRole('button', { name: /My space/ }).first()).toBeVisible()
    for (const spec of itemSpecs)
      await expect(themed.getByRole('link', { name: `Open ${spec.title}` })).toBeVisible()
    await expect(themed.locator('.yin-logo')).toBeVisible()
    // The brand mark is the side switch and the standalone toggle button and
    // space navigation must be gone.
    await expect(themed.locator('.yin-side-toggle')).toHaveCount(0)
    await expect(themed.locator('.yin-spaces')).toHaveCount(0)
    const clock = themed.locator('[data-testid="theme-home-clock"]')
    expect.soft(await clock.count(), 'the legacy clock with seconds must be rendered in the theme content').toBeGreaterThan(0)
    if (await clock.count())
      expect.soft(await clock.first().textContent()).toMatch(/^\d{2}:\d{2}:\d{2}/)
    const search = themed.getByRole('textbox', { name: 'Search bookmarks' })
    expect.soft(await search.count(), 'the configured legacy search control must be present in the theme').toBeGreaterThan(0)
    if (await search.count()) {
      await expect.soft(search).toBeVisible()
      await search.fill('P0 Vector Icon')
      await expect.soft(themed.getByRole('link', { name: 'Open P0 Vector Icon' })).toBeVisible()
      await expect.soft(themed.getByRole('link', { name: 'Open P0 Text Icon' })).toHaveCount(0)
      await search.fill('')
      await expect.soft(themed.getByRole('link', { name: 'Open P0 Text Icon' })).toBeVisible()
    }
    await expect.soft(themed.locator('.yin-footer')).toContainText('P0 footer fixture')
    await expect.soft(page.getByTestId('floating-top-button')).toBeVisible()
    await expect.soft(page.getByTestId('floating-refresh-button')).toBeVisible()

    const textIcon = themed.getByRole('link', { name: 'Open P0 Text Icon' }).locator('.yin-item-icon')
    await expect.soft(textIcon).toContainText('TX')
    const imageIcon = themed.getByRole('link', { name: 'Open P0 Image Icon' }).locator('.yin-item-icon img')
    expect.soft(await imageIcon.count(), 'the image icon must be rendered as an image').toBeGreaterThan(0)
    if (await imageIcon.count()) expect.soft(await imageIcon.evaluate(image => image.naturalWidth)).toBeGreaterThan(0)
    const vectorIcon = themed.getByRole('link', { name: 'Open P0 Vector Icon' }).locator('.yin-item-icon')
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
      await expect.soft(themed.getByRole('link', { name: 'Open P0 Text Icon' })).toHaveCount(0)
      await collapse.click()
      await expect.soft(themed.getByRole('link', { name: 'Open P0 Text Icon' })).toBeVisible()
    }
    await expect.soft(page.getByTestId('wallpaper-layer')).toBeVisible()
    // A static image is painted as a CSS background on the media div, so the
    // loaded source is read from the computed style and then decoded.
    const wallpaperSource = await page.getByTestId('wallpaper-layer').locator('.wallpaper-media').first().evaluate(element =>
      getComputedStyle(element).backgroundImage.match(/url\(["']?([^"')]+)["']?\)/)?.[1]
        || element.getAttribute('src')
        || '')
    expect.soft(wallpaperSource, 'the configured deterministic wallpaper must be referenced').toContain('bg-forest.webp')
    const wallpaperWidth = await page.evaluate(async source => {
      if (!source) return 0
      const image = new Image()
      image.src = source
      try { await image.decode() } catch {}
      return image.naturalWidth
    }, wallpaperSource)
    expect.soft(wallpaperWidth, 'the configured deterministic wallpaper must load').toBeGreaterThan(0)
    await page.mouse.move(0, 0)
    await page.evaluate(() => document.activeElement?.blur())
    // Click the empty gutter outside the centred content so the click cannot
    // land on an Item now that the theme shares the document.
    await page.mouse.click(40, 700)
    await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true)
    await page.evaluate(() => document.fonts.ready)
    await expect(themed.locator('.yin-group-toggle')).toHaveAttribute('aria-label', 'Collapse group')
    if (await search.count()) await search.fill('')
    const baselineMetadata = JSON.parse(await readFile(path.join(testDirectory, 'fixtures', 'yin-theme-baseline-6c69d84-light-1440x900.json'), 'utf8'))
    await expectLegacyGeometry(page.locator('.space-status-bar'), baselineMetadata.geometry['.space-status-bar'], 'space selector')
    await expectLegacyGeometry(themed.locator('.yin-clock'), baselineMetadata.geometry['.clock'], 'clock', { skipX: true, skipWidth: true })
    await expectIdentityBlockCentered(themed, 'desktop')
    await expectLegacyGeometry(themed.locator('.yin-search'), baselineMetadata.geometry['.search-box'], 'search')
    await expectMonitorBetweenSearchAndItems(themed, 'desktop')
    // The monitor is rendered in flow by the theme, so everything after it is
    // shifted down by the monitor band's own bottom edge relative to the legacy
    // overlay baseline (which only accounts for position, not height).
    const monitorBox = await themed.locator('.yin-monitor').boundingBox()
    const baselineMonitor = baselineMetadata.geometry['.system-monitor-layer']
    const monitorShift = (monitorBox.y + monitorBox.height) - (baselineMonitor.y + baselineMonitor.height)
    await expectLegacyGeometry(themed.locator('.yin-group').first(), baselineMetadata.geometry['[data-item-group]'], 'first group', { offsetY: monitorShift })
    await expectLegacyGeometry(themed.locator('.yin-item').first(), baselineMetadata.geometry['.app-icon-small'], 'first Item', { offsetY: monitorShift })
    await expectLegacyGeometry(themed.locator('.yin-footer'), baselineMetadata.geometry['.footer'], 'footer', { skipY: true })
    const [collectionBox, footerBox] = await Promise.all([
      themed.locator('.yin-collection').boundingBox(),
      themed.locator('.yin-footer').boundingBox(),
    ])
    expect(footerBox.y, 'the footer must sit below the collection').toBeGreaterThanOrEqual(collectionBox.y + collectionBox.height - 1)
    await expectHomeVerticalOrder(themed, 'desktop')
    if (test.info().project.name === 'chromium-desktop')
      await compareLegacyBaseline(page, test.info(), 'light', 1440, 900)
    const themeBackgrounds = await page.locator('[data-testid="theme-trusted-host"] #theme-root, [data-testid="theme-trusted-host"] .yin-page').evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundColor))
    const opaqueBackgrounds = themeBackgrounds.filter(color => {
      const channels = color.match(/rgba?\(([^)]+)\)/)?.[1]?.split(',').map(value => value.trim()) || []
      return channels.length < 4 || Number(channels[3]) !== 0
    })
    expect.soft(opaqueBackgrounds, 'the theme layers must be transparent over the configured wallpaper').toEqual([])
    await assertMonitorScrollsWithContentWithoutOverlap(page, themed)

    for (const scenario of [
      { mode: 'dark', width: 1440, height: 900 },
      { mode: 'light', width: 390, height: 844 },
      { mode: 'dark', width: 390, height: 844 },
    ]) {
      await data(await request.post('/api/theme/v2/preference', { headers, data: { packageId: 'org.yin.default', mode: scenario.mode } }))
      await page.setViewportSize({ width: scenario.width, height: scenario.height })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('theme-trusted-host')).toBeVisible()
      const modeHome = themeHomeRoot(page)
      await expect(modeHome.getByRole('link', { name: 'Open P0 Text Icon' })).toBeVisible()
      if (scenario.width === 390)
        expect(monitorRequests.length, `monitor enable status must be queried before ${scenario.mode} mobile baseline`).toBeGreaterThan(0)
    await expect(modeHome.locator('.yin-footer')).toContainText('P0 footer fixture')
    await expect(page.getByTestId('wallpaper-layer')).toBeVisible()
    await expect(page.getByTestId('theme-safe-mode-banner')).toHaveCount(0)
    if (scenario.width === 390) {
      const selector = page.locator('.space-status-bar')
      // The space switcher is centred at the top on every viewport now.
      await expect(selector).toHaveCSS('top', '14px')
      const mobileMetadata = JSON.parse(await readFile(path.join(testDirectory, 'fixtures', `yin-theme-baseline-6c69d84-${scenario.mode}-390x844.json`), 'utf8'))
      await expectLegacyGeometry(modeHome.locator('.yin-clock'), mobileMetadata.geometry['.clock'], 'mobile clock', { skipX: true, skipWidth: true })
      await expectIdentityBlockCentered(modeHome, 'mobile')
      await expectLegacyGeometry(modeHome.locator('.yin-search'), mobileMetadata.geometry['.search-box'], 'mobile search')
      await expectMonitorBetweenSearchAndItems(modeHome, `mobile ${scenario.mode}`)
      await expectHomeVerticalOrder(modeHome, `mobile ${scenario.mode}`)
      // The mobile collection spacing was deliberately tightened, so only the
      // legacy width and height still apply below the monitor.
      await expectLegacyGeometry(modeHome.locator('.yin-group').first(), mobileMetadata.geometry['[data-item-group]'], 'mobile first group', { skipY: true })
      await expectLegacyGeometry(modeHome.locator('.yin-item').first(), mobileMetadata.geometry['.app-icon-small'], 'mobile first Item', { skipY: true })
      await expectLegacyGeometry(modeHome.locator('.yin-footer'), mobileMetadata.geometry['.footer'], 'mobile footer', { skipY: true })
    }
      await page.mouse.move(0, 0)
      await page.evaluate(() => document.activeElement?.blur())
      // The mobile baselines predate the theme's mobile action bar and the
      // tightened mobile collection spacing, so only the desktop screenshots are
      // still comparable to the legacy fixture.
      if (test.info().project.name === 'chromium-desktop' && scenario.width === 1440)
        await compareLegacyBaseline(page, test.info(), scenario.mode, scenario.width, scenario.height)
    }

    await data(await request.post('/api/theme/v2/preference', { headers, data: { packageId: 'org.yin.default', mode: 'light' } }))
    await data(await request.post('/api/panel/userConfig/setConfig', {
      headers,
      data: { panel: { iconStyle: 0, iconTextInfoHideDescription: false, iconTextIconHideTitle: false } },
    }))
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    const infoHome = themeHomeRoot(page)
    const infoItem = infoHome.getByRole('link', { name: 'Open P0 Text Icon' })
    await expect(infoItem).toHaveClass(/yin-item--info/)
    await expect(infoItem.locator('.yin-item-description')).toBeVisible()
    await expect(infoItem.locator('.yin-item-title')).toBeVisible()
    await data(await request.post('/api/panel/userConfig/setConfig', {
      headers,
      data: { panel: { iconTextInfoHideDescription: true, iconTextIconHideTitle: true } },
    }))
    await page.reload({ waitUntil: 'domcontentloaded' })
    const hiddenInfoItem = themeHomeRoot(page).getByRole('link', { name: 'Open P0 Text Icon' })
    await expect(hiddenInfoItem.locator('.yin-item-description')).toBeHidden()
    await expect(hiddenInfoItem.locator('.yin-item-title')).toBeHidden()
    await data(await request.post('/api/panel/userConfig/setConfig', {
      headers,
      data: { panel: { iconStyle: 1, iconTextIconHideTitle: true, wallpaperMode: 'none', footerHtml: '' } },
    }))
    await page.reload({ waitUntil: 'domcontentloaded' })
    const noTitleHome = themeHomeRoot(page)
    await expect(noTitleHome.getByRole('link', { name: 'Open P0 Text Icon' }).locator('.yin-item-title')).toBeHidden()
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
    await seedBrowserSession(page, request, user)
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
    await expect(page.getByTestId('theme-trusted-host')).toBeVisible()
    const themed = themeHomeRoot(page)
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
    const erroredTheme = themeHomeRoot(page)
    await expect(erroredTheme.getByText('Could not load bookmark groups')).toBeVisible({ timeout: 10000 })
    await expect(page.getByTestId('offline-unavailable')).toHaveCount(0)
  }
  finally {
    await request.dispose()
  }
})

test('search engine indicator and the Core selection stay in sync in both layouts', async ({ isolated, playwright, page }) => {
  test.setTimeout(240000)
  if (!isolated) throw new Error('Search engine sync requires YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const user = await login(request, { mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com', password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com' })
  const headers = authHeaders(user)
  const panel = {
    backgroundImageSrc: '/assets/bg-forest.webp', wallpaperMode: 'custom', wallpaperKind: 'image',
    wallpaperSource: '/assets/bg-forest.webp', wallpaperPoster: '/assets/bg-forest.webp', backgroundBlur: 0, backgroundMaskNumber: 0,
    iconTextColor: '#ffffff', useThemeDefaults: false, iconTextInfoHideDescription: false, iconTextIconHideTitle: false,
    logoText: 'Yin-Panel', logoImageSrc: '', clockShowSecond: true, searchBoxSearchIcon: true,
    marginBottom: 5, marginTop: 5, maxWidth: 1200, maxWidthUnit: 'px', marginX: 5, footerHtml: '',
    systemMonitorShow: true, systemMonitorShowTitle: true, netModeChangeButtonShow: true,
  }
  try {
    await data(await request.post('/api/theme/v2/preference', { headers, data: { packageId: 'org.yin.default', mode: 'light' } }))
    await seedBrowserSession(page, request, user)
    await page.addInitScript(({ panel }) => {
      localStorage.setItem('panelStorage', JSON.stringify({ data: { panelConfig: { ...panel, searchBoxShow: true } }, expire: null }))
    }, { panel })
    await installMonitorFixture(page)

    // The engine list is the built-in catalogue, so no extra configuration is
    // needed; only the layout differs between the two passes.
    for (const layout of ['standard', 'directory']) {
      await data(await request.post('/api/panel/userConfig/setConfig', { headers, data: { panel: { ...panel, homeLayout: layout, searchBoxShow: true, iconStyle: 1 } } }))
      await page.goto(`${isolated.url}/`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('theme-trusted-host')).toBeVisible()
      const themed = themeHomeRoot(page)
      const engineButton = themed.locator('.yin-search-engine')
      await expect(engineButton, `${layout}: the engine selector must be present`).toBeVisible()

      const indicator = () => engineButton.evaluate(node => getComputedStyle(node).backgroundImage)
      await expect.poll(() => indicator(), { message: `${layout}: the indicator must render the selected engine icon` }).not.toBe('none')
      const initialIcon = await indicator()
      const initialLabel = await engineButton.getAttribute('aria-label')

      await engineButton.click()
      const engineMenu = themed.locator('.yin-search-engines')
      await expect(engineMenu, `${layout}: the engine menu must open`).toBeVisible()
      const options = await engineMenu.locator('.yin-search-engine-option').evaluateAll(nodes => nodes.map(node => ({
        label: node.getAttribute('aria-label'),
        selected: node.getAttribute('aria-selected') === 'true',
        icon: getComputedStyle(node).backgroundImage,
      })))
      expect(options.length, `${layout}: the engine catalogue must be populated`).toBeGreaterThan(2)
      const selected = options.find(option => option.selected)
      const other = options.find(option => !option.selected)
      expect(selected, `${layout}: one engine must be selected`).toBeTruthy()
      expect(other, `${layout}: a different engine must be selectable`).toBeTruthy()
      expect(initialIcon, `${layout}: the button must show the selected engine's icon`).toBe(selected.icon)

      // The defect under test: the icon used to stay on the previous engine
      // after switching. The picker must update the indicator immediately on
      // selection, without waiting for a Core round trip, and close again.
      await engineMenu.getByRole('option', { name: other.label }).click()
      await expect.poll(() => indicator(), { message: `${layout}: the engine icon must follow the selection immediately` }).toBe(other.icon)
      expect(await engineButton.getAttribute('aria-label'), `${layout}: the accessible name must follow the selection`).toBe(`Search engine: ${other.label}`)
      expect(await engineButton.getAttribute('aria-expanded'), `${layout}: the menu must close after selection`).toBe('false')

      // Switching back must also be reflected, proving it tracks the selection
      // rather than latching on the first change.
      await engineButton.click()
      await themed.locator('.yin-search-engines').getByRole('option', { name: selected.label }).click()
      await expect.poll(() => indicator(), { message: `${layout}: the icon must return to the original engine` }).toBe(initialIcon)
      expect(await engineButton.getAttribute('aria-label'), `${layout}: the accessible name must return to the original engine`).toBe(initialLabel)
    }
  } finally {
    await request.dispose()
  }
})

test('every layout, mode and icon style keeps the monitor between the search box and the items', async ({ isolated, playwright, page }) => {
  test.setTimeout(420000)
  if (!isolated) throw new Error('Combination matrix requires YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const user = await login(request, { mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com', password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com' })
  const headers = authHeaders(user)
  // Seed into the space the home actually opens on, otherwise the sweep would
  // measure a home that has no items to push around.
  const spaces = await getSpaces(request, headers)
  let space; let group
  for (const candidate of spaces) {
    const groups = await getGroups(request, candidate.id, headers).catch(() => [])
    if (groups.length) { space = candidate; group = groups[0]; break }
  }
  expect(space, 'the isolated instance must expose a space with an icon group').toBeTruthy()
  const panel = {
    backgroundImageSrc: '/assets/bg-forest.webp', wallpaperMode: 'custom', wallpaperKind: 'image',
    wallpaperSource: '/assets/bg-forest.webp', wallpaperPoster: '/assets/bg-forest.webp', backgroundBlur: 0, backgroundMaskNumber: 0,
    iconTextColor: '#ffffff', useThemeDefaults: false, iconTextInfoHideDescription: false, iconTextIconHideTitle: false,
    logoText: 'Yin-Panel', logoImageSrc: '', clockShowSecond: true, searchBoxSearchIcon: true, searchBoxShow: true,
    marginBottom: 5, marginTop: 5, maxWidth: 1200, maxWidthUnit: 'px', marginX: 5, footerHtml: '',
    systemMonitorShow: true, systemMonitorShowTitle: true, netModeChangeButtonShow: true,
  }
  const created = []
  try {
    for (let index = 0; index < 14; index += 1)
      created.push(await createItem(request, space.id, headers, { title: `Matrix item ${index}`, url: `https://example.test/m${index}`, lanUrl: '', description: `matrix ${index}`, openMethod: 3, itemIconGroupId: group.id, icon: { itemType: 1, text: `M${index}` } }))

    for (const mode of ['light', 'dark']) {
      for (const homeLayout of ['standard', 'directory']) {
        for (const iconStyle of [1, 0]) {
          const combo = `${mode}/${homeLayout}/icon${iconStyle}`
          await data(await request.post('/api/theme/v2/preference', { headers, data: { packageId: 'org.yin.default', mode } }))
          await data(await request.post('/api/panel/userConfig/setConfig', { headers, data: { panel: { ...panel, homeLayout, iconStyle } } }))
          await seedBrowserSession(page, request, user)
          await page.addInitScript(({ panel, mode }) => {
            localStorage.setItem('panelStorage', JSON.stringify({ data: { panelConfig: panel }, expire: null }))
            if (mode === 'dark') document.documentElement.classList.add('dark')
          }, { panel: { ...panel, homeLayout, iconStyle }, mode })
          await installMonitorFixture(page)
          await page.goto(`${isolated.url}/`, { waitUntil: 'domcontentloaded' })
          await expect(page.getByTestId('theme-trusted-host'), `${combo}: the theme must mount`).toBeVisible()
          const themed = themeHomeRoot(page)
          await expect(themed.getByText('Matrix item 0', { exact: true }), `${combo}: the seeded items must render`).toBeVisible({ timeout: 15000 })

          const host = await page.getByTestId('theme-trusted-host').boundingBox()
          const viewportHeight = page.viewportSize()?.height ?? 900
          const pill = await page.locator('.space-status-bar').evaluate(element => {
            const button = element.querySelector('.space-status-button')
            return {
              background: getComputedStyle(element).backgroundColor,
              color: button ? getComputedStyle(button).color : null,
              minWidth: button ? getComputedStyle(button).minWidth : null,
            }
          })
          const monitor = await themed.locator('.yin-monitor').evaluate(element => {
            const rect = element.getBoundingClientRect()
            return { top: rect.top, height: rect.height }
          })
          const inner = await themed.evaluate(root => {
            const top = selector => {
              const node = root.querySelector(selector)
              return node ? node.getBoundingClientRect().top : null
            }
            const page = root.querySelector('.yin-page')
            const style = getComputedStyle(page)
            return {
              logo: top('.yin-logo'), search: top('.yin-search'), item: top('.yin-item'),
              paddingTop: style.paddingTop,
              viewportHeight: style.getPropertyValue('--yin-viewport-height').trim(),
            }
          })

          // The direct-mounted host is bounded by the viewport, so a runaway
          // content offset would show as dead space above the logo rather than
          // as unbounded growth. Measure the logo's distance from the host top.
          expect(host, `${combo}: the theme host must be measurable`).not.toBeNull()
          const logoOffset = (inner.logo ?? 0) - (host?.y ?? 0)
          expect(logoOffset, `${combo}: the logo must sit at the top of the host, not below a runaway offset`).toBeLessThanOrEqual(200)
          expect(logoOffset, `${combo}: the logo must not be pushed above the host`).toBeGreaterThanOrEqual(-1)
          expect(host?.height ?? 0, `${combo}: the theme host must stay within the viewport`).toBeLessThanOrEqual(viewportHeight * 8)
          expect(inner.viewportHeight, `${combo}: the content offset must be pinned to a pixel viewport height`).toMatch(/^\d+px$/)
          expect(Math.abs(Number.parseFloat(inner.paddingTop)), `${combo}: the content offset must be a stable pixel value`).toBeLessThanOrEqual(200)

          // The requirement the whole layout exists to satisfy: the monitor sits
          // after the search box and before the first item, without overlapping.
          expect(inner.search, `${combo}: the search box must be measured`).not.toBeNull()
          expect(inner.item, `${combo}: an item must be measured`).not.toBeNull()
          expect(monitor.top + monitor.height, `${combo}: the monitor must end above the first item`).toBeLessThanOrEqual(inner.item + 1)
          expect(inner.search, `${combo}: the monitor must start below the search box`).toBeLessThanOrEqual(monitor.top + 1)
          expect(inner.logo, `${combo}: the logo must stay above the search box`).toBeLessThan(inner.search)

          // Regression guard: the Core's own light-surface rule for the
          // directory layout used to win over the Yin pill override, leaving
          // white label text on a white pill.
          const channels = (value) => (value || '').match(/rgba?\(([^)]+)\)/)?.[1]?.split(',').map(part => Number(part.trim())) || []
          const [pillRed, pillGreen, pillBlue, pillAlpha = 1] = channels(pill.background)
          const [textRed, textGreen, textBlue, textAlpha = 1] = channels(pill.color)
          expect(pillAlpha, `${combo}: the space pill must stay a translucent dark surface, got ${pill.background}`).toBeLessThan(1)
          expect(Math.max(pillRed, pillGreen, pillBlue) + pillAlpha, `${combo}: the space pill must not be a bright surface, got ${pill.background}`).toBeLessThan(200)
          const luminance = (red, green, blue) => {
            const channel = value => {
              const scaled = value / 255
              return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
            }
            return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
          }
          const contrast = (Math.max(luminance(pillRed, pillGreen, pillBlue), luminance(textRed, textGreen, textBlue)) + 0.05)
            / (Math.min(luminance(pillRed, pillGreen, pillBlue), luminance(textRed, textGreen, textBlue)) + 0.05)
          expect(contrast, `${combo}: the space pill label needs readable contrast, got ${pill.color} on ${pill.background}`).toBeGreaterThan(3)
          expect(textAlpha, `${combo}: the space pill label must be opaque`).toBe(1)
          expect(pill.minWidth, `${combo}: the Yin pill override must survive the Core layout rules`).toBe('140px')
        }
      }
    }
  } finally {
    for (const item of created) await request.delete(`/api/spaces/${space.id}/items/${item.id}`, { headers }).catch(() => {})
    await request.dispose()
  }
})
