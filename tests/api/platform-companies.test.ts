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

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/platform/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/platform/companies', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'platform-admin-1',
          app_metadata: { role_name: 'platform_admin', company_id: null, role_id: 'r-1' },
        },
      },
    })
  })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('@/app/api/platform/companies/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-platform_admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', app_metadata: { role_name: 'company_admin' } } },
    })
    const { POST } = await import('@/app/api/platform/companies/route')
    const res = await POST(makeRequest({ name: 'Acme', slug: 'acme', adminEmail: 'a@b.com' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when name missing', async () => {
    const { POST } = await import('@/app/api/platform/companies/route')
    const res = await POST(makeRequest({ slug: 'acme', adminEmail: 'a@b.com' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when adminEmail missing', async () => {
    const { POST } = await import('@/app/api/platform/companies/route')
    const res = await POST(makeRequest({ name: 'Acme', slug: 'acme' }))
    expect(res.status).toBe(400)
  })

  it('creates company, invites admin, sets app_metadata, inserts user_company_roles', async () => {
    let insertedUCR: unknown = null

    mockFromService.mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'co-new' }, error: null }) }) }),
        }
      }
      if (table === 'roles') {
        return { select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'role-cadmin' }, error: null }) }) }) }) }
      }
      if (table === 'user_company_roles') {
        return { insert: (row: unknown) => { insertedUCR = row; return Promise.resolve({ error: null }) } }
      }
    })

    mockInviteUser.mockResolvedValue({ data: { user: { id: 'new-admin-1' } }, error: null })
    mockUpdateUser.mockResolvedValue({ data: {}, error: null })

    const { POST } = await import('@/app/api/platform/companies/route')
    const res = await POST(makeRequest({ name: 'Acme Corp', slug: 'acme', adminEmail: 'ceo@acme.com' }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.companyId).toBe('co-new')
    expect(mockInviteUser).toHaveBeenCalledWith('ceo@acme.com', expect.any(Object))
    expect(mockUpdateUser).toHaveBeenCalledWith('new-admin-1', {
      app_metadata: { company_id: 'co-new', role_id: 'role-cadmin', role_name: 'company_admin' },
    })
    expect(insertedUCR).toMatchObject({ user_id: 'new-admin-1', company_id: 'co-new', role_id: 'role-cadmin' })
  })
})
