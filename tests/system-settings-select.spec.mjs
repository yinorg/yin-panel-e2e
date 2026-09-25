import { expect, test } from './isolated-fixture.mjs'

const credentials = {
  mail: process.env.YIN_PANEL_TEST_ADMIN_USER || 'admin@yiniot.com',
  password: process.env.YIN_PANEL_TEST_ADMIN_PASSWORD || 'admin@yiniot.com',
}

const reportedXPath = '/html/body/div[4]/div[2]/div/div[1]/div/div[2]/div[2]/div/div/div/div/div/div/div/div/div/div/div/div/div[1]/div/div[5]/div[2]/div/div/div[1]'

test('system settings select renders options and changes home layout', async ({ isolated, page }, testInfo) => {
  if (!isolated)
    throw new Error('Select acceptance requires an isolated Core service')

  await page.goto(`${isolated.url}/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="text"]').fill(credentials.mail)
  await page.locator('input[type="password"]').fill(credentials.password)
  await page.getByRole('button', { name: /login|登录/i }).click()
  await expect(page).toHaveURL(`${isolated.url}/`)

  await page.getByTestId('system-settings-button').click()
  await page.getByText(/Style Settings|样式设置/i, { exact: true }).click()
  await page.getByText(/Theme library|主题库/i, { exact: true }).waitFor()

  const layoutSelect = page.getByText(/Home layout|首页布局/i, { exact: true }).first()
    .locator('..').locator('.n-base-selection')
  await layoutSelect.scrollIntoViewIfNeeded()
  const before = (await layoutSelect.textContent()).trim()
  await layoutSelect.click()

  const menu = page.locator('.n-base-select-menu:visible')
  await expect(menu).toBeVisible()
  await page.waitForFunction(() => {
    const element = document.querySelector('.n-base-select-menu')
    return element && getComputedStyle(element).opacity === '1'
  })
  const options = menu.locator('.n-base-select-option')
  await expect(options).toHaveCount(2)
  const option = options.nth(1)
  await expect(option).toBeVisible()

  const menuStyle = await menu.evaluate(element => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return {
      display: style.display,
      visibility: style.visibility,
      opacity: Number(style.opacity),
      backgroundColor: style.backgroundColor,
      zIndex: Number(style.zIndex),
      width: rect.width,
      height: rect.height,
    }
  })
  expect(menuStyle.display).not.toBe('none')
  expect(menuStyle.visibility).toBe('visible')
  expect(menuStyle.opacity).toBeGreaterThan(0)
  expect(menuStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(menuStyle.zIndex).toBeGreaterThanOrEqual(2001)
  expect(menuStyle.height).toBeGreaterThan(8)

  const reportedNode = page.locator(`xpath=${reportedXPath}`)
  const reportedXPathCount = await reportedNode.count()
  if (reportedXPathCount)
    await expect(reportedNode).toBeVisible()
  await testInfo.attach('reported-xpath-probe', {
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify({ xpath: reportedXPath, count: reportedXPathCount })),
  })

  await option.click()
  await expect(menu).toHaveCount(0)
  await expect(layoutSelect).not.toHaveText(before)
})
