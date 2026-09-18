import { test, expect } from './isolated-fixture.mjs'
import { authHeaders, createSharedSpace, createTestUser, deleteTestUser, getSpaces, login } from './helpers.mjs'

test('ordinary deletion removes personal spaces and protects shared-space owners', async ({ isolated, playwright }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY and YIN_PANEL_TEST_WEB_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const admin = await login(request, { mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com', password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com' })
  const headers = authHeaders(admin)
  const personal = await createTestUser(request, headers, `personal-${Date.now()}`)
  const deleted = await deleteTestUser(request, headers, personal.id)
  expect(deleted.body.code, deleted.body.msg).toBe(0)
  const sharedOwner = await createTestUser(request, headers, `shared-${Date.now()}`)
  const ownerLogin = await login(request, sharedOwner)
  const ownerHeaders = authHeaders(ownerLogin)
  await createSharedSpace(request, ownerHeaders)
  const blocked = await deleteTestUser(request, headers, sharedOwner.id)
  expect(blocked.body.code).not.toBe(0)
  expect((await getSpaces(request, headers)).length).toBeGreaterThan(0)
  const forced = await deleteTestUser(request, headers, sharedOwner.id, true)
  expect(forced.body.code, forced.body.msg).toBe(0)
  await request.dispose()
})
