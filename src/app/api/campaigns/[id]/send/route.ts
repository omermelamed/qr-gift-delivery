import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { getSmsProvider } from '@/lib/sms'
import { planTokenMessages } from '@/lib/sms/dispatch'
import { generateQrBuffer } from '@/lib/qr'
import { logAuditEvent } from '@/lib/audit'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'
import { resolveSmsTemplate } from '@/lib/sms-template'

const BATCH_SIZE = 50
const DELAY_MS = 1000

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  // Accept either user session auth OR internal cron secret
  const cronSecret = _request.headers.get('x-cron-secret')
  const isCronCall = !!(cronSecret && cronSecret === process.env.CRON_SECRET)

  let companyId: string | undefined
  let actorUserId: string | undefined

  if (!isCronCall) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    actorUserId = user.id
    const appMeta = user.app_metadata as JwtAppMetadata
    const resolved = await resolveCompanyId(appMeta)
    if (!resolved) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)
    if (!hasPermission(permissions, 'campaigns:launch')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    companyId = resolved
  }

  const service = createServiceClient()

  // For user calls, scope the lookup to their company. For cron calls, derive
  // the company from the campaign row itself — never trust a client header (H6).
  const baseQuery = service
    .from('campaigns')
    .select('id, name, company_id, sent_at, sms_template')
    .eq('id', campaignId)
  const { data: campaign, error: campaignError } = isCronCall
    ? await baseQuery.single()
    : await baseQuery.eq('company_id', companyId!).single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  // Cron path: company is whatever the campaign belongs to.
  if (isCronCall) companyId = campaign.company_id

  if (campaign.sent_at) {
    return NextResponse.json({ error: 'Campaign already dispatched' }, { status: 409 })
  }

  const { data: company } = await service
    .from('companies')
    .select('sms_template')
    .eq('id', campaign.company_id)
    .single()

  const effectiveTemplate = resolveSmsTemplate(campaign.sms_template, company?.sms_template ?? null)

  const { data: tokens, error: tokensError } = await service
    .from('gift_tokens')
    .select('id, token, employee_name, phone_number, qr_image_url')
    .eq('campaign_id', campaignId)
    .is('sms_sent_at', null)

  if (tokensError || !tokens) {
    return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 })
  }

  // Campaigns are no longer gated by a pre-purchased credit balance — payment
  // will happen at the end of the create-campaign flow in a future change.
  // `planTokenMessages` still plans each recipient's SMS body (and segment
  // count, kept for a future per-segment pricing model) up front.
  const { plan } = planTokenMessages(tokens, {
    campaignName: campaign.name,
    effectiveTemplate,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? '',
  })

  const smsProvider = getSmsProvider()
  const smsSending = smsProvider.isConfigured()
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

        if (smsSending && token.phone_number) {
          const body = plan.get(token.id)?.body ?? ''
          const result = await smsProvider.send({ to: token.phone_number, body })
          if (result.status === 'failed') {
            throw new Error(result.error ?? 'SMS send failed')
          }
        }

        const { error: sentError } = await service
          .from('gift_tokens')
          .update({ sms_sent_at: new Date().toISOString() })
          .eq('id', token.id)
        if (sentError) throw new Error(sentError.message)
      })
    )

    results.forEach((result) => {
      if (result.status === 'fulfilled') dispatched++
      else {
        failed++
        console.error('[send] token failed:', result.reason)
      }
    })

    if (i + BATCH_SIZE < tokens.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS))
    }
  }

  await service
    .from('campaigns')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', campaignId)

  if (!isCronCall) {
    logAuditEvent({
      companyId: campaign.company_id,
      actorId: actorUserId ?? null,
      action: 'campaign.launched',
      resourceType: 'campaign',
      resourceId: campaignId,
      metadata: { name: campaign.name, token_count: tokens.length },
    })
  }

  return NextResponse.json({ dispatched, failed, campaignId, smsSending })
}
