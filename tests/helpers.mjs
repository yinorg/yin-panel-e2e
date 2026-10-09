import { expect } from '@playwright/test'
import crypto from 'node:crypto'
import { expect as pwExpect } from '@playwright/test'

export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

export async function login(request, credentials = {}) {
  const mail = credentials.mail || process.env.YIN_PANEL_TEST_USER
  const password = credentials.password || process.env.YIN_PANEL_TEST_PASSWORD
  if (process.env.YIN_PANEL_TEST_TOKEN && !credentials.mail)
    return { token: process.env.YIN_PANEL_TEST_TOKEN, id: 1, name: 'e2e' }
  if (!mail || !password) throw new Error('Test credentials are not configured')
  const response = await request.post('/api/login', { data: { mail, password } })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  expect(body.code, body.msg).toBe(0)
  return body.data
}

export function authHeaders(user) { return { Authorization: `Bearer ${user.token}` } }

export async function loginAs(request, credentials) { return login(request, credentials) }

/**
 * The light-DOM mount point of a directly mounted (built-in) theme. The built-in
 * themes render same-origin under the trusted host instead of in the legacy
 * sandbox frame, so the theme DOM is a normal descendant of the Core page.
 */
export function themeHomeRoot(page) {
  return page.locator('[data-testid="theme-trusted-host"] #theme-root')
}

/**
 * Seed a browser page with the current Core session model: `/api/login` puts the
 * session token in an httpOnly cookie, and localStorage only records the user and
 * the logged-in flag. Copying the API context's cookie jar keeps the page and the
 * request context on the same session; writing the legacy `token` into
 * localStorage would instead be treated as a stale session and force a re-login.
 */
export async function seedBrowserSession(page, request, user) {
  const { cookies } = await request.storageState()
  if (cookies.length) await page.context().addCookies(cookies)
  const userInfo = { id: user.userId || user.id, name: user.name, mail: user.mail, role: user.role }
  await page.addInitScript(({ userInfo }) => {
    sessionStorage.removeItem('yin-theme-safe-mode')
    localStorage.setItem('authStorage', JSON.stringify({ data: { userInfo, loggedIn: true }, expire: null }))
  }, { userInfo })
}

async function json(request, method, url, options = {}) {
  const response = await request[method](url, options)
  const body = await response.json().catch(() => ({}))
  return { response, body }
}

export async function getSpaces(request, headers) { return (await json(request, 'get', '/api/spaces', { headers })).body.data || [] }
export async function getGroups(request, spaceId, headers) { return (await json(request, 'get', `/api/spaces/${spaceId}/groups`, { headers })).body.data || [] }
export async function getItems(request, spaceId, headers, groupId) {
  const query = groupId ? `?groupId=${groupId}&page=1&pageSize=200` : '?page=1&pageSize=200'
  return (await json(request, 'get', `/api/spaces/${spaceId}/items${query}`, { headers })).body.data || []
}
export async function getPair(request, space, headers) {
  const spaces = await getSpaces(request, headers)
  return spaces.find(value => String(value.id) === String(space.pairedSpaceId) || String(value.pairId) === String(space.pairId) && value.side !== space.side)
}
export async function getMembers(request, spaceId, headers) { return (await json(request, 'get', `/api/spaces/${spaceId}/members`, { headers })).body.data || [] }
export async function getOIDCGroups(request, spaceId, headers) { return (await json(request, 'get', `/api/spaces/${spaceId}/oidc-groups`, { headers })).body.data || [] }
export async function setPublicConfig(request, spaceId, headers, config) { return json(request, 'post', `/api/spaces/${spaceId}/public`, { headers, data: config }) }
export function assertPairInvariant(spaces) {
  for (const space of spaces.filter(value => value.side === 'yin')) {
    pwExpect(space.pairId).toBeTruthy(); pwExpect(space.pairedSpaceId).toBeTruthy()
    pwExpect(spaces.filter(value => value.side === 'yin' && value.pairId === space.pairId)).toHaveLength(1)
  }
}
export async function createTestUser(request, headers, suffix = Date.now()) {
  const user = { mail: `e2e-${suffix}@example.test`, password: `E2e-${suffix}-pass`, name: `E2E ${suffix}`, role: 1 }
  const result = await json(request, 'post', '/api/panel/users/create', { headers, data: user })
  expect(result.body.code, result.body.msg).toBe(0)
  return { ...user, id: result.body.data.userId }
}
export async function deleteTestUser(request, headers, id, force = false) { return json(request, 'post', '/api/panel/users/delete', { headers, data: { userId: id, force } }) }
export async function createSharedSpace(request, headers, name = `E2E shared ${Date.now()}`) {
  const result = await json(request, 'post', '/api/spaces/shared', { headers, data: { name } })
  expect(result.body.code, result.body.msg).toBe(0); return result.body.data
}
export async function addSpaceMember(request, spaceId, headers, email, role = 'viewer') { return json(request, 'post', `/api/spaces/${spaceId}/members`, { headers, data: { email, role } }) }

export async function loginPage(page, credentials = {}) {
  await page.goto('/login')
  await page.getByPlaceholder(/email|username/i).fill(credentials.mail || process.env.YIN_PANEL_TEST_USER)
  await page.getByPlaceholder(/password/i).fill(credentials.password || process.env.YIN_PANEL_TEST_PASSWORD)
  await page.getByRole('button', { name: /login/i }).click()
  await expect(page).toHaveURL(/\/$/)
}

export async function getFirstGroup(request, spaceId, headers) {
  const response = await request.get(`/api/spaces/${spaceId}/groups`, { headers })
  const body = await response.json()
  expect(body.code, body.msg).toBe(0)
  expect(body.data?.length, 'space has no icon group').toBeGreaterThan(0)
  return body.data[0]
}

export async function createSpace(request, headers) {
  const spaceId = process.env.YIN_PANEL_TEST_SPACE_ID || '1'
  const response = await request.get('/api/spaces', { headers })
  const body = await response.json()
  expect(body.code, body.msg).toBe(0)
  const space = body.data.find(value => String(value.id) === String(spaceId))
  expect(space, `test space ${spaceId} was not found`).toBeTruthy()
  return space
}

export async function deleteSpace(request, spaceId, headers) {
  await request.post(`/api/spaces/${spaceId}/clear`, { headers }).catch(() => {})
}

// Spaces are owned rows, so removal goes through the owner-only delete route.
export async function deleteSpacePermanently(request, spaceId, headers) {
  return json(request, 'post', `/api/spaces/${spaceId}/delete`, { headers })
}

export function sha256File(buffer, ext = '.png') {
  return `${crypto.createHash('sha256').update(buffer).digest('hex')}${ext}`
}

export async function createItem(request, spaceId, headers, item) {
  const response = await request.post(`/api/spaces/${spaceId}/items`, { headers, data: item })
  const body = await response.json()
  expect(body.code, body.msg).toBe(0)
  return body.data
}

export async function deleteItem(request, spaceId, itemId, headers) {
  await request.delete(`/api/spaces/${spaceId}/items/${itemId}`, { headers }).catch(() => {})
}

export async function provisionedMember() {
  const mail = process.env.YIN_PANEL_TEST_MEMBER_USER
  const password = process.env.YIN_PANEL_TEST_MEMBER_PASSWORD
  if (!mail || !password) throw new Error('Run `pnpm provision-member` before permission tests')
  return { mail, password }
}
