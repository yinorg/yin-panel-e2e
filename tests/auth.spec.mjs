import { test, expect } from '@playwright/test'
import { loginPage } from './helpers.mjs'

test('rejects invalid credentials and logs in with the test account', async ({ page }) => {
  await page.goto('/login')
  await page.getByPlaceholder(/email|username/i).fill(process.env.YIN_PANEL_TEST_USER)
  await page.getByPlaceholder(/password/i).fill('definitely-wrong-password')
  await page.getByRole('button', { name: /login/i }).click()
  await expect(page).toHaveURL(/\/login$/)
  await loginPage(page)
  await expect(page.locator('.space-status-bar')).toBeVisible()
})
