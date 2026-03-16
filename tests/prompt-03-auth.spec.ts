import { test, expect } from '@playwright/test'

test.describe('Prompt 03: Authentication (Magic Link)', () => {
  test('login page renders correctly', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/login')

    // Check page content
    await expect(page.getByText('Growth Tracker')).toBeVisible()
    await expect(page.getByText('Sign in to continue')).toBeVisible()
    await expect(page.getByTestId('email-input')).toBeVisible()
    await expect(page.getByTestId('magic-link-button')).toBeVisible()
    await expect(page.getByText('Send Magic Link')).toBeVisible()
    await expect(page.getByText('@wander.com employees')).toBeVisible()

    // No console errors
    expect(errors).toHaveLength(0)
  })

  test('protected route redirects to login', async ({ page }) => {
    // Try to access dashboard without auth
    await page.goto('/dashboard')

    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/)

    // Should have next parameter
    expect(page.url()).toContain('next=%2Fdashboard')
  })

  test('login page shows success message when magic link sent', async ({ page }) => {
    await page.goto('/login?sent=true')

    // Success message should be visible
    await expect(page.getByTestId('magic-link-sent')).toBeVisible()
    await expect(page.getByText('Check your email')).toBeVisible()
  })

  test('email input validates @wander.com domain', async ({ page }) => {
    await page.goto('/login')

    // Enter a non-wander email
    await page.getByTestId('email-input').fill('test@gmail.com')
    await page.getByTestId('magic-link-button').click()

    // Should show error
    await expect(page.getByTestId('form-error')).toBeVisible()
    await expect(page.getByText('@wander.com email')).toBeVisible()
  })

  test('auth error page shows domain restriction message', async ({ page }) => {
    await page.goto('/auth/error?reason=invalid_domain')

    // Domain restriction message should be visible
    await expect(page.getByTestId('auth-error-card')).toBeVisible()
    await expect(page.getByTestId('auth-error-title')).toContainText('Access Restricted')
    await expect(page.getByTestId('auth-error-description')).toContainText('@wander.com')
    await expect(page.getByTestId('try-again-button')).toBeVisible()
  })

  test('magic link button is disabled when email is empty', async ({ page }) => {
    await page.goto('/login')

    const button = page.getByTestId('magic-link-button')
    await expect(button).toBeDisabled()

    // Fill in email
    await page.getByTestId('email-input').fill('test@wander.com')
    await expect(button).toBeEnabled()
  })

  test('auth error page has try again link', async ({ page }) => {
    await page.goto('/auth/error?reason=auth_failed')

    const tryAgainButton = page.getByTestId('try-again-button')
    await expect(tryAgainButton).toBeVisible()
    await expect(tryAgainButton).toHaveAttribute('href', '/login')
  })
})
