import { test, expect } from '@playwright/test'
import { request as apiRequest } from '@playwright/test'
import { authHeaders, createSpace, login, loginPage, provisionedMember } from './helpers.mjs'

test('manages groups, members and public access from the UI', async ({ page, request, browser }) => {
  const user = await login(request); const headers = authHeaders(user); const member = await provisionedMember()
  const space = await createSpace(request, headers); let memberUser; let createdGroupId
  try {
    await loginPage(page)
    await page.locator('.n-button').last().click()
    await page.getByText(/space manage|空间管理/i).click()
    await page.getByRole('button', { name: /add group/i }).click()
    await page.getByPlaceholder(/group name/i).fill(`E2E Group ${Date.now()}`)
    await page.getByRole('button', { name: /confirm/i }).click()
    const groupBody = await (await request.get(`/api/spaces/${space.id}/groups`, { headers })).json()
    createdGroupId = groupBody.data.find(value => value.title.startsWith('E2E Group')).id

    await page.getByRole('button', { name: /add member/i }).click()
    await page.getByPlaceholder(/email/i).fill(member.mail)
    await page.getByRole('button', { name: /confirm/i }).click()
    const members = await (await request.get(`/api/spaces/${space.id}/members`, { headers })).json()
    memberUser = members.data.find(value => value.email === member.mail)
    expect(memberUser?.role).toBe('viewer')

    await page.getByText(/public access/i).locator('..').getByRole('checkbox').check()
    await page.getByPlaceholder(/FN ID|my-panel/i).fill(`e2e-public-${Date.now().toString().slice(-8)}`)
    await page.getByRole('button', { name: /save public/i }).click()
    await expect(page.locator('span.text-gray-500').filter({ hasText: /访问地址|http/i })).toBeVisible()

    const memberContext = await browser.newContext(); const memberPage = await memberContext.newPage()
    await memberPage.goto('/login'); await memberPage.getByPlaceholder(/email|username/i).fill(member.mail); await memberPage.getByPlaceholder(/password/i).fill(member.password); await memberPage.getByRole('button', { name: /login/i }).click(); await expect(memberPage).toHaveURL(/\/$/)
    const memberApi = await apiRequest.newContext({ baseURL: process.env.YIN_PANEL_URL })
    const memberLogin = await memberApi.post('/api/login', { data: { mail: member.mail, password: member.password } })
    const memberBody = await memberLogin.json()
    const forbidden = await (await memberApi.post(`/api/spaces/${space.id}/groups`, { headers: { Authorization: `Bearer ${memberBody.data.token}` }, data: { title: 'Viewer should fail' } })).json()
    expect(forbidden.code).not.toBe(0)
    await memberApi.dispose()
    await memberContext.close()
  } finally {
    if (createdGroupId) await request.delete(`/api/spaces/${space.id}/groups/${createdGroupId}`, { headers }).catch(() => {})
  }
})
