import { test, expect } from '@playwright/test'
import { authHeaders, createSpace, getFirstGroup, login, png } from './helpers.mjs'

test('rejects unsupported and oversized multipart icons', async ({ request }) => {
  const user = await login(request); const headers = authHeaders(user); const space = await createSpace(request, headers); const group = await getFirstGroup(request, space.id, headers)
  const item = JSON.stringify({ title: 'Validation E2E', url: 'https://example.com', lanUrl: '', description: '', openMethod: 2, itemIconGroupId: group.id })
  const unsupported = await request.post(`/api/spaces/${space.id}/items/with-icon`, { headers, multipart: { item, imgfile: { name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('bad') } } })
  expect((await unsupported.json()).code).not.toBe(0)
  const oversized = Buffer.alloc(5 * 1024 * 1024 + 1, 1)
  const tooLarge = await request.post(`/api/spaces/${space.id}/items/with-icon`, { headers, multipart: { item, imgfile: { name: 'large.png', mimeType: 'image/png', buffer: oversized } } })
  expect((await tooLarge.json()).code).not.toBe(0)
  expect(png.length).toBeGreaterThan(0)
})
