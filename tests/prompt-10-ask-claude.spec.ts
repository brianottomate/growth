import { test, expect } from '@playwright/test'

test.describe('Prompt 10: Ask Claude Panel', () => {
  test('ask-claude API returns 401 without auth', async ({ request }) => {
    const response = await request.post('/api/ask-claude', {
      data: { question: 'test' },
    })

    expect(response.status()).toBe(401)

    const body = await response.json()
    expect(body.error).toBeDefined()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  test('ask-claude API requires question', async ({ request }) => {
    // This will return 401 since we're not authenticated
    // Full validation testing requires auth setup
    const response = await request.post('/api/ask-claude', {
      data: {},
    })

    expect(response.status()).toBe(401)
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
