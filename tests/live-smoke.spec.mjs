import { test, expect } from '@playwright/test'
import { authHeaders, assertPairInvariant, getGroups, getSpaces, login } from './helpers.mjs'

test('current service read-only Yin/Yang smoke', async ({ request, page }) => {
  test.skip(!process.env.YIN_PANEL_URL, 'YIN_PANEL_URL is not configured')
  const user = await login(request)
  const headers = authHeaders(user)
  const spaces = await getSpaces(request, headers)
  expect(spaces.filter(value => value.side === 'yin')).toHaveLength(new Set(spaces.filter(value => value.side === 'yin').map(value => value.pairId)).size)
  assertPairInvariant(spaces)
  const yin = spaces.find(value => value.side === 'yin')
  expect(yin).toBeTruthy()
  expect(yin.pairedSpaceId).toBeTruthy()
  await getGroups(request, yin.id, headers); await getGroups(request, yin.pairedSpaceId, headers)
  const response = await page.goto('/')
  expect(response.status()).toBe(200)
})
