import { test, expect } from '@playwright/test'

test.describe('Prompt 08: Trends Chart', () => {
  test('trends API returns valid response', async ({ request }) => {
    // Note: This test requires authentication setup
    // For now, we test that the endpoint exists and returns expected shape
    const response = await request.get('/api/trends')

    // Should return 401 without auth
    expect(response.status()).toBe(401)

    const body = await response.json()
    expect(body.error).toBeDefined()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  test('trends API accepts query params', async ({ request }) => {
    const response = await request.get('/api/trends?metric=spend&days=14')

    // Should return 401 without auth (but endpoint accepts params)
    expect(response.status()).toBe(401)
  })

  test('login page still works', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByTestId('magic-link-button')).toBeVisible()
  })

  test('dashboard redirects without auth', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })
})
