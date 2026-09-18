import { test, expect } from '@playwright/test'
import { authHeaders, createSpace, deleteItem, getFirstGroup, login, loginPage, png, sha256File } from './helpers.mjs'

test.describe('item lifecycle', () => {
  test('saves mobileUrl and selects the correct URL by device and network mode', async ({ page, browser, request }) => {
    const user = await login(request)
    const headers = authHeaders(user)
    const space = await createSpace(request, headers)
    const group = await getFirstGroup(request, space.id, headers)
    const baseURL = process.env.YIN_PANEL_URL
    const urls = {
      wan: `${baseURL}/?e2e-target=wan`,
      mobile: `${baseURL}/?e2e-target=mobile`,
      lan: `${baseURL}/?e2e-target=lan`,
    }
    let itemId

    async function openItem(context, expectedUrl, switchToLan = false) {
      const itemPage = await context.newPage()
      await loginPage(itemPage)
      if (switchToLan)
        await itemPage.getByTitle(/switch to lan mode/i).click()
      await expect(itemPage.getByText('Mobile URL E2E', { exact: true })).toBeVisible()
      const popupPromise = itemPage.waitForEvent('popup')
      await itemPage.getByText('Mobile URL E2E', { exact: true }).click()
      const popup = await popupPromise
      await expect.poll(() => popup.url()).toBe(expectedUrl)
      await popup.close()
      await itemPage.close()
    }

    try {
      await loginPage(page)
      const groupHeading = page.locator('[data-item-group]').filter({ hasText: group.title }).first()
      await expect(groupHeading).toBeVisible()
      await groupHeading.getByTitle(/add/i).click()

      const modal = page.getByRole('dialog').last()
      await modal.getByPlaceholder('Please Input').first().fill('Mobile URL E2E')
      await modal.getByRole('textbox', { name: 'http(s)://', exact: true }).fill(urls.wan)
      await modal.getByPlaceholder(/LAN mode/i).fill(urls.lan)
      await modal.getByPlaceholder(/mobile devices in WAN mode only/i).fill(urls.mobile)
      await modal.getByPlaceholder('Please Input').last().fill('mobile URL coverage')
      await modal.locator('input[type="radio"][value="1"]').check({ force: true })
      await modal.locator('input[type="text"]').nth(2).fill('MU')

      const createResponse = page.waitForResponse(response => response.url().includes(`/api/spaces/${space.id}/items`) && response.request().method() === 'POST' && !response.url().includes('with-icon'))
      await modal.getByRole('button', { name: /save/i }).click()
      const createBody = await (await createResponse).json()
      expect(createBody.code, createBody.msg).toBe(0)
      expect(createBody.data.mobileUrl).toBe(urls.mobile)
      itemId = createBody.data.id

      const storedBody = await (await request.get(`/api/spaces/${space.id}/items?groupId=${group.id}&page=1&pageSize=200`, { headers })).json()
      expect(storedBody.data.find(item => item.id === itemId).mobileUrl).toBe(urls.mobile)

      await openItem(browser, urls.wan)
      const mobileContext = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' })
      try {
        await openItem(mobileContext, urls.mobile)
        await openItem(mobileContext, urls.lan, true)
      }
      finally {
        await mobileContext.close()
      }

      const created = storedBody.data.find(item => item.id === itemId)
      const updateResponse = await request.post(`/api/spaces/${space.id}/items/${itemId}/update`, {
        headers,
        data: { ...created, mobileUrl: '' },
      })
      const updateBody = await updateResponse.json()
      expect(updateBody.code, updateBody.msg).toBe(0)

      const fallbackContext = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' })
      try {
        await openItem(fallbackContext, urls.wan)
      }
      finally {
        await fallbackContext.close()
      }
    }
    finally {
      if (itemId) await deleteItem(request, space.id, itemId, headers)
    }
  })

  test('creates, updates and deletes a manual image item through the UI', async ({ page, request }) => {
    const user = await login(request)
    const headers = authHeaders(user)
    const space = await createSpace(request, headers)
    const group = await getFirstGroup(request, space.id, headers)
    let itemId
    try {
      await loginPage(page)

      const groupHeading = page.locator('[data-item-group]').filter({ hasText: group.title }).first()
      await expect(groupHeading).toBeVisible()
      await groupHeading.getByTitle(/add/i).click()

      const modal = page.getByRole('dialog').last()
      await modal.getByPlaceholder('Please Input').first().fill('UI Item')
      await modal.getByRole('textbox', { name: 'http(s)://', exact: true }).fill('https://example.com/ui-item')
      await modal.getByPlaceholder(/LAN mode/i).fill('http://lan/ui-item')
      await modal.getByPlaceholder('Please Input').last().fill('created by UI')
      await modal.locator('input[type="radio"][value="1"]').check({ force: true })
      await modal.locator('input[type="text"]').nth(2).fill('UI')
      const createResponse = page.waitForResponse(response => response.url().includes(`/api/spaces/${space.id}/items`) && response.request().method() === 'POST' && !response.url().includes('with-icon'))
      await modal.getByRole('button', { name: /save/i }).click()
      const createBody = await (await createResponse).json()
      expect(createBody.code, createBody.msg).toBe(0)
      await expect(modal).toBeHidden()
      await page.reload({ waitUntil: 'networkidle' })

      const items = await (await request.get(`/api/spaces/${space.id}/items?page=1&pageSize=200`, { headers })).json()
      const created = createBody.data
      expect(created.title).toBe('UI Item')
      itemId = created.id
      expect(created.icon.itemType).toBe(1)

      const updateResponse = await request.post(`/api/spaces/${space.id}/items/${itemId}/update`, { headers, data: { ...created, description: 'updated by API' } })
      const updateBody = await updateResponse.json(); expect(updateBody.code, updateBody.msg).toBe(0)
      const afterUpdate = await (await request.get(`/api/spaces/${space.id}/items?groupId=${created.itemIconGroupId}&page=1&pageSize=200`, { headers })).json()
      expect(afterUpdate.data.find(item => item.id === itemId).description).toBe('updated by API')
      await deleteItem(request, space.id, itemId, headers)
      const deleted = await (await request.get(`/api/spaces/${space.id}/items?groupId=${created.itemIconGroupId}&page=1&pageSize=200`, { headers })).json()
      expect(deleted.data.find(item => item.id === itemId)).toBeUndefined()
      itemId = undefined
    } finally {
      if (itemId) await deleteItem(request, space.id, itemId, headers)
    }
  })

  test('preserves all manual fields and stores a multipart icon', async ({ request }) => {
    const user = await login(request); const headers = authHeaders(user)
    const space = await createSpace(request, headers); const group = await getFirstGroup(request, space.id, headers)
    const item = { title: 'Multipart E2E', url: 'https://example.com', lanUrl: 'http://lan', description: 'all fields', openMethod: 1, itemIconGroupId: group.id }
    const response = await request.post(`/api/spaces/${space.id}/items/with-icon`, { headers, multipart: { item: JSON.stringify(item), imgfile: { name: 'icon.png', mimeType: 'image/png', buffer: png } } })
    const body = await response.json(); expect(body.code, body.msg).toBe(0)
    expect(body.data).toMatchObject(item)
    expect(body.data.icon).toMatchObject({ itemType: 2, fileName: sha256File(png), src: expect.stringContaining(sha256File(png)) })
    const image = await request.get(body.data.icon.src); expect(image.ok()).toBeTruthy(); expect((await image.body()).length).toBeGreaterThan(0)
    await deleteItem(request, space.id, body.data.id, headers)
  })
})
