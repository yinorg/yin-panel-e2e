import { expect, test } from './isolated-fixture.mjs'
import { authHeaders, deleteItem, login, png } from './helpers.mjs'

const adminCredentials = {
  mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com',
  password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com',
}
const itemTitle = 'Uploaded icon E2E'

async function responseData(response) {
  const body = await response.json()
  expect(body.code, body.msg).toBe(0)
  return body.data
}

test('item editor uploads an icon through Core and creates the bookmark in its Space', async ({ isolated, page, playwright }) => {
  if (!isolated)
    throw new Error('Item editor acceptance requires an isolated Core service')

  const request = await playwright.request.newContext({ baseURL: isolated.url })
  const user = await login(request, adminCredentials)
  const headers = authHeaders(user)
  const spaceName = `Item editor ${Date.now()}`
  await responseData(await request.post('/api/spaces/teams', { headers, data: { name: spaceName } }))
  const spaces = await responseData(await request.get('/api/spaces', { headers }))
  const space = spaces.find(value => value.name === spaceName && value.side === 'yin')
  expect(space, 'created Team Space should be selectable').toBeTruthy()
  await responseData(await request.post('/api/panel/userConfig/setConfig', {
    headers,
    data: { panel: { homeLayout: 'standard', systemMonitorShow: false } },
  }))
  const group = await responseData(await request.post(`/api/spaces/${space.id}/groups`, {
    headers,
    data: { title: 'Upload target group' },
  }))
  let itemId

  try {
    await page.addInitScript(({ token, userInfo, cachedSpace }) => {
      sessionStorage.setItem('yin-theme-safe-mode', '1')
      localStorage.setItem('authStorage', JSON.stringify({ data: { token, userInfo }, expire: null }))
      localStorage.setItem(`yin-panel-spaces-cache:${userInfo.id}`, JSON.stringify({ data: [cachedSpace], expire: null }))
    }, {
      token: user.token,
      userInfo: { id: user.userId || user.id, name: user.name, mail: adminCredentials.mail },
      cachedSpace: space,
    })
    await page.goto(isolated.url, { waitUntil: 'domcontentloaded' })
    const spaceButton = page.locator('.space-status-button')
    await expect(spaceButton).toBeVisible()
    await spaceButton.dispatchEvent('mouseenter')
    await page.getByText(spaceName, { exact: true }).click()
    await expect(page.getByRole('button', { name: spaceName })).toBeVisible()
    const groupSection = page.getByTestId('item-group').filter({ hasText: group.title })
    await expect(groupSection).toBeVisible()
    await groupSection.hover()
    await groupSection.getByTitle(/add|添加/i).click()

    const modal = page.getByTestId('edit-item-modal')
    await expect(modal).toBeVisible()
    await modal.getByRole('textbox').nth(0).fill(itemTitle)
    await modal.getByRole('textbox').nth(1).fill('https://example.test/uploaded-icon')
    await modal.getByText(/image|图片/i, { exact: true }).click()

    const uploadResponse = page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname.endsWith('/file/uploadImg') && response.request().method() === 'POST'
    })
    await modal.locator('input[type="file"]').setInputFiles({
      name: 'item-editor.png',
      mimeType: 'image/png',
      buffer: png,
    })
    expect((await uploadResponse).ok()).toBeTruthy()

    await page.getByRole('dialog').getByRole('button', { name: /save|保存/i }).click()
    await expect(page.getByTestId('home-item').filter({ hasText: itemTitle })).toBeVisible()

    const items = await responseData(await request.get(`/api/spaces/${space.id}/items?groupId=${group.id}&page=1&pageSize=50`, { headers }))
    const saved = items.find(item => item.title === itemTitle)
    expect(saved, 'uploaded bookmark should persist in the selected Space').toBeTruthy()
    expect(saved.icon.itemType).toBe(2)
    expect(saved.icon.src).toMatch(/\.png$/)
    itemId = saved.id
  }
  finally {
    if (itemId) await deleteItem(request, space.id, itemId, headers)
    await request.delete(`/api/spaces/${space.id}/groups/${group.id}`, { headers }).catch(() => {})
    await request.delete(`/api/spaces/${space.id}`, { headers }).catch(() => {})
    await request.dispose()
  }
})
