import { describe, it, expect, vi, afterEach } from 'vitest'

const mockCreate = vi.fn().mockResolvedValue({ sid: 'SM_real_123' })

vi.mock('twilio', () => ({
  default: vi.fn(() => ({ messages: { create: mockCreate } })),
}))

describe('sendGiftMMS', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('returns mock sid and skips Twilio when TWILIO_MOCK=true', async () => {
    vi.stubEnv('TWILIO_MOCK', 'true')
    const { sendGiftMMS } = await import('@/lib/twilio')
    const result = await sendGiftMMS({
      to: '+972501234567',
      employeeName: 'Omer',
      holidayName: 'Passover',
      qrImageUrl: 'https://example.com/qr.png',
    })
    expect(result.sid).toBe('mock')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('calls Twilio and returns real sid when TWILIO_MOCK is not set', async () => {
    vi.stubEnv('TWILIO_MOCK', '')
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest')
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'auth_token')
    vi.stubEnv('TWILIO_PHONE_NUMBER', '+1234567890')
    const { sendGiftMMS } = await import('@/lib/twilio')
    const result = await sendGiftMMS({
      to: '+972501234567',
      employeeName: 'Omer',
      holidayName: 'Passover',
      qrImageUrl: 'https://example.com/qr.png',
    })
    expect(result.sid).toBe('SM_real_123')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '+972501234567',
        body: expect.stringContaining('Omer'),
        mediaUrl: ['https://example.com/qr.png'],
      })
    )
  })
})
