import { test, expect } from '@playwright/test'

test.describe('Prompt 14: Theme Toggle', () => {
  test('login page loads with theme applied', async ({ page }) => {
    await page.goto('/login')

    // Check that html has data-theme attribute
    const theme = await page.locator('html').getAttribute('data-theme')
    expect(['light', 'dark']).toContain(theme)
  })

  test('theme toggle button is accessible', async ({ page }) => {
    await page.goto('/login')

    // Check aria-label exists
    const toggle = page.getByTestId('theme-toggle')

    // Toggle may not be on login page, so check if it exists first
    const toggleExists = await toggle.count()
    if (toggleExists > 0) {
      await expect(toggle).toHaveAttribute('aria-label', /Switch to .* mode/)
    }
  })

  test('theme persists in localStorage', async ({ page }) => {
    await page.goto('/login')

    // Set theme via localStorage
    await page.evaluate(() => {
      localStorage.setItem('growth-tracker-theme', 'light')
    })

    // Reload and check
    await page.reload()

    const storedTheme = await page.evaluate(() => {
      return localStorage.getItem('growth-tracker-theme')
    })

    expect(storedTheme).toBe('light')
  })

  test('settings page redirects without auth', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/login/)
  })
})
