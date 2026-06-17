interface SendGiftSMSOptions {
  to: string
  employeeName: string
  holidayName: string
  giftLink: string
  body?: string
}

interface SendGiftSMSResult {
  sid: string
}

export function isTwilioConfigured(): boolean {
  if (process.env.TWILIO_MOCK === 'true') return true
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  )
}

export async function sendGiftSMS(options: SendGiftSMSOptions): Promise<SendGiftSMSResult> {
  if (process.env.TWILIO_MOCK === 'true') {
    return { sid: 'mock' }
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('Missing Twilio credentials')
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: fromNumber,
        To: options.to,
        Body: options.body ?? `Hi ${options.employeeName}! You have a ${options.holidayName} gift waiting for you. Open the link to get your QR code: ${options.giftLink}`,
      }).toString(),
    }
  )

  if (!response.ok) {
    throw new Error(`Twilio API error: ${response.statusText}`)
  }

  const data = (await response.json()) as { sid: string; status: string; error_code?: number; error_message?: string }
  if (data.status === 'failed' || data.status === 'undelivered') {
    throw new Error(`Twilio message ${data.status}: ${data.error_message ?? data.error_code ?? 'unknown error'}`)
  }
  return { sid: data.sid }
}
