import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()
const mockGetUserById = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({
    from: mockFromService,
    auth: { admin: { getUserById: mockGetUserById } },
  }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['campaigns:launch']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

function adminUser() {
  return {
    data: {
      user: {
        id: 'admin-1',
        app_metadata: { company_id: 'co-1', role_id: 'role-1', role_name: 'company_admin' },
      },
    },
  }
}

describe('GET /api/campaigns/[id]/distributors', () => {
  beforeEach(() => { vi.resetAllMocks(); mockGetUser.mockResolvedValue(adminUser()) })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { GET } = await import('@/app/api/campaigns/[id]/distributors/route')
    const req = new NextRequest('http://localhost/api/campaigns/c-1/distributors')
    const res = await GET(req, { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns list of assigned distributors', async () => {
    mockFromService.mockImplementation((table: string) => {
      if (table === 'campaigns') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: { id: 'c-1' }, error: null }),
              }),
            }),
          }),
        }
      }
      // campaign_distributors
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: [{ user_id: 'u-1' }], error: null }),
        }),
      }
    })
    mockGetUserById.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'alice@co.com', user_metadata: { full_name: 'Alice' } } },
      error: null,
    })
    const { GET } = await import('@/app/api/campaigns/[id]/distributors/route')
    const req = new NextRequest('http://localhost/api/campaigns/c-1/distributors')
    const res = await GET(req, { params: Promise.resolve({ id: 'c-1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.distributors).toHaveLength(1)
    expect(body.distributors[0]).toMatchObject({ userId: 'u-1', name: 'Alice', email: 'alice@co.com' })
  })
})

describe('POST /api/campaigns/[id]/distributors', () => {
  beforeEach(() => { vi.resetAllMocks(); mockGetUser.mockResolvedValue(adminUser()) })

  it('returns 400 when userId missing', async () => {
    const { POST } = await import('@/app/api/campaigns/[id]/distributors/route')
    const req = new NextRequest('http://localhost/api/campaigns/c-1/distributors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(400)
  })

  it('inserts a distributor assignment', async () => {
    let inserted: unknown = null
    mockFromService.mockImplementation((table: string) => {
      if (table === 'user_company_roles') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: { roles: { name: 'scanner' } }, error: null }),
              }),
            }),
          }),
        }
      }
      // campaign_distributors
      return {
        insert: (row: unknown) => { inserted = row; return Promise.resolve({ error: null }) },
      }
    })
    const { POST } = await import('@/app/api/campaigns/[id]/distributors/route')
    const req = new NextRequest('http://localhost/api/campaigns/c-1/distributors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u-scanner' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'c-1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(inserted).toMatchObject({ campaign_id: 'c-1', user_id: 'u-scanner' })
  })
})

describe('DELETE /api/campaigns/[id]/distributors/[userId]', () => {
  beforeEach(() => { vi.resetAllMocks(); mockGetUser.mockResolvedValue(adminUser()) })

  it('removes a distributor assignment', async () => {
    let deleted = false
    mockFromService.mockReturnValue({
      delete: () => ({
        eq: () => ({ eq: () => { deleted = true; return Promise.resolve({ error: null }) } }),
      }),
    })
    const { DELETE } = await import('@/app/api/campaigns/[id]/distributors/[userId]/route')
    const req = new NextRequest('http://localhost/api/campaigns/c-1/distributors/u-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'c-1', userId: 'u-1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(deleted).toBe(true)
  })
})
