import { expect } from '@playwright/test'
import crypto from 'node:crypto'

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
