interface SendGiftMMSOptions {
  to: string
  employeeName: string
  holidayName: string
  qrImageUrl: string
}

interface SendGiftMMSResult {
  sid: string
}

export async function sendGiftMMS(options: SendGiftMMSOptions): Promise<SendGiftMMSResult> {
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
        MediaUrl: options.qrImageUrl,
        Body: `Hi ${options.employeeName}! Here's your ${options.holidayName} gift QR code above. Scan it to redeem!`,
      }).toString(),
    }
  )

  if (!response.ok) {
    throw new Error(`Twilio API error: ${response.statusText}`)
  }

  const data = (await response.json()) as { sid: string }
  return { sid: data.sid }
}
