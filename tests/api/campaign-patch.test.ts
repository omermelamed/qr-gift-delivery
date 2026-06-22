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

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/campaigns/c-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = { params: Promise.resolve({ id: 'c-1' }) }

describe('PATCH /api/campaigns/[id]', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', app_metadata: { company_id: 'company-1', role_id: 'role-1', role_name: 'company_admin' } } },
    })
  })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ supportsArrivalCertificates: true }), params)
    expect(res.status).toBe(401)
  })

  it('returns 403 when missing permission', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ supportsArrivalCertificates: true }), params)
    expect(res.status).toBe(403)
  })

  it('returns 400 when the flag is not a boolean', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ supportsArrivalCertificates: 'yes' }), params)
    expect(res.status).toBe(400)
  })

  it('returns 409 when the campaign was already sent', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: '2026-06-01T00:00:00Z' } }) }) }) }),
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ supportsArrivalCertificates: true }), params)
    expect(res.status).toBe(409)
  })

  it('updates the flag on a draft campaign', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ supportsArrivalCertificates: true }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
