import { expect, test } from './isolated-fixture.mjs'
import { authHeaders } from './helpers.mjs'

const adminCredentials = {
  mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com',
  password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com',
}

async function responseData(response) {
  const body = await response.json()
  expect(body.code, body.msg).toBe(0)
  return body.data
}

async function login(request, credentials) {
  return responseData(await request.post('/api/login', { data: credentials }))
}

async function loginPage(page, baseURL, credentials) {
  await page.goto(`${baseURL}/login`)
  await page.getByPlaceholder(/email|username/i).fill(credentials.mail)
  await page.getByPlaceholder(/password/i).fill(credentials.password)
  await page.getByRole('button', { name: /login/i }).click()
  await expect(page).toHaveURL(`${baseURL}/`)
}

/**
 * The theme renders the Core's own pages through the component bridge, and an
 * action taken on one of those pages reaches the Core.
 *
 * Covered:
 * - every Core page renders its bridged custom element (`<yin-user-info>`, …);
 * - the app hub is the entry point and opens each page;
 * - a space created on the theme-rendered space page refreshes the Core's own
 *   snapshot, proven by a client-side navigation to the theme page (no reload).
 */
test('the theme renders the Core pages, and their events reach the Core', async ({ isolated, playwright, page }) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  let headers
  let createdSpaceId
  const spaceName = `E2E theme surface ${Date.now()}`
  try {
    const admin = await login(request, adminCredentials)
    headers = authHeaders(admin)
    await loginPage(page, isolated.url, adminCredentials)

    // 1. Every Core page renders the Core's component through the bridge.
    for (const [name, testid, tag] of [
      ['user-info', 'theme-user-info-view-core', 'yin-user-info'],
      ['space-manage', 'theme-space-manage-view-core', 'yin-space-manage'],
      ['users', 'theme-users-view-core', 'yin-users'],
      ['about', 'theme-about-view-core', 'yin-about'],
      ['theme-settings', 'theme-settings-view-core', 'yin-style'],
    ]) {
      await page.goto(`${isolated.url}/theme/${name}`)
      const element = page.locator(`[data-testid="${testid}"]`)
      await expect(element).toHaveCount(1)
      expect(await element.evaluate(node => node.tagName.toLowerCase())).toBe(tag)
    }

    // 2. The app hub is the entry point; an entry opens its page.
    await page.goto(`${isolated.url}/`)
    await page.getByTestId('theme-open-apps').click()
    await expect(page).toHaveURL(`${isolated.url}/theme/apps`)
    await page.getByTestId('theme-apps-user-info').click()
    await expect(page).toHaveURL(`${isolated.url}/theme/user-info`)

    // 3. A space created on the theme-rendered page reaches the Core: after a
    //    client-side navigation to the theme page (no reload), the Core's own
    //    snapshot already lists it.
    await page.goto(`${isolated.url}/theme/space-manage`)
    await page.getByTestId('theme-space-manage-view-core').getByRole('button', { name: /create new space|创建新空间/i }).click()
    const dialog = page.locator('.n-modal-container').filter({ has: page.locator('input') })
    await dialog.locator('input').first().fill(spaceName)
    await dialog.getByRole('button', { name: /confirm|确定/i }).click()
    await expect(dialog.locator('input').first()).toHaveCount(0)

    await page.getByTestId('theme-space-manage-view-back').click()
    await expect(page).toHaveURL(`${isolated.url}/`)
    await page.getByTestId('theme-open-page').click()
    await expect(page).toHaveURL(`${isolated.url}/theme/theme-page`)
    await expect(page.getByTestId('theme-surface-page-host')).toContainText(spaceName)

    const spaces = await responseData(await request.get('/api/spaces', { headers }))
    createdSpaceId = spaces.find(space => space.name === spaceName)?.id
    expect(createdSpaceId, 'the space was created').toBeTruthy()
  }
  finally {
    if (createdSpaceId)
      await request.delete(`/api/spaces/${createdSpaceId}`, { headers })
  }
})
