import { describe, it, expect } from 'vitest'
import { defaultPathForRole } from '@/lib/auth/default-path'

describe('defaultPathForRole', () => {
  it('routes scanner to the campaigns list', () => {
    expect(defaultPathForRole('scanner')).toBe('/scan/campaigns')
  })
  it('routes platform_admin to the platform home', () => {
    expect(defaultPathForRole('platform_admin')).toBe('/platform')
  })
  it('routes company_admin to /admin', () => {
    expect(defaultPathForRole('company_admin')).toBe('/admin')
  })
  it('defaults unknown/undefined role to /admin', () => {
    expect(defaultPathForRole(undefined)).toBe('/admin')
    expect(defaultPathForRole('mystery')).toBe('/admin')
  })
})
