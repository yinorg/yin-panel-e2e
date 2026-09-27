import { test, expect } from '@playwright/test'
import { request as apiRequest } from '@playwright/test'
import { authHeaders, createSharedSpace, deleteSpacePermanently, login, loginPage, provisionedMember } from './helpers.mjs'

test('manages groups, members and public access from the UI', async ({ page, request, browser }) => {
  const user = await login(request); const headers = authHeaders(user); const member = await provisionedMember()
  // This spec runs against the live instance, so it must only ever mutate a
  // space it created itself. `createSpace()` resolves the account's existing
  // space, and leaving a space deletes it — that would destroy real user data.
  const space = await createSharedSpace(request, headers)
  expect(space.type, 'the leave-space path is only reachable on a non-personal space').not.toBe('personal')
  let memberUser; let createdGroupId; let spaceDeleted = false
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

    // The member row must expose a role change and a remove control.
    const memberRow = page.locator('.n-list-item').filter({ hasText: member.mail })
    await expect(memberRow.getByRole('button', { name: /remove member|移除成员/i })).toBeVisible()
    await memberRow.locator('.n-base-selection').click()
    await page.locator('.n-base-select-option:visible').filter({ hasText: /editor|编辑者/i }).click()
    await expect.poll(async () => (await (await request.get(`/api/spaces/${space.id}/members`, { headers })).json()).data
      .find(value => value.email === member.mail)?.role).toBe('editor')

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

    // Removing the member must revoke access from the paired Yin and Yang space.
    page.once('dialog', dialog => dialog.accept())
    await memberRow.getByRole('button', { name: /remove member|移除成员/i }).click()
    await expect.poll(async () => (await (await request.get(`/api/spaces/${space.id}/members`, { headers })).json()).data
      .some(value => value.email === member.mail)).toBe(false)

    // The owner row must offer leaving the space, which deletes it, and the
    // Core must refuse a direct member removal of the owner.
    const ownerRemoval = await (await request.post(`/api/spaces/${space.id}/members/${space.ownerUserId}/delete`, { headers })).json()
    expect(ownerRemoval.code, 'removing the owner must be rejected').not.toBe(0)

    const ownerRow = page.locator('.n-list-item').filter({ hasText: user.mail || user.name })
    const leaveButton = ownerRow.getByRole('button', { name: /leave space|退出空间/i })
    await expect(leaveButton, 'the owner of a shared space must be offered leaving it').toBeVisible()
    page.once('dialog', dialog => dialog.accept())
    await leaveButton.click()
    await expect.poll(async () => (await request.get(`/api/spaces`, { headers })).json()
      .data.some(value => String(value.id) === String(space.id))).toBe(false)
    spaceDeleted = true
  } finally {
    if (createdGroupId) await request.delete(`/api/spaces/${space.id}/groups/${createdGroupId}`, { headers }).catch(() => {})
    if (!spaceDeleted) await deleteSpacePermanently(request, space.id, headers).catch(() => {})
  }
})

test('refuses to leave or be removed from a personal space', async ({ page, request }) => {
  const user = await login(request); const headers = authHeaders(user)
  const spaces = (await (await request.get('/api/spaces', { headers })).json()).data
  const personal = spaces.find(value => value.type === 'personal')
  expect(personal, 'the account must own a personal space').toBeTruthy()

  await loginPage(page)
  await page.locator('.n-button').last().click()
  await page.getByText(/space manage|空间管理/i).click()
  // Naive renders dropdown options only while the select is open, and the space
  // select is the first one in the manage card.
  const manageCard = page.locator('.n-card').filter({ has: page.getByText(/space manage|空间管理/i) }).first()
  await manageCard.locator('.n-base-selection').first().click()
  // The manage panel labels every option "<name> (Yin) (<category>)", so the
  // personal space is the option whose label starts with its own Yin name.
  const escaped = personal.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const personalOption = page.locator('.n-base-select-option:visible').filter({ hasText: new RegExp(`^\\s*${escaped}\\s*\\(Yin\\)`) })
  await expect(personalOption, 'the personal space must be selectable in the manage panel').toHaveCount(1)
  await personalOption.click()

  const ownerRow = page.locator('.n-list-item').filter({ hasText: user.mail || user.name })
  await expect(ownerRow, 'the personal space owner must be listed as a member').toBeVisible()
  await expect(ownerRow.getByRole('button', { name: /leave space|退出空间/i }),
    'a personal space must not offer leaving, because there is nothing to leave').toHaveCount(0)
  await expect(ownerRow.getByRole('button', { name: /remove member|移除成员/i }),
    'a personal space owner must not be removable either').toHaveCount(0)

  // The API must reject it too, not just the UI.
  const directLeave = await (await request.post(`/api/spaces/${personal.id}/delete`, { headers })).json()
  expect(directLeave.code, 'deleting a personal space through the leave route must be rejected').not.toBe(0)
  expect((await (await request.get('/api/spaces', { headers })).json()).data
    .some(value => String(value.id) === String(personal.id)),
  'the personal space must still exist after the rejected delete').toBe(true)
})
