import { test, expect } from '@playwright/test'

test.describe('Prompt 13: Settings Page', () => {
  test('settings API returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/settings')

    expect(response.status()).toBe(401)

    const body = await response.json()
    expect(body.error).toBeDefined()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  test('settings update API returns 401 without auth', async ({ request }) => {
    const response = await request.put('/api/settings', {
      data: { emailInsightsDigest: false },
    })

    expect(response.status()).toBe(401)
  })

  test('login page still works', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByTestId('magic-link-form')).toBeVisible()
  })

  test('settings page redirects without auth', async ({ page }) => {
    await page.goto('/settings')
    await expect(page).toHaveURL(/\/login/)
  })
})
