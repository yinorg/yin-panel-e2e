import { test, expect } from './isolated-fixture.mjs'
import { authHeaders, createSharedSpace, getSpaces, login, setPublicConfig } from './helpers.mjs'

test('public configuration is explicit and write operations require authentication', async ({ isolated, playwright }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY and YIN_PANEL_TEST_WEB_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const user = await login(request, { mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com', password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com' })
  const headers = authHeaders(user)
  const created = await createSharedSpace(request, headers)
  const spaces = await getSpaces(request, headers)
  const yin = spaces.find(value => String(value.id) === String(created?.id) || value.type === 'shared')
  expect(yin).toBeTruthy()
  const publicId = `e2e-public-${Date.now().toString().slice(-8)}`
  const enabled = await setPublicConfig(request, yin.id, headers, { enabled: true, publicId, mode: 'direct' })
  expect(enabled.body.code, enabled.body.msg).toBe(0)
  const publicHeaders = { publiccode: publicId }
  const listed = await request.get('/api/spaces', { headers: publicHeaders })
  expect(listed.ok()).toBeTruthy()
  const body = await listed.json(); expect(body.code).toBe(0); expect(body.data).toHaveLength(1)
  const write = await request.post(`/api/spaces/${yin.id}/groups`, { headers: publicHeaders, data: { title: 'must fail' } })
  expect((await write.json()).code).not.toBe(0)
  const disabled = await setPublicConfig(request, yin.id, headers, { enabled: false, publicId, mode: 'direct' })
  expect(disabled.body.code, disabled.body.msg).toBe(0)
  await request.dispose()
})
