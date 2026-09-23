import { expect, test } from './isolated-fixture.mjs'

const adminCredentials = {
  mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com',
  password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com',
}

async function openStyleSettings(page) {
  await page.getByTestId('system-settings-button').click()
  if (await page.evaluate(() => window.innerWidth < 640))
    await page.getByText('System Settings', { exact: true }).click()
  await page.getByText('Style Settings', { exact: true }).click()
}

test('login and theme settings match approved visual baselines', async ({ isolated, page, playwright }, testInfo) => {
  test.skip(!isolated, 'set YIN_PANEL_TEST_BINARY, YIN_PANEL_TEST_WEB_DIR, and YIN_PANEL_TEST_LANG_DIR')
  const request = await playwright.request.newContext({ baseURL: isolated.url })
  try {
    await page.goto(`${isolated.url}/login`)
    await expect(page.getByPlaceholder(/email|username/i)).toBeVisible()
    await expect(page).toHaveScreenshot(`theme-login-${testInfo.project.name}.png`, {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.002,
    })

    const login = await request.post('/api/login', { data: adminCredentials })
    const body = await login.json()
    expect(body.code, body.msg).toBe(0)
    await page.goto(`${isolated.url}/login`)
    await page.getByPlaceholder(/email|username/i).fill(adminCredentials.mail)
    await page.getByPlaceholder(/password/i).fill(adminCredentials.password)
    await page.getByRole('button', { name: /login/i }).click()
    await expect(page).toHaveURL(`${isolated.url}/`)
    await openStyleSettings(page)
    await expect(page.getByText('Theme library', { exact: true })).toBeVisible()
    await page.getByText(/welcome back/i).waitFor({ state: 'hidden' })
    await expect(page).toHaveScreenshot(`theme-settings-${testInfo.project.name}.png`, {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.002,
    })
  }
  finally {
    await request.dispose()
  }
})
