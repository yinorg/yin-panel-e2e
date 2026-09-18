import { test, expect } from './isolated-fixture.mjs'
import { authHeaders, assertPairInvariant, createItem, createSharedSpace, getGroups, getItems, getSpaces, login } from './helpers.mjs'

async function isolatedLogin(service, playwright) {
  const request = await playwright.request.newContext({ baseURL: service.url })
  const user = await login(request, { mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com', password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com' })
  return { request, user, headers: authHeaders(user) }
}

test('shared spaces expose one Yin entry and isolate paired data', async ({ isolated, playwright }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY and YIN_PANEL_TEST_WEB_DIR')
  const { request, headers } = await isolatedLogin(isolated, playwright)
  let yin, yang, yinItem, yangItem
  try {
    const created = await createSharedSpace(request, headers)
    const spaces = await getSpaces(request, headers)
    assertPairInvariant(spaces)
    yin = spaces.find(value => String(value.id) === String(created?.id) || value.name === created?.name)
    yin ||= spaces.find(value => value.type === 'shared' && value.side === 'yin')
    expect(yin).toBeTruthy(); expect(yin.side).toBe('yin'); expect(yin.pairedSpaceId).toBeTruthy()
    yang = spaces.find(value => String(value.id) === String(yin.pairedSpaceId)) || { id: yin.pairedSpaceId }
    const yinGroup = (await getGroups(request, yin.id, headers)).find(value => value.title === 'APP')
    const yangGroup = (await getGroups(request, yang.id, headers)).find(value => value.title === 'APP')
    yinItem = await createItem(request, yin.id, headers, { title: 'Yin isolated', url: 'https://example.test/yin', lanUrl: '', description: '', openMethod: 2, itemIconGroupId: yinGroup.id, icon: { itemType: 1, text: 'Y' } })
    yangItem = await createItem(request, yang.id, headers, { title: 'Yang isolated', url: 'https://example.test/yang', lanUrl: '', description: '', openMethod: 2, itemIconGroupId: yangGroup.id, icon: { itemType: 1, text: 'G' } })
    expect((await getItems(request, yin.id, headers)).map(value => value.title)).toContain('Yin isolated')
    expect((await getItems(request, yin.id, headers)).map(value => value.title)).not.toContain('Yang isolated')
    expect((await getItems(request, yang.id, headers)).map(value => value.title)).toContain('Yang isolated')
    expect((await getItems(request, yang.id, headers)).map(value => value.title)).not.toContain('Yin isolated')
  } finally {
    if (yinItem) await request.delete(`/api/spaces/${yin.id}/items/${yinItem.id}`, { headers })
    if (yangItem) await request.delete(`/api/spaces/${yang.id}/items/${yangItem.id}`, { headers })
    await request.dispose()
  }
})
