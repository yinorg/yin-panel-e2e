import { chromium, expect, test } from '@playwright/test'
import os from 'node:os'
import path from 'node:path'
import { getFirstGroup, getItems, getSpaces, login, loginPage, authHeaders } from '../helpers.mjs'

const profileRunId = `${process.pid}-${Date.now()}`
const sharedProfileRoot = path.join(os.tmpdir(), `yin-panel-pwa-${profileRunId}`)

async function openProfile(testInfo, name, offline = false) {
  const profile = name === 'warm-profile'
    ? path.join(sharedProfileRoot, name)
    : testInfo.outputPath(`${name}-${profileRunId}`)
  const context = await chromium.launchPersistentContext(profile, { headless: true, offline })
  return { context, page: await context.newPage() }
}

async function serviceWorkerState(page) {
  return page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { secure: isSecureContext, active: null, installing: null, waiting: null, controlled: false }
    const registration = await navigator.serviceWorker.getRegistration()
    return {
      secure: isSecureContext,
      active: registration?.active?.state || null,
      installing: registration?.installing?.state || null,
      waiting: registration?.waiting?.state || null,
      controlled: Boolean(navigator.serviceWorker.controller),
    }
  })
}

async function assertControlled(page) {
  await expect(page).toHaveURL(/\/$/)
  await expect.poll(
    () => serviceWorkerState(page),
    { timeout: 60000, intervals: [250, 500, 1000, 2000] },
  ).toEqual({ secure: true, active: 'activated', installing: null, waiting: null, controlled: true })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('pwa-ready')).toBeVisible({ timeout: 30000 })
}

async function waitForInstalledWorker(page) {
  await expect.poll(
    () => serviceWorkerState(page),
    { timeout: 60000, intervals: [250, 500, 1000, 2000] },
  ).toEqual({ secure: true, active: 'activated', installing: null, waiting: null, controlled: true })
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
    const member = await login(request, { mail: process.env.YIN_PANEL_TEST_MEMBER_USER, password: process.env.YIN_PANEL_TEST_MEMBER_PASSWORD })
    await restarted.context.setOffline(false)
    await restarted.page.reload()
    await assertControlled(restarted.page)
    await restarted.page.addInitScript((user) => {
      localStorage.setItem('authStorage', JSON.stringify({ data: { token: user.token, userInfo: user }, expire: null }))
    }, member)
    const primaryCacheKeys = await restarted.page.evaluate((userId) => Object.keys(localStorage).filter(key => key.startsWith(`yin-panel-space-cache:${userId}:`) || key === `yin-panel-spaces-cache:${userId}`), user.id)
    expect(primaryCacheKeys.length, 'account A cache should remain in the profile').toBeGreaterThan(0)
    await restarted.context.setOffline(true)
    await restarted.page.reload()
    await expect(restarted.page.getByTestId('offline-unavailable')).toBeVisible()
    await expect(restarted.page.getByTestId('offline-readonly')).toHaveCount(0)
    await expect(restarted.page.getByTestId('home-item')).toHaveCount(0)
  } finally { await restarted.context.close() }

})

test('installed shell without home cache reports explicit offline unavailable state', async ({}, testInfo) => {
  const profile = testInfo.outputPath(`cold-profile-${profileRunId}`)
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
