import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockCreate = vi.fn()

vi.mock('twilio', () => ({
  default: vi.fn(() => ({ messages: { create: mockCreate } })),
}))

describe('sendGiftMMS', () => {
  beforeEach(() => {
    mockCreate.mockResolvedValue({ sid: 'SM_real_123' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('always calls the Twilio client and returns its sid', async () => {
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
        from: '+1234567890',
        to: '+972501234567',
        body: expect.stringContaining('Omer'),
        mediaUrl: ['https://example.com/qr.png'],
      })
    )
  })

  it('calls Twilio client with correct body and mediaUrl', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest')
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'auth_token')
    vi.stubEnv('TWILIO_PHONE_NUMBER', '+1234567890')
    const { sendGiftMMS } = await import('@/lib/twilio')
    await sendGiftMMS({
      to: '+972509999999',
      employeeName: 'Dana',
      holidayName: 'Rosh Hashana',
      qrImageUrl: 'https://example.com/dana-qr.png',
    })
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining('Dana'),
        mediaUrl: ['https://example.com/dana-qr.png'],
      })
    )
  })
})
