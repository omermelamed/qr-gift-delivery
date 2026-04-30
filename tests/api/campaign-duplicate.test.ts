import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({ from: mockFromService }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['campaigns:create']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

function makeRequest(id: string, body: object) {
  return new NextRequest(`http://localhost/api/campaigns/${id}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/campaigns/[id]/duplicate', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'admin-1',
          app_metadata: { company_id: 'co-1', role_id: 'role-1', role_name: 'company_admin' },
        },
      },
    })
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('@/app/api/campaigns/[id]/duplicate/route')
    const res = await POST(makeRequest('c-1', { name: 'Copy', campaign_date: null }), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 403 when missing campaigns:create', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)
    const { POST } = await import('@/app/api/campaigns/[id]/duplicate/route')
    const res = await POST(makeRequest('c-1', { name: 'Copy', campaign_date: null }), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(403)
  })

  it('returns 404 when source campaign not found', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/duplicate/route')
    const res = await POST(makeRequest('missing', { name: 'Copy', campaign_date: null }), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
  })

  it('returns 400 when name is missing', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', company_id: 'co-1' }, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/duplicate/route')
    const res = await POST(makeRequest('c-1', { campaign_date: null }), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(400)
  })

  it('creates new campaign without copying employees when copyEmployees is false', async () => {
    let insertedCampaign: unknown = null
    mockFromService.mockImplementation((table: string) => {
      if (table === 'campaigns') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', company_id: 'co-1' }, error: null }) }) }) }),
          insert: (row: unknown) => { insertedCampaign = row; return { select: () => ({ single: () => Promise.resolve({ data: { id: 'new-c' }, error: null }) }) } },
        }
      }
      return { select: () => ({ eq: () => ({ data: [], error: null }) }) }
    })

    const { POST } = await import('@/app/api/campaigns/[id]/duplicate/route')
    const res = await POST(makeRequest('c-1', { name: 'Copy', campaign_date: '2026-05-01', copyEmployees: false }), { params: Promise.resolve({ id: 'c-1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.id).toBe('new-c')
    expect(insertedCampaign).toMatchObject({ name: 'Copy', campaign_date: '2026-05-01', company_id: 'co-1' })
  })
})
