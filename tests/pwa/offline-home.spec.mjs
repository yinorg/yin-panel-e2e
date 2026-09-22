import { chromium, expect, test } from '@playwright/test'
import { getFirstGroup, getItems, getSpaces, login, loginPage, authHeaders } from '../helpers.mjs'

async function openProfile(testInfo, name, offline = false) {
  const profile = testInfo.outputPath(name)
  const context = await chromium.launchPersistentContext(profile, { headless: true, offline })
  return { context, page: await context.newPage() }
}

async function assertControlled(page) {
  await expect(page).toHaveURL(/\/$/)
  await expect.poll(
    () => page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { secure: isSecureContext, active: false, controlled: false }
      const registration = await navigator.serviceWorker.ready
      return {
        secure: isSecureContext,
        active: registration.active?.state === 'activated',
        controlled: Boolean(navigator.serviceWorker.controller),
      }
    }),
    { timeout: 60000, intervals: [250, 500, 1000, 2000] },
  ).toEqual({ secure: true, active: true, controlled: true })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('pwa-ready')).toBeVisible({ timeout: 30000 })
}

async function waitForInstalledWorker(page) {
  await expect.poll(
    () => page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { active: false, controlled: false }
      const registration = await navigator.serviceWorker.ready
      return { active: registration.active?.state === 'activated', controlled: Boolean(navigator.serviceWorker.controller) }
    }),
    { timeout: 60000, intervals: [250, 500, 1000, 2000] },
  ).toEqual({ active: true, controlled: true })
}

async function cacheUrls(page) {
  return page.evaluate(async () => {
    const urls = []
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      for (const request of await cache.keys()) urls.push(new URL(request.url).pathname)
    }
    return urls
  })
}

async function expectItemRendered(page) {
  await expect.poll(
    () => page.locator('[data-testid="home-item"]').count(),
    { timeout: 30000, intervals: [250, 500, 1000] },
  ).toBeGreaterThan(0)
}

test('online warmup then offline reload remains readable after browser restart', async ({ request }, testInfo) => {
  const user = await login(request)
  const headers = authHeaders(user)
  const spaces = await getSpaces(request, headers)
  const spaceId = process.env.YIN_PANEL_TEST_SPACE_ID || spaces[0]?.id
  const space = spaces.find(value => String(value.id) === String(spaceId))
  expect(space, 'configured test space is unavailable').toBeTruthy()
  const group = await getFirstGroup(request, space.id, headers)
  const items = await getItems(request, space.id, headers, group.id)
  expect(items.length, 'configured test group must contain an item').toBeGreaterThan(0)
  const itemText = String(items[0].title || items[0].name || items[0].url)

  const first = await openProfile(testInfo, 'warm-profile')
  try {
    await loginPage(first.page)
    await assertControlled(first.page)
    await expect(first.page.getByTestId('item-group').first()).toBeVisible()
    await expectItemRendered(first.page)
    const urls = await cacheUrls(first.page)
    expect(urls).toContain('/index.html')
    expect(urls.some(url => /\.js$/.test(url))).toBeTruthy()
    expect(urls).toContain('/assets/bg-forest.webp')
    expect(urls.some(url => /favicon|search|icon/i.test(url))).toBeTruthy()

    await first.context.setOffline(true)
    const response = await first.page.reload()
    expect(response?.status()).toBe(200)
    await expect(first.page.getByTestId('offline-readonly')).toBeVisible()
    await expectItemRendered(first.page)
    await expect(first.page.getByTestId('floating-refresh-button')).toBeHidden()
    await first.page.getByTestId('home-search-input').fill(itemText.slice(0, Math.max(1, Math.min(3, itemText.length))))
  } finally { await first.context.close() }

  const restarted = await openProfile(testInfo, 'warm-profile', true)
  try {
    await restarted.page.goto('/')
    await expect(restarted.page.getByTestId('offline-readonly')).toBeVisible()
    await expectItemRendered(restarted.page)
  } finally { await restarted.context.close() }
})

test('installed shell without home cache reports explicit offline unavailable state', async ({}, testInfo) => {
  const profile = testInfo.outputPath('cold-profile')
  const online = await chromium.launchPersistentContext(profile, { headless: true })
  try {
    const page = await online.newPage()
    await page.goto('/login')
    await expect.poll(() => page.evaluate(() => 'serviceWorker' in navigator)).toBeTruthy()
    await page.reload()
    await waitForInstalledWorker(page)
  } finally { await online.close() }
  const offline = await chromium.launchPersistentContext(profile, { headless: true, offline: true })
  try {
    const page = await offline.newPage()
    await page.goto('/').catch(() => {})
    await expect(page.getByTestId('offline-unavailable')).toBeVisible()
    await expect(page.locator('[data-testid="loading"]')).toHaveCount(0)
    await expect(page).not.toHaveURL(/\/login/)
  } finally { await offline.close() }
})

test('offline cache is isolated between configured accounts', async ({ request }, testInfo) => {
  test.skip(!process.env.YIN_PANEL_TEST_MEMBER_USER || !process.env.YIN_PANEL_TEST_MEMBER_PASSWORD, 'member credentials are not configured')
  const primary = await login(request)
  const spaces = await getSpaces(request, authHeaders(primary))
  const spaceId = process.env.YIN_PANEL_TEST_SPACE_ID || spaces[0]?.id
  const group = await getFirstGroup(request, spaceId, authHeaders(primary))
  const items = await getItems(request, spaceId, authHeaders(primary), group.id)
  expect(items.length).toBeGreaterThan(0)
  const primaryText = String(items[0].title || items[0].name || items[0].url)
  const profile = await openProfile(testInfo, 'isolation-profile')
  try {
    await loginPage(profile.page)
    await assertControlled(profile.page)
    await expectItemRendered(profile.page)
    await profile.context.setOffline(false)
    await profile.page.getByRole('button', { name: /logout|退出/i }).click().catch(() => {})
    await loginPage(profile.page, { mail: process.env.YIN_PANEL_TEST_MEMBER_USER, password: process.env.YIN_PANEL_TEST_MEMBER_PASSWORD })
    await profile.context.setOffline(true)
    await profile.page.reload().catch(() => {})
    await expect(profile.page.getByText(primaryText, { exact: false })).toHaveCount(0)
  } finally { await profile.context.close() }
})
