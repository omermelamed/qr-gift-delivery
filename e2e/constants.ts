// Mirrors scripts/seed-e2e.mjs. Keep in sync if the seed users change.
export const E2E_PASSWORD = 'Test1234!'

export const E2E_USERS = {
  platform_admin: 'platform@e2e.test',
  company_admin: 'admin@e2e.test',
  scanner: 'scanner@e2e.test',
} as const

export const AUTH = {
  platform_admin: 'e2e/.auth/platform.json',
  company_admin: 'e2e/.auth/admin.json',
  scanner: 'e2e/.auth/scanner.json',
} as const
