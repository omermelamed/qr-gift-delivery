import type { SmsProvider, SendSmsRequest, SendSmsResult } from './provider'

const SEND_SMS_URL = 'https://capi.inforu.co.il/api/v2/SMS/SendSms'

function isMockMode(): boolean {
  return process.env.SMS_MOCK === 'true' || process.env.TWILIO_MOCK === 'true'
}

/**
 * Normalize an Israeli phone number to InforU's expected MSISDN form:
 * digits only, country-coded, no leading "+" or "0".
 *   +972-50-123-4567 -> 972501234567
 *   0501234567       -> 972501234567
 */
function normalizeIsraeliMsisdn(raw: string): string {
  let digits = raw.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('0')) digits = `972${digits.slice(1)}`
  return digits
}

interface InforuResponse {
  StatusId: number
  StatusDescription?: string
  DetailedDescription?: string
  RequestId?: string
}

export class InforuProvider implements SmsProvider {
  private username: string
  private token: string
  private sender: string

  constructor() {
    this.username = process.env.INFORU_USERNAME ?? ''
    this.token = process.env.INFORU_TOKEN ?? ''
    this.sender = process.env.INFORU_SENDER ?? ''
  }

  isConfigured(): boolean {
    if (isMockMode()) return true
    return !!(this.username && this.token && this.sender)
  }

  async send(request: SendSmsRequest): Promise<SendSmsResult> {
    if (isMockMode()) {
      return { providerId: `mock_${Date.now()}`, status: 'sent' }
    }

    if (!this.isConfigured()) {
      return { providerId: '', status: 'failed', error: 'InforU not configured' }
    }

    const auth = Buffer.from(`${this.username}:${this.token}`).toString('base64')

    const response = await fetch(SEND_SMS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Data: {
          Message: request.body,
          Recipients: [{ Phone: normalizeIsraeliMsisdn(request.to) }],
          Settings: {
            Sender: this.sender,
            ...(request.messageId ? { CustomerMessageId: request.messageId } : {}),
          },
        },
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      return { providerId: '', status: 'failed', error: `InforU API error: ${response.status} ${text}` }
    }

    const data = (await response.json()) as InforuResponse

    if (data.StatusId !== 1) {
      return {
        providerId: data.RequestId ?? '',
        status: 'failed',
        error: data.DetailedDescription ?? data.StatusDescription ?? `StatusId ${data.StatusId}`,
      }
    }

    return { providerId: data.RequestId ?? '', status: 'queued' }
  }
}
