import { test as setup, type Page } from '@playwright/test'
import { E2E_USERS, E2E_PASSWORD, AUTH } from './constants'

async function login(page: Page, email: string, statePath: string) {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(E2E_PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  // Successful sign-in redirects away from /login to the role's default path.
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
  await page.context().storageState({ path: statePath })
}

setup('authenticate platform_admin', async ({ page }) => {
  await login(page, E2E_USERS.platform_admin, AUTH.platform_admin)
})

setup('authenticate company_admin', async ({ page }) => {
  await login(page, E2E_USERS.company_admin, AUTH.company_admin)
})

setup('authenticate scanner', async ({ page }) => {
  await login(page, E2E_USERS.scanner, AUTH.scanner)
})
