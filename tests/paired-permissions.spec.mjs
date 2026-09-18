import { test, expect } from './isolated-fixture.mjs'
import { addSpaceMember, authHeaders, createSharedSpace, createTestUser, getMembers, getSpaces, login } from './helpers.mjs'

test('member role changes are reflected on both paired spaces', async ({ isolated, playwright }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY and YIN_PANEL_TEST_WEB_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const admin = await login(request, { mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com', password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com' })
  const headers = authHeaders(admin)
  const member = await createTestUser(request, headers, `member-${Date.now()}`)
  const created = await createSharedSpace(request, headers)
  const spaces = await getSpaces(request, headers)
  const yin = spaces.find(value => value.type === 'shared' && value.side === 'yin')
  expect(yin).toBeTruthy()
  const yang = { id: yin.pairedSpaceId }
  const added = await addSpaceMember(request, yin.id, headers, member.mail, 'viewer')
  expect(added.body.code, added.body.msg).toBe(0)
  for (const space of [yin, yang]) {
    const match = (await getMembers(request, space.id, headers)).find(value => value.email === member.mail || value.mail === member.mail)
    expect(match?.role).toBe('viewer')
  }
  await request.delete(`/api/spaces/${yin.id}/members/${member.id}`, { headers })
  await request.post('/api/panel/users/delete', { headers, data: { userId: member.id, force: true } })
  await request.dispose()
})
