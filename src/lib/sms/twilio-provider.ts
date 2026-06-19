import type { SmsProvider, SendSmsRequest, SendSmsResult } from './provider'

export class TwilioProvider implements SmsProvider {
  private accountSid: string
  private authToken: string
  private fromNumber: string

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID ?? ''
    this.authToken = process.env.TWILIO_AUTH_TOKEN ?? ''
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER ?? ''
  }

  isConfigured(): boolean {
    if (process.env.TWILIO_MOCK === 'true') return true
    return !!(this.accountSid && this.authToken && this.fromNumber)
  }

  async send(request: SendSmsRequest): Promise<SendSmsResult> {
    if (process.env.TWILIO_MOCK === 'true') {
      return { providerId: `mock_${Date.now()}`, status: 'sent' }
    }

    if (!this.isConfigured()) {
      return { providerId: '', status: 'failed', error: 'Twilio not configured' }
    }

    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: this.fromNumber,
          To: request.to,
          Body: request.body,
          ...(request.statusCallbackUrl ? { StatusCallback: request.statusCallbackUrl } : {}),
        }).toString(),
      }
    )

    if (!response.ok) {
      const text = await response.text()
      return { providerId: '', status: 'failed', error: `Twilio API error: ${response.status} ${text}` }
    }

    const data = (await response.json()) as {
      sid: string
      status: string
      error_code?: number
      error_message?: string
    }

    if (data.status === 'failed' || data.status === 'undelivered') {
      return {
        providerId: data.sid,
        status: 'failed',
        error: data.error_message ?? `Error code: ${data.error_code}`,
      }
    }

    return { providerId: data.sid, status: 'queued' }
  }
}
