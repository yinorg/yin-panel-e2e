import { test, expect } from './isolated-fixture.mjs'
import { authHeaders, getSpaces, login } from './helpers.mjs'
import Database from 'better-sqlite3'

test('repeated local authentication does not create spaces', async ({ isolated, playwright }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY and YIN_PANEL_TEST_WEB_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const credentials = { mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com', password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com' }
  const first = await login(request, credentials); const before = await getSpaces(request, authHeaders(first))
  const second = await login(request, credentials); const after = await getSpaces(request, authHeaders(second))
  expect(second.id).toBe(first.id); expect(after.map(value => value.id)).toEqual(before.map(value => value.id))
  await request.dispose()
})

test('OIDC authorization-code flow reuses identities and creates one paired account', async ({ isolated, page }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY and YIN_PANEL_TEST_WEB_DIR')
  const db = new Database(isolated.database)
  const before = db.prepare('select count(*) as count from user').get().count
  await page.goto(`${isolated.url}/api/oauth/mock`)
  await expect(page).toHaveURL(/\/$/)
  const afterFirst = db.prepare('select count(*) as count from user').get().count
  expect(afterFirst).toBe(before)
  expect(db.prepare("select count(*) as count from space where owner_user_id = (select id from user where mail = 'admin@yiniot.com')").get().count).toBe(2)
  await db.close()
})

test('OIDC rejects an unverified email', async ({ isolated, page }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY and YIN_PANEL_TEST_WEB_DIR')
  await fetch(`${isolated.oidc.issuer}/test/profile?email=unverified@example.test&sub=unverified&verified=false`)
  await page.goto(`${isolated.url}/api/oauth/mock`)
  await expect(page.getByText(/OAuth|login|failed/i).first()).toBeVisible()
})
