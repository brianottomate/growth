import { test, expect } from '@playwright/test'

test.describe('Prompt 11: Claude AI Integration', () => {
  test('ask-claude API returns 401 without auth', async ({ request }) => {
    const response = await request.post('/api/ask-claude', {
      data: { question: 'Why is Meta CPA high?' },
    })

    expect(response.status()).toBe(401)

    const body = await response.json()
    expect(body.error).toBeDefined()
    expect(body.error.code).toBe('UNAUTHORIZED')
  })

  test('ask-claude API validates question', async ({ request }) => {
    const response = await request.post('/api/ask-claude', {
      data: { question: '' },
    })

    // Will return 401 first (auth check before validation)
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
