import twilio from 'twilio'

export async function sendGiftMMS(params: {
  to: string
  employeeName: string
  holidayName: string
  qrImageUrl: string
}): Promise<{ sid: string }> {
  if (process.env.TWILIO_MOCK === 'true') {
    console.log(`[MOCK SMS] To: ${params.to} | Employee: ${params.employeeName}`)
    return { sid: 'mock' }
  }

  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  )

  const message = await client.messages.create({
    from: process.env.TWILIO_PHONE_NUMBER!,
    to: params.to,
    body: `Hi ${params.employeeName}, your ${params.holidayName} gift is ready. Show this QR code to collect it.`,
    mediaUrl: [params.qrImageUrl],
  })

  return { sid: message.sid }
}
