import { test, expect } from '@playwright/test'

test.describe('Prompt 12: BigQuery Integration', () => {
  test('metrics API returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/metrics')

    expect(response.status()).toBe(401)

    const body = await response.json()
    expect(body.error).toBeDefined()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  test('metrics summary API returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/metrics/summary')

    expect(response.status()).toBe(401)

    const body = await response.json()
    expect(body.error).toBeDefined()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  test('login page still works', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByTestId('magic-link-form')).toBeVisible()
  })

  test('dashboard redirects without auth', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })
})
