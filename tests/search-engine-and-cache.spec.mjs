import { test, expect } from './isolated-fixture.mjs'
import { authHeaders, createSharedSpace, getSpaces, login } from './helpers.mjs'

async function isolatedLogin(service, playwright) {
  const request = await playwright.request.newContext({ baseURL: service.url })
  const user = await login(request, {
    mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com',
    password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com',
  })
  return { request, user, headers: authHeaders(user) }
}

const google = {
  currentSearchEngine: {
    iconSrc: '/assets/search_engine_svg/google.svg',
    title: 'Google',
    url: 'https://www.google.com/search?q=%s',
  },
}

const baidu = {
  currentSearchEngine: {
    iconSrc: '/assets/search_engine_svg/baidu.svg',
    title: 'Baidu',
    url: 'https://www.baidu.com/s?wd=%s',
  },
}

test('search engine defaults are isolated per space and paired space cache is reused', async ({ isolated, playwright, page }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY and YIN_PANEL_TEST_WEB_DIR')
  const { request, headers } = await isolatedLogin(isolated, playwright)
  try {
    const spaceName = `E2E search cache ${Date.now()}`
    await createSharedSpace(request, headers, spaceName)
    const spaces = await getSpaces(request, headers)
    const yin = spaces.find(value => value.name === spaceName)
    expect(yin).toBeTruthy()
    expect(yin.pairedSpaceId).toBeTruthy()
    const yangId = yin.pairedSpaceId

    const saveYin = await request.post(`/api/spaces/${yin.id}/search-config`, { headers, data: google })
    expect(saveYin.ok()).toBeTruthy()
    expect((await saveYin.json()).code).toBe(0)
    const saveYang = await request.post(`/api/spaces/${yangId}/search-config`, { headers, data: baidu })
    expect(saveYang.ok()).toBeTruthy()
    expect((await saveYang.json()).code).toBe(0)

    const yinConfig = await request.get(`/api/spaces/${yin.id}/search-config`, { headers })
    const yangConfig = await request.get(`/api/spaces/${yangId}/search-config`, { headers })
    expect((await yinConfig.json()).data.currentSearchEngine.title).toBe('Google')
    expect((await yangConfig.json()).data.currentSearchEngine.title).toBe('Baidu')

    await page.addInitScript(() => localStorage.clear())
    let yangGroupRequests = 0
    page.on('request', requestEvent => {
      if (requestEvent.url().includes(`/api/spaces/${yangId}/groups`))
        yangGroupRequests++
    })
    await page.goto(`${isolated.url}/login`)
    await page.getByPlaceholder(/email|username/i).fill(process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com')
    await page.getByPlaceholder(/password/i).fill(process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com')
    await page.getByRole('button', { name: /login/i }).click()
    await expect(page).toHaveURL(/\/$/)

    const spaceSelector = page.locator('.space-status-button')
    await spaceSelector.hover()
    await page.locator('.n-dropdown-menu:visible').last().getByText(spaceName, { exact: true }).click()
    const logo = page.locator('.logo')
    await expect(logo).toContainText('Yin-Panel')
    await logo.click()
    await expect(logo).toContainText('Yang-Panel')
    await expect.poll(() => yangGroupRequests).toBeGreaterThan(0)

    const requestsAfterFirstYangLoad = yangGroupRequests
    await logo.click()
    await expect(logo).toContainText('Yin-Panel')
    await logo.click()
    await expect(logo).toContainText('Yang-Panel')
    await page.waitForTimeout(500)
    expect(yangGroupRequests).toBe(requestsAfterFirstYangLoad)
  } finally {
    await request.dispose()
  }
})
