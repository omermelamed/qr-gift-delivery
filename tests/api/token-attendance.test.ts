import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fetchPermissions } from '@/lib/permissions'

const mockGetUser = vi.fn()
const mockCampaignSingle = vi.fn()
const mockUpdateSingle = vi.fn()
const mockUpdate = vi.fn(() => ({
  eq: () => ({ eq: () => ({ select: () => ({ single: mockUpdateSingle }) }) }),
}))

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }))
vi.mock('@/lib/platform-auth', () => ({ resolveCompanyId: vi.fn(async () => 'co-1') }))
vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn(async () => ['campaigns:launch']),
  hasPermission: (perms: string[], p: string) => perms.includes(p),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'campaigns') {
        return { select: () => ({ eq: () => ({ eq: () => ({ single: mockCampaignSingle }) }) }) }
      }
      // gift_tokens
      return { update: mockUpdate }
    },
  }),
}))

function makeRequest(attendeeCount: unknown) {
  return new NextRequest('http://localhost/api/campaigns/c-1/tokens/t-1/attendance', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attendeeCount }),
  })
}
const ctx = { params: Promise.resolve({ id: 'c-1', tokenId: 't-1' }) }

describe('PATCH /api/campaigns/[id]/tokens/[tokenId]/attendance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1', app_metadata: { role_id: 'r-1', role_name: 'company_admin' } } } })
    mockCampaignSingle.mockResolvedValue({ data: { id: 'c-1', supports_arrival_certificates: true } })
    mockUpdateSingle.mockResolvedValue({ data: { id: 't-1', attending: true, attendee_count: 2 } })
  })

  it('401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route')
    const res = await PATCH(makeRequest(2), ctx)
    expect(res.status).toBe(401)
  })

  it('401 when company cannot be resolved', async () => {
    const { resolveCompanyId } = await import('@/lib/platform-auth')
    vi.mocked(resolveCompanyId).mockResolvedValueOnce(null as any)
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route')
    const res = await PATCH(makeRequest(2), ctx)
    expect(res.status).toBe(401)
  })

  it('403 when caller lacks campaigns:launch permission', async () => {
    vi.mocked(fetchPermissions).mockResolvedValueOnce([] as any)
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route')
    const res = await PATCH(makeRequest(2), ctx)
    expect(res.status).toBe(403)
  })

  it('404 when campaign not in caller company', async () => {
    mockCampaignSingle.mockResolvedValue({ data: null })
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route')
    const res = await PATCH(makeRequest(2), ctx)
    expect(res.status).toBe(404)
  })

  it('400 not_supported when the campaign lacks arrival certificates', async () => {
    mockCampaignSingle.mockResolvedValue({ data: { id: 'c-1', supports_arrival_certificates: false } })
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route')
    const res = await PATCH(makeRequest(2), ctx)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('not_supported')
  })

  it('sets attending + count and asserts the write payload', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route')
    const res = await PATCH(makeRequest(2), ctx)
    const body = await res.json()
    expect(body).toEqual({ ok: true, attending: true, attendee_count: 2 })
    expect(mockUpdate).toHaveBeenCalledWith({ attending: true, attendee_count: 2, responded_at: expect.any(String) })
  })

  it('clears attendance when attendeeCount is null', async () => {
    mockUpdateSingle.mockResolvedValue({ data: { id: 't-1', attending: null, attendee_count: null } })
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route')
    const res = await PATCH(makeRequest(null), ctx)
    const body = await res.json()
    expect(body).toEqual({ ok: true, attending: null, attendee_count: null })
    expect(mockUpdate).toHaveBeenCalledWith({ attending: null, attendee_count: null, responded_at: null })
  })

  it('400 invalid_count for zero', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route')
    const res = await PATCH(makeRequest(0), ctx)
    expect((await res.json()).error).toBe('invalid_count')
  })

  it('400 invalid_count for a non-integer', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route')
    const res = await PATCH(makeRequest(1.5), ctx)
    expect((await res.json()).error).toBe('invalid_count')
  })
})
