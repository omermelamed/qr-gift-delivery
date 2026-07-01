import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockCampaignSingle = vi.fn()
const mockUpdate = vi.fn()

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
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: mockCampaignSingle }) }) }),
          update: (payload: unknown) => { mockUpdate(payload); return { eq: () => ({ eq: () => ({ error: null }) }) } },
        }
      }
      return {}
    },
  }),
}))

function patch(body: unknown) {
  return new NextRequest('http://localhost/api/campaigns/c-1', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
const ctx = { params: Promise.resolve({ id: 'c-1' }) }

describe('PATCH /api/campaigns/[id] — wizard fields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1', app_metadata: { role_id: 'r-1', role_name: 'company_admin' } } } })
    mockCampaignSingle.mockResolvedValue({ data: { id: 'c-1', sent_at: null } })
  })

  it('updates name and campaign_date', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(patch({ name: '  Passover 2026 ', campaignDate: '2026-04-01' }), ctx)
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Passover 2026', campaign_date: '2026-04-01' }))
  })

  it('rejects blank name', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(patch({ name: '   ' }), ctx)
    expect(res.status).toBe(400)
  })

  it('rejects invalid date', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(patch({ campaignDate: 'not-a-date' }), ctx)
    expect(res.status).toBe(400)
  })

  it('persists wizardLastStep', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(patch({ wizardLastStep: 3 }), ctx)
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ wizard_last_step: 3 }))
  })

  it('rejects out-of-range wizardLastStep', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(patch({ wizardLastStep: 9 }), ctx)
    expect(res.status).toBe(400)
  })
})
