import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()
const mockUpdateUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({
    from: mockFromService,
    auth: { admin: { updateUserById: mockUpdateUser } },
  }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['users:manage']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

function makeRequest(userId: string) {
  return new NextRequest(`http://localhost/api/team/members/${userId}`, { method: 'DELETE' })
}

describe('DELETE /api/team/members/[userId]', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'admin-1',
          app_metadata: { company_id: 'co-1', role_id: 'role-admin', role_name: 'company_admin' },
        },
      },
    })
  })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { DELETE } = await import('@/app/api/team/members/[userId]/route')
    const res = await DELETE(makeRequest('u-1'), { params: Promise.resolve({ userId: 'u-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 when trying to remove yourself', async () => {
    const { DELETE } = await import('@/app/api/team/members/[userId]/route')
    const res = await DELETE(makeRequest('admin-1'), { params: Promise.resolve({ userId: 'admin-1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/yourself/i)
  })

  it('returns 401 when app_metadata is missing company_id', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', app_metadata: { role_id: 'r-1' } } },
    })
    const { DELETE } = await import('@/app/api/team/members/[userId]/route')
    const res = await DELETE(makeRequest('u-2'), { params: Promise.resolve({ userId: 'u-2' }) })
    expect(res.status).toBe(401)
  })

  it('returns 403 when missing users:manage permission', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)
    const { DELETE } = await import('@/app/api/team/members/[userId]/route')
    const res = await DELETE(makeRequest('u-2'), { params: Promise.resolve({ userId: 'u-2' }) })
    expect(res.status).toBe(403)
  })

  it('returns 500 when delete from user_company_roles fails', async () => {
    mockFromService.mockReturnValue({
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: { message: 'db error' } }) }) }),
    })
    const { DELETE } = await import('@/app/api/team/members/[userId]/route')
    const res = await DELETE(makeRequest('u-2'), { params: Promise.resolve({ userId: 'u-2' }) })
    expect(res.status).toBe(500)
  })

  it('removes user from user_company_roles and clears app_metadata', async () => {
    mockFromService.mockReturnValue({
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    })
    mockUpdateUser.mockResolvedValue({ data: {}, error: null })

    const { DELETE } = await import('@/app/api/team/members/[userId]/route')
    const res = await DELETE(makeRequest('u-2'), { params: Promise.resolve({ userId: 'u-2' }) })

    expect(res.status).toBe(200)
    expect(mockUpdateUser).toHaveBeenCalledWith('u-2', { app_metadata: {} })
  })
})
