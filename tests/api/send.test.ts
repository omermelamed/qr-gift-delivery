import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeServiceFrom } from '../helpers/supabase-mock'

const CAMPAIGN_OK = { data: { id: 'campaign-1', name: 'Passover 2026', company_id: 'company-1', sent_at: null }, error: null }

const mockGetUser = vi.fn()
const mockFromService = vi.fn()
const mockUpload = vi.fn()
const mockGetPublicUrl = vi.fn()
const mockSend = vi.fn().mockResolvedValue({ providerId: 'mock', status: 'sent' })

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
  createServiceClient: () => ({
    from: mockFromService,
    storage: {
      from: () => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['campaigns:launch']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/sms', () => ({
  getSmsProvider: () => ({ send: mockSend, isConfigured: () => true }),
  buildGiftSmsBody: () => 'mock body',
}))

vi.mock('@/lib/qr', () => ({
  generateQrBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
}))

function makeRequest(campaignId: string) {
  return new NextRequest(`http://localhost/api/campaigns/${campaignId}/send`, {
    method: 'POST',
  })
}

describe('POST /api/campaigns/[id]/send', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    vi.stubEnv('SMS_MOCK', 'true')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')

    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)

    mockSend.mockResolvedValue({ sid: 'mock' })

    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          app_metadata: {
            company_id: 'company-1',
            role_id: 'role-1',
            role_name: 'company_admin',
          },
        },
      },
    })

    mockUpload.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://example.com/qr/token-1.png' },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const { POST } = await import('@/app/api/campaigns/[id]/send/route')
    const res = await POST(makeRequest('campaign-1'), {
      params: Promise.resolve({ id: 'campaign-1' }),
    })

    expect(res.status).toBe(401)
  })

  it('returns 403 when user lacks campaigns:launch permission', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)

    const { POST } = await import('@/app/api/campaigns/[id]/send/route')
    const res = await POST(makeRequest('campaign-1'), {
      params: Promise.resolve({ id: 'campaign-1' }),
    })

    expect(res.status).toBe(403)
  })

  it('returns 404 when campaign not found', async () => {
    mockFromService.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
          }),
        }),
      }),
    })

    const { POST } = await import('@/app/api/campaigns/[id]/send/route')
    const res = await POST(makeRequest('bad-campaign'), {
      params: Promise.resolve({ id: 'bad-campaign' }),
    })

    expect(res.status).toBe(404)
  })

  it('returns 409 when campaign already dispatched', async () => {
    mockFromService.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { id: 'campaign-1', name: 'Passover 2026', company_id: 'company-1', sent_at: '2026-04-01T10:00:00.000Z' },
                error: null,
              }),
          }),
        }),
      }),
    })

    const { POST } = await import('@/app/api/campaigns/[id]/send/route')
    const res = await POST(makeRequest('campaign-1'), {
      params: Promise.resolve({ id: 'campaign-1' }),
    })

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Campaign already dispatched')
  })

  it('dispatches tokens in mock mode and returns devPreviewUrl', async () => {
    mockFromService.mockImplementation(makeServiceFrom({
      campaigns: CAMPAIGN_OK,
      companies: { data: { sms_template: null }, error: null },
      gift_tokens: { data: [{ id: 'token-row-1', token: 'uuid-1', employee_name: 'Omer', phone_number: '+972501234567', qr_image_url: null }], error: null },
    }))

    const { POST } = await import('@/app/api/campaigns/[id]/send/route')
    const res = await POST(makeRequest('campaign-1'), {
      params: Promise.resolve({ id: 'campaign-1' }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.dispatched).toBe(1)
    expect(body.failed).toBe(0)
  })

  it('skips QR generation when qr_image_url already set on token', async () => {
    mockFromService.mockImplementation(makeServiceFrom({
      campaigns: CAMPAIGN_OK,
      companies: { data: { sms_template: null }, error: null },
      gift_tokens: { data: [{ id: 'token-row-1', token: 'uuid-1', employee_name: 'Omer', phone_number: '+972501234567', qr_image_url: 'https://existing-url.com/qr.png' }], error: null },
    }))

    const { generateQrBuffer } = await import('@/lib/qr')

    const { POST } = await import('@/app/api/campaigns/[id]/send/route')
    await POST(makeRequest('campaign-1'), {
      params: Promise.resolve({ id: 'campaign-1' }),
    })

    expect(vi.mocked(generateQrBuffer)).not.toHaveBeenCalled()
    expect(mockUpload).not.toHaveBeenCalled()
  })

  // Mock mode is now handled inside the SMS provider (see inforu-provider.test.ts),
  // not by skipping the provider at the route. The route still dispatches; the
  // provider returns a mock result instead of hitting the network.
  it('dispatches through the provider in mock mode without error', async () => {
    mockFromService.mockImplementation(makeServiceFrom({
      campaigns: CAMPAIGN_OK,
      companies: { data: { sms_template: null }, error: null },
      gift_tokens: { data: [{ id: 'token-row-1', token: 'uuid-1', employee_name: 'Omer', phone_number: '+972501234567', qr_image_url: 'https://existing.com/qr.png' }], error: null },
    }))

    const { POST } = await import('@/app/api/campaigns/[id]/send/route')
    const res = await POST(makeRequest('campaign-1'), {
      params: Promise.resolve({ id: 'campaign-1' }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.dispatched).toBe(1)
  })
})
