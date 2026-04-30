import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockGetUserById = vi.fn()
const mockInviteUser = vi.fn()
const mockFromService = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({
    from: mockFromService,
    auth: { admin: { getUserById: mockGetUserById, inviteUserByEmail: mockInviteUser } },
  }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['users:manage']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/team/resend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/team/resend', () => {
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
    const { POST } = await import('@/app/api/team/resend/route')
    const res = await POST(makeRequest({ userId: 'u-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when role lacks users:manage', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)
    const { POST } = await import('@/app/api/team/resend/route')
    const res = await POST(makeRequest({ userId: 'u-1' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when userId missing', async () => {
    const { POST } = await import('@/app/api/team/resend/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 404 when user not found', async () => {
    mockGetUserById.mockResolvedValue({ data: { user: null }, error: { message: 'not found' } })
    const { POST } = await import('@/app/api/team/resend/route')
    const res = await POST(makeRequest({ userId: 'ghost' }))
    expect(res.status).toBe(404)
  })

  it('re-invites user and returns success', async () => {
    mockGetUserById.mockResolvedValue({ data: { user: { id: 'u-1', email: 'user@co.com', app_metadata: { company_id: 'co-1' } } }, error: null })
    mockInviteUser.mockResolvedValue({ data: {}, error: null })
    const { POST } = await import('@/app/api/team/resend/route')
    const res = await POST(makeRequest({ userId: 'u-1' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockInviteUser).toHaveBeenCalledWith('user@co.com', expect.objectContaining({
      redirectTo: expect.stringContaining('/admin'),
    }))
  })
})
