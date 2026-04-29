import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()
const mockInviteUser = vi.fn()
const mockUpdateUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({
    from: mockFromService,
    auth: { admin: { inviteUserByEmail: mockInviteUser, updateUserById: mockUpdateUser } },
  }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['users:manage']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/team/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/team/invite', () => {
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
    const { POST } = await import('@/app/api/team/invite/route')
    const res = await POST(makeRequest({ email: 'x@x.com', role_name: 'scanner' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when role lacks users:manage', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)
    const { POST } = await import('@/app/api/team/invite/route')
    const res = await POST(makeRequest({ email: 'x@x.com', role_name: 'scanner' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when email missing', async () => {
    const { POST } = await import('@/app/api/team/invite/route')
    const res = await POST(makeRequest({ role_name: 'scanner' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when role_name invalid', async () => {
    const { POST } = await import('@/app/api/team/invite/route')
    const res = await POST(makeRequest({ email: 'x@x.com', role_name: 'superuser' }))
    expect(res.status).toBe(400)
  })

  it('invites user, sets app_metadata, inserts user_company_roles', async () => {
    mockFromService.mockImplementation((table: string) => {
      if (table === 'roles') {
        return { select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'role-scanner' }, error: null }) }) }) }) }
      }
      return { insert: () => Promise.resolve({ error: null }) }
    })
    mockInviteUser.mockResolvedValue({ data: { user: { id: 'new-user-1' } }, error: null })
    mockUpdateUser.mockResolvedValue({ data: {}, error: null })

    const { POST } = await import('@/app/api/team/invite/route')
    const res = await POST(makeRequest({ email: 'scanner@co.com', role_name: 'scanner' }))

    expect(res.status).toBe(200)
    expect(mockInviteUser).toHaveBeenCalledWith('scanner@co.com', expect.any(Object))
    expect(mockUpdateUser).toHaveBeenCalledWith('new-user-1', {
      app_metadata: { company_id: 'co-1', role_id: 'role-scanner', role_name: 'scanner' },
    })
  })
})
