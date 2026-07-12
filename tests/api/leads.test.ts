import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockInsert = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: () => ({ insert: mockInsert }) }),
}))

const mockRateLimit = vi.fn(() => ({ ok: true, retryAfter: 0 }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
  clientIp: () => '1.2.3.4',
}))

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validLead = {
  name: 'Dana Levi',
  company: 'Acme',
  email: 'dana@acme.co.il',
  phone: '050-1234567',
  message: 'We have 500 employees',
  locale: 'he',
}

describe('POST /api/leads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimit.mockReturnValue({ ok: true, retryAfter: 0 })
    mockInsert.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('429 when rate limited, without touching the database', async () => {
    mockRateLimit.mockReturnValue({ ok: false, retryAfter: 30 })
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest(validLead))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('400 when a required field is missing', async () => {
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest({ ...validLead, company: '' }))
    expect(res.status).toBe(400)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('400 when the email is malformed', async () => {
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest({ ...validLead, email: 'not-an-email' }))
    expect(res.status).toBe(400)
  })

  it('400 when a field exceeds its length cap', async () => {
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest({ ...validLead, name: 'x'.repeat(121) }))
    expect(res.status).toBe(400)
  })

  it('answers success-shaped on honeypot without storing anything', async () => {
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest({ ...validLead, website: 'http://spam.example' }))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('stores a valid lead and returns ok without emailing when unconfigured', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest(validLead))
    expect(res.status).toBe(200)
    expect(mockInsert).toHaveBeenCalledWith({
      name: 'Dana Levi',
      company: 'Acme',
      email: 'dana@acme.co.il',
      phone: '050-1234567',
      message: 'We have 500 employees',
      locale: 'he',
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('normalizes empty optional fields to null and unknown locale to en', async () => {
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(
      makeRequest({ name: 'A', company: 'B', email: 'a@b.co', phone: '', message: '  ', locale: 'fr' })
    )
    expect(res.status).toBe(200)
    expect(mockInsert).toHaveBeenCalledWith({
      name: 'A',
      company: 'B',
      email: 'a@b.co',
      phone: null,
      message: null,
      locale: 'en',
    })
  })

  it('500 when the insert fails', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'boom' } })
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest(validLead))
    expect(res.status).toBe(500)
  })

  it('sends the notification email when Resend is configured', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('LEADS_NOTIFY_EMAIL', 'omer.melamed@gmail.com')
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest(validLead))
    expect(res.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('still returns ok when the notification email fails', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('LEADS_NOTIFY_EMAIL', 'omer.melamed@gmail.com')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('resend down')))
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest(validLead))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })
})
