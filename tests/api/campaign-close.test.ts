import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({ from: mockFromService }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['campaigns:launch']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

function makeRequest(id: string) {
  return new NextRequest(`http://localhost/api/campaigns/${id}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/campaigns/[id]/close', () => {
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

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('@/app/api/campaigns/[id]/close/route')
    const res = await POST(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 403 when missing campaigns:launch permission', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)
    const { POST } = await import('@/app/api/campaigns/[id]/close/route')
    const res = await POST(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(403)
  })

  it('returns 404 when campaign not found', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/close/route')
    const res = await POST(makeRequest('missing'), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
  })

  it('returns 409 when campaign not yet sent', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null, closed_at: null }, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/close/route')
    const res = await POST(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('not yet sent')
  })

  it('returns 409 when campaign already closed', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: '2026-04-01', closed_at: '2026-04-10' }, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/close/route')
    const res = await POST(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toContain('already closed')
  })

  it('closes a sent campaign and returns success', async () => {
    let updated = false
    mockFromService.mockImplementation((table: string) => {
      if (table === 'campaigns') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: '2026-04-01', closed_at: null }, error: null }) }) }) }),
          update: () => ({ eq: () => ({ eq: () => { updated = true; return Promise.resolve({ error: null }) } }) }),
        }
      }
    })
    const { POST } = await import('@/app/api/campaigns/[id]/close/route')
    const res = await POST(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(updated).toBe(true)
  })
})
