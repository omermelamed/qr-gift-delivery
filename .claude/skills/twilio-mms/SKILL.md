---
name: twilio-mms
description: Workflow for sending personalized MMS messages via Twilio — single send, bulk campaign dispatch, rate limiting, and error handling. Use when implementing the SMS blast API route or resend functionality.
---

# Twilio MMS

## Single send helper

```ts
import twilio from 'twilio'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
)

export async function sendGiftMMS(params: {
  to: string
  employeeName: string
  holidayName: string
  qrImageUrl: string
}): Promise<{ sid: string }> {
  const message = await client.messages.create({
    from: process.env.TWILIO_PHONE_NUMBER!,
    to: params.to,
    body: `Hi ${params.employeeName}, your ${params.holidayName} gift is ready. Show this QR code to collect it.`,
    mediaUrl: [params.qrImageUrl]
  })
  return { sid: message.sid }
}
```

## Bulk dispatch pattern

```ts
// Process in small batches with delay to avoid Twilio rate limits
const BATCH_SIZE = 50
const DELAY_MS = 1000

for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
  const batch = tokens.slice(i, i + BATCH_SIZE)

  await Promise.allSettled(
    batch.map(async (token) => {
      try {
        await sendGiftMMS({ ... })
        await supabase
          .from('gift_tokens')
          .update({ sms_sent_at: new Date().toISOString() })
          .eq('id', token.id)
      } catch (err) {
        // log error but don't abort the batch
        console.error(`Failed to send to ${token.phone_number}:`, err)
      }
    })
  )

  if (i + BATCH_SIZE < tokens.length) {
    await new Promise(r => setTimeout(r, DELAY_MS))
  }
}
```

## Phone number validation

Israeli numbers: must start with `+972` or `05x`. Validate before attempting send:

```ts
function isValidIsraeliPhone(phone: string): boolean {
  return /^(\+972|05\d)\d{7,8}$/.test(phone.replace(/[\s-]/g, ''))
}
```

## Error handling rules

- `Promise.allSettled` — never abort the full blast on one failure
- log failed sends with phone (masked) and error for admin resend
- update `sms_sent_at` only after Twilio confirms (`.sid` exists in response)
- the QR image URL must be publicly accessible before sending — Twilio fetches it server-side

## Anti-patterns

- do not use `Promise.all` for bulk sends — one failure kills the batch
- do not send before the QR image is uploaded and public
- do not store Twilio credentials anywhere except server-side env vars
