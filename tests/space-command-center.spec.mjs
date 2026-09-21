import { test, expect } from '@playwright/test'
import { authHeaders, createItem, createSpace, deleteItem, login, loginPage } from './helpers.mjs'

test('global space command center searches items and runs commands', async ({ page, request }) => {
  const user = await login(request)
  const headers = authHeaders(user)
  const space = await createSpace(request, headers)
  const searchConfigResponse = await request.get(`/api/spaces/${space.id}/search-config`, { headers })
  const searchConfigBody = await searchConfigResponse.json()
  expect(searchConfigBody.code, searchConfigBody.msg).toBe(0)
  const searchEngineUrl = searchConfigBody.data.currentSearchEngine.url
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
      openMethod: 2,
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

    const searchPopup = page.waitForEvent('popup')
    await page.keyboard.press('Enter')
    const searchPage = await searchPopup
    const expectedSearchUrl = searchEngineUrl.includes('%s')
      ? searchEngineUrl.replace('%s', encodeURIComponent(item.title))
      : searchEngineUrl + encodeURIComponent(item.title)
    await expect.poll(() => searchPage.url()).toContain(expectedSearchUrl)
    await searchPage.close()

    await page.keyboard.press('Escape')
    await page.keyboard.type(item.title)
    await expect(center).toBeVisible()
    await page.keyboard.press('ArrowDown')
    const itemPopup = page.waitForEvent('popup')
    await page.keyboard.press('Enter')
    const itemPage = await itemPopup
    await expect.poll(() => itemPage.url()).toBe(item.url)
    await itemPage.close()

    await page.keyboard.press('Escape')
    await page.keyboard.type(item.title)
    await expect(center).toBeVisible()
    await center.getByRole('button').filter({ hasText: item.url }).hover()
    const hoveredItemPopup = page.waitForEvent('popup')
    await page.keyboard.press('Enter')
    const hoveredItemPage = await hoveredItemPopup
    await expect.poll(() => hoveredItemPage.url()).toBe(item.url)
    await hoveredItemPage.close()

    await page.keyboard.press('Escape')
    await expect(center).toBeHidden()

    await page.keyboard.press('/')
    await expect(center).toBeVisible()
    await expect(page.getByTestId('command-center-input')).toBeFocused()
    await center.getByText('/add', { exact: true }).click()
    await expect(page.getByTestId('edit-item-modal')).toBeVisible()
    await page.locator('.n-modal-container .n-base-close').last().click()
    await expect(page.getByTestId('edit-item-modal')).toBeHidden()
    await page.keyboard.press('x')
    await expect(center).toBeVisible()
    await page.keyboard.press('Escape')

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
