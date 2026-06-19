import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import crypto from 'crypto'

// Twilio status values → our status enum
const STATUS_MAP: Record<string, string> = {
  queued: 'queued',
  sent: 'sent',
  delivered: 'delivered',
  undelivered: 'undelivered',
  failed: 'failed',
}

function validateTwilioSignature(request: NextRequest, body: string): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) return false

  const signature = request.headers.get('x-twilio-signature')
  if (!signature) return false

  const url = request.url
  const params = new URLSearchParams(body)
  const sortedKeys = [...params.keys()].sort()
  let data = url
  for (const key of sortedKeys) {
    data += key + params.get(key)
  }

  const expected = crypto
    .createHmac('sha1', authToken)
    .update(Buffer.from(data, 'utf-8'))
    .digest('base64')

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}

export async function POST(request: NextRequest) {
  const body = await request.text()

  // Validate signature in production
  if (process.env.TWILIO_MOCK !== 'true') {
    if (!validateTwilioSignature(request, body)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
    }
  }

  const params = new URLSearchParams(body)
  const messageSid = params.get('MessageSid')
  const messageStatus = params.get('MessageStatus')
  const errorCode = params.get('ErrorCode')

  if (!messageSid || !messageStatus) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const mappedStatus = STATUS_MAP[messageStatus.toLowerCase()]
  if (!mappedStatus) {
    // Unknown status — acknowledge but ignore
    return new NextResponse(null, { status: 204 })
  }

  const service = createServiceClient()

  // Find the message by provider_id (Twilio SID)
  const { data: message } = await service
    .from('sms_messages')
    .select('id, campaign_id, status')
    .eq('provider_id', messageSid)
    .single()

  if (!message) {
    // Message not found — could be from the old gift flow, acknowledge anyway
    return new NextResponse(null, { status: 204 })
  }

  // Only update if the new status is a progression (don't go backwards)
  const STATUS_PRIORITY: Record<string, number> = {
    pending: 0,
    queued: 1,
    sent: 2,
    delivered: 3,
    failed: 3,
    undelivered: 3,
  }

  const currentPriority = STATUS_PRIORITY[message.status] ?? 0
  const newPriority = STATUS_PRIORITY[mappedStatus] ?? 0

  if (newPriority <= currentPriority && message.status !== 'queued') {
    return new NextResponse(null, { status: 204 })
  }

  // Update message status
  const updates: Record<string, unknown> = { status: mappedStatus }

  if (mappedStatus === 'delivered') {
    updates.delivered_at = new Date().toISOString()
  }
  if (mappedStatus === 'failed' || mappedStatus === 'undelivered') {
    updates.error_message = errorCode ? `Error ${errorCode}` : 'Delivery failed'
  }

  await service
    .from('sms_messages')
    .update(updates)
    .eq('id', message.id)

  // Update campaign delivery counters
  await updateCampaignCounters(service, message.campaign_id)

  return new NextResponse(null, { status: 204 })
}

async function updateCampaignCounters(
  service: ReturnType<typeof createServiceClient>,
  campaignId: string
) {
  const { data: stats } = await service
    .from('sms_messages')
    .select('status')
    .eq('campaign_id', campaignId)

  if (!stats) return

  let delivered = 0
  let failed = 0
  let sent = 0

  for (const msg of stats) {
    if (msg.status === 'delivered') delivered++
    else if (msg.status === 'failed' || msg.status === 'undelivered') failed++
    else if (msg.status === 'sent' || msg.status === 'queued') sent++
  }

  await service
    .from('sms_campaigns')
    .update({
      sent_count: delivered + sent,
      failed_count: failed,
    })
    .eq('id', campaignId)
}
