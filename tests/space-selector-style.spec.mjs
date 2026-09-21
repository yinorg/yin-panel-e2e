import { test, expect } from '@playwright/test'
import { authHeaders, getSpaces, loginPage, login } from './helpers.mjs'

test('space selector uses the translucent dark theme and switches spaces', async ({ request, page }) => {
  test.skip(!process.env.YIN_PANEL_URL, 'YIN_PANEL_URL is not configured')

  const user = await login(request)
  const spaces = await getSpaces(request, authHeaders(user))
  expect(spaces.length, 'test account has no spaces').toBeGreaterThan(0)

  await loginPage(page)
  const statusBar = page.locator('.space-status-bar')
  const selector = page.locator('.space-status-button')
  await expect(statusBar).toBeVisible()
  await expect(selector).toBeVisible()

  await selector.hover()
  const menu = page.locator('.n-dropdown-menu:visible').last()
  await expect(menu).toBeVisible()

  const menuStyle = await menu.evaluate(element => {
    const style = getComputedStyle(element)
    return {
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      boxShadow: style.boxShadow,
    }
  })
  expect(menuStyle.backgroundColor).not.toBe('rgb(255, 255, 255)')
  expect(menuStyle.backgroundColor).toMatch(/rgba\(18, 22, 28, 0\.72\)|rgb\(18, 22, 28\)/)
  expect(menuStyle.borderRadius).toBe('10px')
  expect(menuStyle.boxShadow).not.toBe('none')

  const options = menu.locator('.n-dropdown-option')
  await expect(options).toHaveCount(Math.max(spaces.length - 1, 0))

  if (spaces.length > 1) {
    const currentLabel = (await selector.innerText()).replace('⌄', '').trim()
    expect(await options.allInnerTexts()).not.toContain(currentLabel)

    const option = options.first()
    const optionLabel = option.locator('.n-dropdown-option-body__label')
    const optionStyle = await optionLabel.evaluate(element => {
      const style = getComputedStyle(element)
      return { color: style.color, backgroundColor: style.backgroundColor }
    })
    expect(optionStyle.color).toMatch(/rgb\(255, 255, 255\)|rgba\(255, 255, 255, 0\.92\)/)
    await option.hover()
    const hoverColor = await option.evaluate(element => getComputedStyle(element).getPropertyValue('--n-option-color-hover').trim())
    expect(hoverColor).toMatch(/rgba\(255, 255, 255, 0\.14\)|rgb\(255, 255, 255\)/)

    const targetOption = options.first()
    const targetLabel = (await targetOption.innerText()).trim()
    await targetOption.click()
    await expect(menu).toBeHidden()
    await expect(selector).toContainText(targetLabel)
  }
})

test('floating action buttons clear mouse focus after click', async ({ request, page }) => {
  test.skip(!process.env.YIN_PANEL_URL, 'YIN_PANEL_URL is not configured')

  const user = await login(request)
  expect((await getSpaces(request, authHeaders(user))).length, 'test account has no spaces').toBeGreaterThan(0)

  await loginPage(page)
  const floating = page.locator('.fixed-element .n-button')
  expect(await floating.count()).toBeGreaterThan(0)

  for (const testId of ['floating-top-button', 'floating-wan-button', 'floating-lan-button', 'system-settings-button']) {
    const button = page.getByTestId(testId)
    if (await button.count() === 0) continue
    await button.click()
    expect(await page.evaluate(() => document.activeElement?.closest('.fixed-element .n-button') === null)).toBe(true)
    await page.mouse.move(0, 0)
    expect(await page.evaluate(() => document.activeElement?.closest('.fixed-element .n-button') === null)).toBe(true)
  }
})
