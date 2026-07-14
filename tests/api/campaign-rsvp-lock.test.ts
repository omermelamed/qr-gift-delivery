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

vi.mock('@/lib/platform-auth', () => ({ resolveCompanyId: vi.fn(async () => 'company-1') }))

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }))

function makeRequest(rsvpLocked: unknown) {
  return new NextRequest('http://localhost/api/campaigns/c-1/rsvp-lock', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rsvpLocked }),
  })
}

const params = { params: Promise.resolve({ id: 'c-1' }) }

function mockCampaign(data: unknown, updateError: unknown = null) {
  const update = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: updateError }) }) }))
  mockFromService.mockReturnValue({
    select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data }) }) }) }),
    update,
  })
  return update
}

describe('PATCH /api/campaigns/[id]/rsvp-lock', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { hasPermission, fetchPermissions } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    vi.mocked(fetchPermissions).mockResolvedValue(['campaigns:launch'] as any)
    const { resolveCompanyId } = await import('@/lib/platform-auth')
    vi.mocked(resolveCompanyId).mockResolvedValue('company-1' as any)
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', app_metadata: { company_id: 'company-1', role_id: 'role-1', role_name: 'company_admin' } } },
    })
    mockCampaign({ id: 'c-1', supports_arrival_certificates: true })
  })

  it('401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest(true), params)
    expect(res.status).toBe(401)
  })

  it('401 when company cannot be resolved', async () => {
    const { resolveCompanyId } = await import('@/lib/platform-auth')
    vi.mocked(resolveCompanyId).mockResolvedValueOnce(null as any)
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest(true), params)
    expect(res.status).toBe(401)
  })

  it('403 when missing campaigns:launch permission', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest(true), params)
    expect(res.status).toBe(403)
  })

  it('400 when rsvpLocked is not a boolean', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest('yes'), params)
    expect(res.status).toBe(400)
  })

  it('404 when campaign not found', async () => {
    mockCampaign(null)
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest(true), params)
    expect(res.status).toBe(404)
  })

  it('400 not_supported when arrival certificates are disabled', async () => {
    mockCampaign({ id: 'c-1', supports_arrival_certificates: false })
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest(true), params)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('not_supported')
  })

  it('locks the campaign and logs the audit event', async () => {
    const update = mockCampaign({ id: 'c-1', supports_arrival_certificates: true })
    const { logAuditEvent } = await import('@/lib/audit')
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest(true), params)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, rsvpLocked: true })
    expect(update).toHaveBeenCalledWith({ rsvp_locked: true })
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'campaign.rsvp_lock_changed',
      resourceId: 'c-1',
      metadata: { rsvpLocked: true },
    }))
  })

  it('unlocks the campaign', async () => {
    const update = mockCampaign({ id: 'c-1', supports_arrival_certificates: true })
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest(false), params)
    expect(await res.json()).toEqual({ ok: true, rsvpLocked: false })
    expect(update).toHaveBeenCalledWith({ rsvp_locked: false })
  })

  it('succeeds even when the campaign is already sent and closed', async () => {
    mockCampaign({
      id: 'c-1',
      supports_arrival_certificates: true,
      sent_at: '2026-06-01T00:00:00Z',
      closed_at: '2026-06-02T00:00:00Z',
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest(true), params)
    expect(res.status).toBe(200)
  })

  it('500 when the update fails', async () => {
    mockCampaign({ id: 'c-1', supports_arrival_certificates: true }, { message: 'db error' })
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest(true), params)
    expect(res.status).toBe(500)
  })
})
