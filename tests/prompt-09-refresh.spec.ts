import { test, expect } from '@playwright/test'

test.describe('Prompt 09: Data Refresh System', () => {
  test('refresh API returns 401 without auth', async ({ request }) => {
    const response = await request.post('/api/refresh')

    expect(response.status()).toBe(401)

    const body = await response.json()
    expect(body.error).toBeDefined()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  test('refresh status API returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/refresh/status')

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
})
