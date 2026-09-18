import { test, expect } from '@playwright/test'
import { authHeaders, createItem, createSpace, deleteItem, getFirstGroup, login } from './helpers.mjs'

test('exports and imports bookmark HTML through the space API', async ({ request }) => {
  const user = await login(request); const headers = authHeaders(user); const space = await createSpace(request, headers); const group = await getFirstGroup(request, space.id, headers)
  let itemId
  try {
    const item = await createItem(request, space.id, headers, { title: 'Export E2E', url: 'https://example.com/export', lanUrl: '', description: '', openMethod: 2, itemIconGroupId: group.id, icon: { itemType: 1, text: 'E2E', backgroundColor: '#000000' } })
    itemId = item.id
    const exported = await request.get(`/api/spaces/${space.id}/bookmarks/export`, { headers })
    expect(exported.ok()).toBeTruthy()
    const html = (await exported.body()).toString()
    expect(html).toContain('Export E2E'); expect(html).toContain('https://example.com/export')

    const imported = await request.post(`/api/spaces/${space.id}/bookmarks/import`, { headers, data: { groups: [{ title: 'E2E Imported', items: [{ title: 'Imported E2E', url: 'https://example.com/imported', icon: { itemType: 1, text: 'I' } }] }] } })
    const body = await imported.json(); expect(body.code, body.msg).toBe(0)
    const groups = await (await request.get(`/api/spaces/${space.id}/groups`, { headers })).json()
    const importedGroup = groups.data.find(value => value.title === 'E2E Imported'); expect(importedGroup).toBeTruthy()
    const items = await (await request.get(`/api/spaces/${space.id}/items?groupId=${importedGroup.id}&page=1&pageSize=100`, { headers })).json()
    expect(items.data.some(value => value.title === 'Imported E2E')).toBeTruthy()
    for (const value of items.data) await deleteItem(request, space.id, value.id, headers)
    await request.delete(`/api/spaces/${space.id}/groups/${importedGroup.id}`, { headers })
  } finally { if (itemId) await deleteItem(request, space.id, itemId, headers) }
})
