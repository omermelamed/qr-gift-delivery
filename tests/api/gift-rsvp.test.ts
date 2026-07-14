import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockTokenSingle = vi.fn()
const mockUpdateSingle = vi.fn()
const mockUpdate = vi.fn(() => ({
  eq: () => ({
    eq: () => ({ select: () => ({ single: mockUpdateSingle }) }),
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: mockTokenSingle }) }),
      update: mockUpdate,
    }),
  }),
}))

function makeRequest(token: string, body: unknown) {
  return new NextRequest(`http://localhost/api/gift/${token}/rsvp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const supportedOpen = { redeemed: false, campaigns: { supports_arrival_certificates: true, closed_at: null } }

describe('POST /api/gift/[token]/rsvp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockClear()
  })

  it('400 when attending is not a boolean', async () => {
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: 'yes' }), { params: Promise.resolve({ token: 't' }) })
    expect(res.status).toBe(400)
    expect(mockTokenSingle).not.toHaveBeenCalled()
  })

  it('404 when token does not exist', async () => {
    mockTokenSingle.mockResolvedValue({ data: null })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 1 }), { params: Promise.resolve({ token: 't' }) })
    expect(res.status).toBe(404)
  })

  it('400 not_supported when campaign has arrival certificates disabled', async () => {
    mockTokenSingle.mockResolvedValue({ data: { redeemed: false, campaigns: { supports_arrival_certificates: false, closed_at: null } } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 1 }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('not_supported')
  })

  it('409 campaign_closed when the campaign is closed', async () => {
    mockTokenSingle.mockResolvedValue({ data: { redeemed: false, campaigns: { supports_arrival_certificates: true, closed_at: '2026-06-01T00:00:00Z' } } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: false }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.error).toBe('campaign_closed')
  })

  it('409 locked when the token is already redeemed', async () => {
    mockTokenSingle.mockResolvedValue({ data: { redeemed: true, campaigns: { supports_arrival_certificates: true, closed_at: null } } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 2 }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.error).toBe('locked')
  })

  it('400 invalid_count when coming without a count', async () => {
    mockTokenSingle.mockResolvedValue({ data: supportedOpen })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('invalid_count')
  })

  it('400 invalid_count when count is below 1', async () => {
    mockTokenSingle.mockResolvedValue({ data: supportedOpen })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 0 }), { params: Promise.resolve({ token: 't' }) })
    expect((await res.json()).error).toBe('invalid_count')
  })

  it('saves a coming response with the attendee count', async () => {
    mockTokenSingle.mockResolvedValue({ data: supportedOpen })
    mockUpdateSingle.mockResolvedValue({ data: { attending: true, attendee_count: 2 } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 2 }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body).toEqual({ ok: true, attending: true, attendeeCount: 2 })
    expect(mockUpdate).toHaveBeenCalledWith({ attending: true, attendee_count: 2, responded_at: expect.any(String) })
  })

  it('saves a not-coming response with a null count', async () => {
    mockTokenSingle.mockResolvedValue({ data: supportedOpen })
    mockUpdateSingle.mockResolvedValue({ data: { attending: false, attendee_count: null } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: false, attendeeCount: 5 }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body).toEqual({ ok: true, attending: false, attendeeCount: null })
    expect(mockUpdate).toHaveBeenCalledWith({ attending: false, attendee_count: null, responded_at: expect.any(String) })
  })

  it('updates not-coming -> coming with a count', async () => {
    mockTokenSingle.mockResolvedValue({ data: supportedOpen })
    mockUpdateSingle.mockResolvedValue({ data: { attending: true, attendee_count: 2 } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 2 }), { params: Promise.resolve({ token: 't' }) })
    expect((await res.json())).toEqual({ ok: true, attending: true, attendeeCount: 2 })
  })

  it('updates coming -> not-coming, clearing the count', async () => {
    mockTokenSingle.mockResolvedValue({ data: supportedOpen })
    mockUpdateSingle.mockResolvedValue({ data: { attending: false, attendee_count: null } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: false }), { params: Promise.resolve({ token: 't' }) })
    expect((await res.json())).toEqual({ ok: true, attending: false, attendeeCount: null })
  })

  it('409 locked when the write loses the redeemed race (0 rows)', async () => {
    mockTokenSingle.mockResolvedValue({ data: supportedOpen })
    mockUpdateSingle.mockResolvedValue({ data: null })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: false }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.error).toBe('locked')
  })

  it('400 over_limit when coming with more than the campaign max', async () => {
    mockTokenSingle.mockResolvedValue({
      data: { redeemed: false, campaigns: { supports_arrival_certificates: true, closed_at: null, max_attendee_count: 4 } },
    })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 5 }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('over_limit')
    expect(body.max).toBe(4)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('accepts a count exactly at the campaign max', async () => {
    mockTokenSingle.mockResolvedValue({
      data: { redeemed: false, campaigns: { supports_arrival_certificates: true, closed_at: null, max_attendee_count: 4 } },
    })
    mockUpdateSingle.mockResolvedValue({ data: { attending: true, attendee_count: 4 } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 4 }), { params: Promise.resolve({ token: 't' }) })
    expect(await res.json()).toEqual({ ok: true, attending: true, attendeeCount: 4 })
  })

  it('allows any count when the campaign max is null', async () => {
    mockTokenSingle.mockResolvedValue({
      data: { redeemed: false, campaigns: { supports_arrival_certificates: true, closed_at: null, max_attendee_count: null } },
    })
    mockUpdateSingle.mockResolvedValue({ data: { attending: true, attendee_count: 99 } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 99 }), { params: Promise.resolve({ token: 't' }) })
    expect(await res.json()).toEqual({ ok: true, attending: true, attendeeCount: 99 })
  })

  it('ignores the max when not coming', async () => {
    mockTokenSingle.mockResolvedValue({
      data: { redeemed: false, campaigns: { supports_arrival_certificates: true, closed_at: null, max_attendee_count: 1 } },
    })
    mockUpdateSingle.mockResolvedValue({ data: { attending: false, attendee_count: null } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: false, attendeeCount: 9 }), { params: Promise.resolve({ token: 't' }) })
    expect(await res.json()).toEqual({ ok: true, attending: false, attendeeCount: null })
  })

  it('409 event_full when locked and the token has not answered', async () => {
    mockTokenSingle.mockResolvedValue({
      data: { redeemed: false, attending: null, campaigns: { supports_arrival_certificates: true, closed_at: null, max_attendee_count: null, rsvp_locked: true } },
    })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 1 }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.error).toBe('event_full')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('409 event_full when locked and the token previously said not coming', async () => {
    mockTokenSingle.mockResolvedValue({
      data: { redeemed: false, attending: false, campaigns: { supports_arrival_certificates: true, closed_at: null, max_attendee_count: null, rsvp_locked: true } },
    })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 1 }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.error).toBe('event_full')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('allows an already-yes token to update its headcount while locked', async () => {
    mockTokenSingle.mockResolvedValue({
      data: { redeemed: false, attending: true, campaigns: { supports_arrival_certificates: true, closed_at: null, max_attendee_count: null, rsvp_locked: true } },
    })
    mockUpdateSingle.mockResolvedValue({ data: { attending: true, attendee_count: 3 } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 3 }), { params: Promise.resolve({ token: 't' }) })
    expect(await res.json()).toEqual({ ok: true, attending: true, attendeeCount: 3 })
  })

  it('allows opting out even while locked', async () => {
    mockTokenSingle.mockResolvedValue({
      data: { redeemed: false, attending: null, campaigns: { supports_arrival_certificates: true, closed_at: null, max_attendee_count: null, rsvp_locked: true } },
    })
    mockUpdateSingle.mockResolvedValue({ data: { attending: false, attendee_count: null } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: false }), { params: Promise.resolve({ token: 't' }) })
    expect(await res.json()).toEqual({ ok: true, attending: false, attendeeCount: null })
  })
})
