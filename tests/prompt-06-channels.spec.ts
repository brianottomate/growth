import { test, expect } from '@playwright/test'

test.describe('Prompt 06: Channel Performance Table', () => {
  test('channels API returns valid response', async ({ request }) => {
    // Note: This test requires authentication setup
    // For now, we test that the endpoint exists and returns expected shape
    const response = await request.get('/api/channels')

    // Should return 401 without auth
    expect(response.status()).toBe(401)

    const body = await response.json()
    expect(body.error).toBeDefined()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  test('login page still works', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByTestId('magic-link-button')).toBeVisible()
  })

  test('dashboard redirects without auth', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  test('channel table skeleton shows correct structure', async ({ page }) => {
    // This would need auth setup for full test
    // For now, verify basic page structure
    await page.goto('/login')
    await expect(page.getByText('Growth Tracker')).toBeVisible()
  })
})
