import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('InforuProvider', () => {
  beforeEach(() => {
    vi.stubEnv('INFORU_USERNAME', 'acme')
    vi.stubEnv('INFORU_TOKEN', 'tok_123')
    vi.stubEnv('INFORU_SENDER', 'AcmeGifts')
    vi.stubEnv('SMS_MOCK', 'false')
    vi.stubEnv('TWILIO_MOCK', 'false')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ StatusId: 1, StatusDescription: 'Success', RequestId: 'req_789' }),
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    mockFetch.mockReset()
  })

  it('posts to the InforU SendSms endpoint with basic auth and JSON body', async () => {
    const { InforuProvider } = await import('@/lib/sms/inforu-provider')
    const provider = new InforuProvider()
    const result = await provider.send({ to: '+972501234567', body: 'Hi Omer' })

    expect(result.status).toBe('queued')
    expect(result.providerId).toBe('req_789')

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toContain('capi.inforu.co.il')
    expect(url).toContain('SendSms')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('acme:tok_123').toString('base64')}`
    )
    const payload = JSON.parse(init.body)
    expect(payload.Data.Message).toBe('Hi Omer')
    expect(payload.Data.Settings.Sender).toBe('AcmeGifts')
    // Israeli number normalized to 972 form without leading + or 0
    expect(payload.Data.Recipients[0].Phone).toBe('972501234567')
  })

  it('normalizes a local 05x number to 972 form', async () => {
    const { InforuProvider } = await import('@/lib/sms/inforu-provider')
    await new InforuProvider().send({ to: '0501234567', body: 'x' })
    const payload = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(payload.Data.Recipients[0].Phone).toBe('972501234567')
  })

  it('returns failed when StatusId is not 1', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ StatusId: -1, StatusDescription: 'Invalid recipient' }),
    })
    const { InforuProvider } = await import('@/lib/sms/inforu-provider')
    const result = await new InforuProvider().send({ to: '+972501234567', body: 'x' })
    expect(result.status).toBe('failed')
    expect(result.error).toContain('Invalid recipient')
  })

  it('returns failed on a non-OK HTTP response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' })
    const { InforuProvider } = await import('@/lib/sms/inforu-provider')
    const result = await new InforuProvider().send({ to: '+972501234567', body: 'x' })
    expect(result.status).toBe('failed')
  })

  it('short-circuits to a mock result when SMS_MOCK is true', async () => {
    vi.stubEnv('SMS_MOCK', 'true')
    const { InforuProvider } = await import('@/lib/sms/inforu-provider')
    const result = await new InforuProvider().send({ to: '+972501234567', body: 'x' })
    expect(result.status).toBe('sent')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('isConfigured reflects presence of credentials', async () => {
    const { InforuProvider } = await import('@/lib/sms/inforu-provider')
    expect(new InforuProvider().isConfigured()).toBe(true)
    vi.stubEnv('INFORU_TOKEN', '')
    expect(new InforuProvider().isConfigured()).toBe(false)
  })
})
