import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import { getSmsProvider } from '@/lib/sms'
import type { JwtAppMetadata } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'sms_campaigns:send')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()
  const companyId = appMeta.company_id

  // Load campaign
  const { data: campaign } = await service
    .from('sms_campaigns')
    .select('id, status, recipients_count')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.status !== 'draft') {
    return NextResponse.json({ error: `Campaign is ${campaign.status}, not draft` }, { status: 400 })
  }
  if (campaign.recipients_count === 0) {
    return NextResponse.json({ error: 'No recipients in campaign' }, { status: 400 })
  }

  // Credit validation + atomic reserve
  // Read current state
  const { data: credits } = await service
    .from('credits')
    .select('total_purchased, total_used, balance')
    .eq('company_id', companyId)
    .single()

  if (!credits || credits.balance < campaign.recipients_count) {
    return NextResponse.json({
      error: 'Insufficient credits',
      required: campaign.recipients_count,
      available: credits?.balance ?? 0,
    }, { status: 402 })
  }

  // Reserve: deduct from balance, add to total_used
  const reserveAmount = campaign.recipients_count
  const { error: reserveError, count: reserveCount } = await service
    .from('credits')
    .update({
      total_used: credits.total_used + reserveAmount,
      balance: credits.balance - reserveAmount,
      updated_at: new Date().toISOString(),
    })
    .eq('company_id', companyId)
    .gte('balance', reserveAmount)

  if (reserveError || reserveCount === 0) {
    return NextResponse.json({ error: 'Failed to reserve credits — balance may have changed' }, { status: 409 })
  }

  // Mark campaign as sending
  await service
    .from('sms_campaigns')
    .update({ status: 'sending', credits_reserved: reserveAmount })
    .eq('id', id)

  // Record reservation transaction
  await service.from('credit_transactions').insert({
    company_id: companyId,
    amount: reserveAmount,
    type: 'use',
    description: `Campaign: ${reserveAmount} messages reserved`,
    created_by: user.id,
  })

  // Load pending messages
  const { data: messages } = await service
    .from('sms_messages')
    .select('id, recipient_phone, body')
    .eq('campaign_id', id)
    .eq('status', 'pending')

  if (!messages || messages.length === 0) {
    // No messages — refund and mark sent
    await service
      .from('credits')
      .update({
        total_used: credits.total_used,
        balance: credits.balance,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
    await service.from('sms_campaigns').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ sent: 0, failed: 0 })
  }

  // Build status callback URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL
  const callbackUrl = baseUrl ? `${baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`}/api/sms/webhooks/twilio/status` : undefined

  // Send messages
  const provider = getSmsProvider()
  let sentCount = 0
  let failedCount = 0

  for (const msg of messages) {
    const result = await provider.send({
      to: msg.recipient_phone,
      body: msg.body,
      messageId: msg.id,
      statusCallbackUrl: callbackUrl,
    })

    if (result.status === 'failed') {
      failedCount++
      await service
        .from('sms_messages')
        .update({ status: 'failed', error_message: result.error ?? 'Send failed' })
        .eq('id', msg.id)
    } else {
      sentCount++
      await service
        .from('sms_messages')
        .update({
          status: result.status === 'sent' ? 'sent' : 'queued',
          provider_id: result.providerId,
          sent_at: new Date().toISOString(),
        })
        .eq('id', msg.id)
    }
  }

  // Finalize campaign
  await service
    .from('sms_campaigns')
    .update({
      status: failedCount === messages.length ? 'failed' : 'sent',
      sent_count: sentCount,
      failed_count: failedCount,
      sent_at: new Date().toISOString(),
    })
    .eq('id', id)

  // Refund credits for failed messages
  if (failedCount > 0) {
    await service
      .from('credits')
      .update({
        total_used: credits.total_used + sentCount,
        balance: credits.balance - sentCount,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)

    await service.from('credit_transactions').insert({
      company_id: companyId,
      amount: failedCount,
      type: 'refund',
      description: `Campaign: ${failedCount} failed messages refunded`,
      created_by: user.id,
    })
  }

  logAuditEvent({
    companyId,
    actorId: user.id,
    action: 'sms_campaign.sent',
    resourceType: 'sms_campaign',
    resourceId: id,
    metadata: { sent: sentCount, failed: failedCount, total: messages.length },
  })

  return NextResponse.json({ sent: sentCount, failed: failedCount })
}
