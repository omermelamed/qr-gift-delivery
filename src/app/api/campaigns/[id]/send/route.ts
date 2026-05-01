import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { sendGiftMMS, isTwilioConfigured } from '@/lib/twilio'
import { generateQrBuffer } from '@/lib/qr'
import type { JwtAppMetadata } from '@/types'

const BATCH_SIZE = 50
const DELAY_MS = 1000

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'campaigns:launch')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: campaign, error: campaignError } = await service
    .from('campaigns')
    .select('id, name, company_id, sent_at')
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  if (campaign.sent_at) {
    return NextResponse.json({ error: 'Campaign already dispatched' }, { status: 409 })
  }

  const { data: company } = await service
    .from('companies')
    .select('sms_template')
    .eq('id', campaign.company_id)
    .single()

  const smsTemplate = company?.sms_template ?? null

  const { data: tokens, error: tokensError } = await service
    .from('gift_tokens')
    .select('id, token, employee_name, phone_number, qr_image_url')
    .eq('campaign_id', campaignId)
    .is('sms_sent_at', null)

  if (tokensError || !tokens) {
    return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 })
  }

  const smsSending = isTwilioConfigured()
  let dispatched = 0
  let failed = 0

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (token) => {
        let qrImageUrl = token.qr_image_url

        if (!qrImageUrl) {
          const buf = await generateQrBuffer(token.token)
          const filePath = `${campaignId}/${token.token}.png`
          const { error: uploadError } = await service.storage
            .from('qr-codes')
            .upload(filePath, buf, { contentType: 'image/png', upsert: true })
          if (uploadError) throw new Error(uploadError.message)
          const { data: { publicUrl } } = service.storage
            .from('qr-codes')
            .getPublicUrl(filePath)
          qrImageUrl = publicUrl
          await service
            .from('gift_tokens')
            .update({ qr_image_url: qrImageUrl })
            .eq('id', token.id)
        }

        if (smsSending) {
          await sendGiftMMS({
            to: token.phone_number,
            employeeName: token.employee_name,
            holidayName: campaign.name,
            qrImageUrl,
            body: smsTemplate
              ? smsTemplate
                  .replace('{name}', token.employee_name)
                  .replace('{link}', `${process.env.NEXT_PUBLIC_APP_URL}/verify/${token.token}`)
              : undefined,
          })
        }

        const { error: sentError } = await service
          .from('gift_tokens')
          .update({ sms_sent_at: new Date().toISOString() })
          .eq('id', token.id)
        if (sentError) throw new Error(sentError.message)
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled') dispatched++
      else {
        failed++
        console.error('[send] token failed:', result.reason)
      }
    }

    if (i + BATCH_SIZE < tokens.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS))
    }
  }

  // Stamp sent_at unconditionally — the campaign is "launched" regardless of
  // individual SMS delivery results. Failures are surfaced via the dispatched/failed counts.
  await service
    .from('campaigns')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', campaignId)

  return NextResponse.json({ dispatched, failed, campaignId, smsSending })
}
