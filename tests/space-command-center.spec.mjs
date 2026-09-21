import { test, expect } from '@playwright/test'
import { authHeaders, createItem, createSpace, deleteItem, login, loginPage } from './helpers.mjs'

test('global space command center searches items and runs commands', async ({ page, request }) => {
  const user = await login(request)
  const headers = authHeaders(user)
  const space = await createSpace(request, headers)
  const suffix = `${Date.now().toString().slice(-8)}${Math.random().toString(36).slice(2, 5)}`
  const staleGroups = await (await request.get(`/api/spaces/${space.id}/groups`, { headers })).json()
  for (const group of staleGroups.data || []) {
    if (group.title?.startsWith('CCG ')) await request.delete(`/api/spaces/${space.id}/groups/${group.id}`, { headers })
  }

  const groupResponse = await request.post(`/api/spaces/${space.id}/groups`, { headers, data: { title: `CCG ${suffix}` } })
  const groupBody = await groupResponse.json()
  expect(groupBody.code, groupBody.msg).toBe(0)
  const group = groupBody.data
  let item

  try {
    item = await createItem(request, space.id, headers, {
      title: `CCI ${suffix}`,
      url: `https://example.com/${suffix}`,
      itemIconGroupId: group.id,
      openMethod: 1,
    })
    await loginPage(page)

    const center = page.getByTestId('command-center-panel')
    const homeSearch = page.getByTestId('home-search-input')

    async function waitForCreatedItem() {
      const heading = page.getByTestId('item-group').filter({ hasText: group.title }).first()
      await expect(heading).toBeVisible()
      await heading.scrollIntoViewIfNeeded()
      await expect(heading.getByText(item.title, { exact: true })).toBeVisible()
    }

    await waitForCreatedItem()
    await page.keyboard.type(item.title)
    await expect(center).toBeVisible()
    await expect(center.getByText(item.title, { exact: true })).toBeVisible()
    await expect(center.getByRole('button').filter({ hasText: item.url })).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(center).toBeHidden()

    await page.keyboard.press('/')
    await expect(center).toBeVisible()
    await expect(page.getByTestId('command-center-input')).toBeFocused()
    await center.getByText('/add', { exact: true }).click()
    await expect(page.getByTestId('edit-item-modal')).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForCreatedItem()
    await page.keyboard.press('/')
    await center.getByText('/group', { exact: true }).click()
    await expect(page.getByTestId('create-group-modal')).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForCreatedItem()
    await page.keyboard.press('/')
    await center.getByText('/space', { exact: true }).click()
    await expect(page.getByTestId('create-space-modal')).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForCreatedItem()
    await homeSearch.focus()
    await homeSearch.fill('ordinary search')
    await expect(center).toBeHidden()

    await page.getByTestId('system-settings-button').click()
    await page.keyboard.press('x')
    await expect(center).toBeHidden()
  }
  finally {
    if (item) await deleteItem(request, space.id, item.id, headers)
    await request.delete(`/api/spaces/${space.id}/groups/${group.id}`, { headers }).catch(() => {})
  }
})
