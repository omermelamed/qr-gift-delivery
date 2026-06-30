import { readFileSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { AUTH } from './constants'

/** Navigate and assert the page rendered without a server error or React crash. */
async function expectOk(page: Page, path: string) {
  const resp = await page.goto(path)
  expect(resp?.status(), `HTTP status for ${path}`).toBeLessThan(400)
  await expect(page.locator('text=Application error')).toHaveCount(0)
  await expect(page.locator('text=Unhandled Runtime Error')).toHaveCount(0)
}

test.describe('public (unauthenticated)', () => {
  test('landing and login render', async ({ page }) => {
    await expectOk(page, '/')
    await expectOk(page, '/login')
  })

  test('employee gift page renders', async ({ page }) => {
    let giftToken: string | null = null
    try { giftToken = JSON.parse(readFileSync('e2e/.seed.json', 'utf8')).giftToken } catch { /* not seeded */ }
    test.skip(!giftToken, 'no seeded gift token — run npm run e2e:seed')
    await expectOk(page, `/gift/${giftToken}`)
    await expect(page.getByText('Fresh Token')).toBeVisible()
  })
})

test.describe('platform_admin', () => {
  test.use({ storageState: AUTH.platform_admin })
  for (const path of ['/platform', '/platform/companies', '/platform/activity']) {
    test(`loads ${path}`, async ({ page }) => { await expectOk(page, path) })
  }

  test('company detail renders', async ({ page }) => {
    let companyId: string | null = null
    try { companyId = JSON.parse(readFileSync('e2e/.seed.json', 'utf8')).companyId } catch { /* not seeded */ }
    test.skip(!companyId, 'no seeded company — run npm run e2e:seed')
    await expectOk(page, `/platform/companies/${companyId}`)
  })
})

test.describe('company_admin (HR)', () => {
  test.use({ storageState: AUTH.company_admin })
  const routes = [
    '/admin',
    '/admin/campaigns/new',
    '/admin/employees',
    '/admin/sms/templates',
    '/admin/sms/credits',
    '/admin/team',
    '/admin/settings',
    '/admin/audit',
  ]
  for (const path of routes) {
    test(`loads ${path}`, async ({ page }) => { await expectOk(page, path) })
  }

  test('campaign detail + QR pages render', async ({ page }) => {
    let campaignId: string | null = null
    try { campaignId = JSON.parse(readFileSync('e2e/.seed.json', 'utf8')).campaignId } catch { /* not seeded */ }
    test.skip(!campaignId, 'no seeded campaign — run npm run e2e:seed')
    await expectOk(page, `/admin/campaigns/${campaignId}`)
    await expectOk(page, `/admin/campaigns/${campaignId}/qr`)
  })

  test('large campaign paginates the employee table', async ({ page }) => {
    let bigId: string | null = null
    try { bigId = JSON.parse(readFileSync('e2e/.seed.json', 'utf8')).bigCampaignId } catch { /* not seeded */ }
    test.skip(!bigId, 'no big campaign — run npm run e2e:seed')
    await expectOk(page, `/admin/campaigns/${bigId}`)
    // First page of 50 of 130
    await expect(page.getByText(/Showing 1.30 of 1000/)).toBeVisible()
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText(/Showing 31.60 of 1000/)).toBeVisible()
  })
})

test.describe('scanner (distributor)', () => {
  test.use({ storageState: AUTH.scanner })
  for (const path of ['/scan', '/scan/campaigns']) {
    test(`loads ${path}`, async ({ page }) => { await expectOk(page, path) })
  }
})
