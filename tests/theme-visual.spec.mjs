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
    const selects = page.locator('.n-base-selection')
    await expect(selects.first()).toBeVisible()
    await selects.first().click()
    const selectMenu = page.locator('.n-base-select-menu:visible')
    await expect(selectMenu).toBeVisible()
    await expect(selectMenu.locator('.n-base-select-option').first()).toBeVisible()
    const menuStyle = await selectMenu.evaluate(element => {
      const style = getComputedStyle(element)
      return { display: style.display, visibility: style.visibility, opacity: style.opacity, backgroundColor: style.backgroundColor }
    })
    expect(menuStyle.display).not.toBe('none')
    expect(menuStyle.visibility).toBe('visible')
    expect(Number(menuStyle.opacity)).toBeGreaterThan(0)
    expect(menuStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    await page.keyboard.press('Escape')
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
