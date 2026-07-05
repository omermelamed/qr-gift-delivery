import { test, expect } from '@playwright/test'

test.describe('landing page', () => {
  test('renders the marketing page for anonymous visitors', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/') // no redirect to /login
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Gift day')
    await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible()
  })

  test('contact form submits and shows the success state', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Full name').fill('Playwright Test')
    await page.getByLabel('Company').fill('E2E Corp')
    await page.getByLabel('Work email').fill('e2e@example.com')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText("Thanks! We'll be in touch within one business day.")).toBeVisible()
  })
})
