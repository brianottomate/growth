import { test, expect } from '@playwright/test'

test.describe('Prompt 01: Project Scaffolding', () => {
  test('page loads successfully', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toContainText('Growth Tracker')
    await expect(page.locator('p')).toContainText('Scaffolding complete')
  })

  test('has correct dark theme styles', async ({ page }) => {
    await page.goto('/')
    const body = page.locator('body')
    await expect(body).toHaveCSS('background-color', 'rgb(10, 10, 10)')
    await expect(body).toHaveCSS('color', 'rgb(255, 255, 255)')
  })

  test('Inter font is loaded', async ({ page }) => {
    await page.goto('/')
    const body = page.locator('body')
    const fontFamily = await body.evaluate((el) => window.getComputedStyle(el).fontFamily)
    expect(fontFamily.toLowerCase()).toContain('inter')
  })
})
