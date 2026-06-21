import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fetchPermissions } from '@/lib/permissions'

const mockGetUser = vi.fn()
const mockCampaignSingle = vi.fn()
const mockGiftSingle = vi.fn()
const mockUpdateSingle = vi.fn()

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
      if (table === 'campaign_gifts') {
        return { select: () => ({ eq: () => ({ eq: () => ({ single: mockGiftSingle }) }) }) }
      }
      // gift_tokens
      return {
        update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ single: mockUpdateSingle }) }) }) }),
      }
    },
  }),
}))

function makeRequest(giftId: unknown) {
  return new NextRequest('http://localhost/api/campaigns/c-1/tokens/t-1/gift', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ giftId }),
  })
}
const ctx = { params: Promise.resolve({ id: 'c-1', tokenId: 't-1' }) }

describe('PATCH /api/campaigns/[id]/tokens/[tokenId]/gift', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1', app_metadata: { role_id: 'r-1', role_name: 'company_admin' } } } })
    mockCampaignSingle.mockResolvedValue({ data: { id: 'c-1' } })
    mockGiftSingle.mockResolvedValue({ data: { id: 'g-1' } })
    mockUpdateSingle.mockResolvedValue({ data: { id: 't-1', gift_id: 'g-1' } })
  })

  it('401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/gift/route')
    const res = await PATCH(makeRequest('g-1'), ctx)
    expect(res.status).toBe(401)
  })

  it('403 when caller lacks campaigns:launch permission', async () => {
    vi.mocked(fetchPermissions).mockResolvedValueOnce([] as any)
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/gift/route')
    const res = await PATCH(makeRequest('g-1'), ctx)
    expect(res.status).toBe(403)
  })

  it('404 when campaign not in caller company', async () => {
    mockCampaignSingle.mockResolvedValue({ data: null })
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/gift/route')
    const res = await PATCH(makeRequest('g-1'), ctx)
    expect(res.status).toBe(404)
  })

  it('400 when gift not in campaign', async () => {
    mockGiftSingle.mockResolvedValue({ data: null })
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/gift/route')
    const res = await PATCH(makeRequest('g-x'), ctx)
    expect(res.status).toBe(400)
  })

  it('sets the gift and returns gift_id', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/gift/route')
    const res = await PATCH(makeRequest('g-1'), ctx)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.gift_id).toBe('g-1')
  })

  it('clears the gift when giftId is null', async () => {
    mockUpdateSingle.mockResolvedValue({ data: { id: 't-1', gift_id: null } })
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/gift/route')
    const res = await PATCH(makeRequest(null), ctx)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.gift_id).toBeNull()
  })
})
