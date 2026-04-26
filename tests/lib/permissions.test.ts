import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSelect = vi.fn()
const mockEq = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: mockSelect,
    }),
  }),
}))

describe('fetchPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelect.mockReturnValue({
      eq: mockEq,
    })
  })

  it('returns a list of permission names for a role', async () => {
    mockEq.mockResolvedValue({
      data: [
        { permissions: { name: 'campaigns:read' } },
        { permissions: { name: 'campaigns:create' } },
      ],
      error: null,
    })

    const { fetchPermissions } = await import('@/lib/permissions')
    const perms = await fetchPermissions('role-uuid-123')

    expect(perms).toEqual(['campaigns:read', 'campaigns:create'])
  })

  it('returns empty array when role has no permissions', async () => {
    mockEq.mockResolvedValue({ data: [], error: null })

    const { fetchPermissions } = await import('@/lib/permissions')
    const perms = await fetchPermissions('role-uuid-empty')

    expect(perms).toEqual([])
  })

  it('returns empty array on DB error', async () => {
    mockEq.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const { fetchPermissions } = await import('@/lib/permissions')
    const perms = await fetchPermissions('role-uuid-error')

    expect(perms).toEqual([])
  })
})

describe('hasPermission', () => {
  it('returns true when permission is in the list', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    expect(hasPermission(['campaigns:read', 'campaigns:create'], 'campaigns:create')).toBe(true)
  })

  it('returns false when permission is not in the list', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    expect(hasPermission(['tokens:scan'], 'campaigns:create')).toBe(false)
  })

  it('returns false for empty permission list', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    expect(hasPermission([], 'campaigns:read')).toBe(false)
  })
})
