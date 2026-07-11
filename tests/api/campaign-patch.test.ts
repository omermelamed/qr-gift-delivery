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

  it('returns 400 when the flag is present but not a boolean', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ supportsArrivalCertificates: 'yes' }), params)
    expect(res.status).toBe(400)
  })

  it('returns 400 when no recognized field is provided', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ foo: 1 }), params)
    expect(res.status).toBe(400)
  })

  it('returns 400 invalid_max for a non-integer max', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    for (const bad of [0, -1, 2.5, 'x']) {
      const res = await PATCH(makeRequest({ maxAttendeeCount: bad }), params)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('invalid_max')
    }
  })

  it('updates only the max on a draft campaign', async () => {
    const update = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }))
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update,
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ maxAttendeeCount: 5 }), params)
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ max_attendee_count: 5 })
  })

  it('clears the max when maxAttendeeCount is null', async () => {
    const update = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }))
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update,
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ maxAttendeeCount: null }), params)
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ max_attendee_count: null })
  })

  it('returns 409 when the campaign was already sent', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: '2026-06-01T00:00:00Z' } }) }) }) }),
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ supportsArrivalCertificates: true }), params)
    expect(res.status).toBe(409)
  })

  it('returns 404 when the campaign does not exist', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }) }),
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ supportsArrivalCertificates: true }), params)
    expect(res.status).toBe(404)
  })

  it('persists a valid sms template containing {link}', async () => {
    const update = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }))
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update,
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ smsTemplate: 'Hi {name} {link}' }), params)
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ sms_template: 'Hi {name} {link}' })
  })

  it('returns 400 invalid_template when {link} is missing', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ smsTemplate: 'no link here' }), params)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_template')
  })

  it('clears the sms template when given an empty string', async () => {
    const update = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }))
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update,
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ smsTemplate: '   ' }), params)
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ sms_template: null })
  })

  it('updates the flag on a draft campaign', async () => {
    const update = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }))
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update,
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ supportsArrivalCertificates: true }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith({ supports_arrival_certificates: true })
  })

  it('returns 400 when allowGiftIfNotAttending is present but not a boolean', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ allowGiftIfNotAttending: 'yes' }), params)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('allowGiftIfNotAttending must be a boolean')
  })

  it('updates allowGiftIfNotAttending on a draft campaign', async () => {
    const update = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }))
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update,
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ allowGiftIfNotAttending: true }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith({ allow_gift_if_not_attending: true })
  })

  it('updates both arrival flags together in one PATCH', async () => {
    const update = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }))
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update,
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ supportsArrivalCertificates: true, allowGiftIfNotAttending: true }), params)
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ supports_arrival_certificates: true, allow_gift_if_not_attending: true })
  })

  it('returns 409 for allowGiftIfNotAttending when the campaign was already sent', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: '2026-06-01T00:00:00Z' } }) }) }) }),
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ allowGiftIfNotAttending: true }), params)
    expect(res.status).toBe(409)
  })
})
