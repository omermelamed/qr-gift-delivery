import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('sendGiftMMS', () => {
  beforeEach(() => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest')
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'auth_token')
    vi.stubEnv('TWILIO_PHONE_NUMBER', '+1234567890')
    vi.stubEnv('TWILIO_MOCK', 'false')
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ sid: 'SM_real_123' }),
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('calls Twilio API and returns sid', async () => {
    const { sendGiftMMS } = await import('@/lib/twilio')
    const result = await sendGiftMMS({
      to: '+972501234567',
      employeeName: 'Omer',
      holidayName: 'Passover',
      qrImageUrl: 'https://example.com/qr.png',
    })
    expect(result.sid).toBe('SM_real_123')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('ACtest/Messages.json'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('returns mock sid when TWILIO_MOCK is true', async () => {
    vi.stubEnv('TWILIO_MOCK', 'true')
    const { sendGiftMMS } = await import('@/lib/twilio')
    const result = await sendGiftMMS({
      to: '+972501234567',
      employeeName: 'Omer',
      holidayName: 'Passover',
      qrImageUrl: 'https://example.com/qr.png',
    })
    expect(result.sid).toBe('mock')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
