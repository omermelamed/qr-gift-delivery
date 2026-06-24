import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { getSmsProvider, buildGiftSmsBody } from '@/lib/sms'
import { generateQrBuffer } from '@/lib/qr'
import { logAuditEvent } from '@/lib/audit'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'
import { resolveSmsTemplate, renderSmsTemplate } from '@/lib/sms-template'

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

  // Credit check — count tokens that will actually send SMS
  const smsTokens = tokens.filter((t) => t.phone_number)
  const smsCount = smsTokens.length

  if (smsCount > 0) {
    const { data: credits } = await service
      .from('credits')
      .select('id, balance, total_used')
      .eq('company_id', companyId)
      .single()

    if (!credits || credits.balance < smsCount) {
      return NextResponse.json(
        { error: `Insufficient SMS credits: need ${smsCount}, have ${credits?.balance ?? 0}` },
        { status: 402 }
      )
    }

    // Atomic reserve — .gte guard prevents race conditions
    const { error: reserveError } = await service
      .from('credits')
      .update({
        total_used: credits.total_used + smsCount,
        balance: credits.balance - smsCount,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .gte('balance', smsCount)

    if (reserveError) {
      return NextResponse.json({ error: 'Failed to reserve credits' }, { status: 402 })
    }

    await service.from('credit_transactions').insert({
      company_id: companyId,
      amount: smsCount,
      type: 'use' as const,
      description: `Campaign "${campaign.name}" — ${smsCount} SMS`,
      created_by: actorUserId ?? null,
    })
  }

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

        const giftLink = `${process.env.NEXT_PUBLIC_APP_URL}/gift/${token.token}`

        if (smsSending && token.phone_number) {
          const body = effectiveTemplate
            ? renderSmsTemplate(effectiveTemplate, { name: token.employee_name, link: giftLink })
            : buildGiftSmsBody({
                employeeName: token.employee_name,
                holidayName: campaign.name,
                giftLink,
              })
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

  // Refund credits for failed SMS sends
  if (failed > 0 && smsCount > 0) {
    const { data: currentCredits } = await service
      .from('credits')
      .select('total_used, balance')
      .eq('company_id', companyId!)
      .single()

    if (currentCredits) {
      await service
        .from('credits')
        .update({
          total_used: currentCredits.total_used - failed,
          balance: currentCredits.balance + failed,
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', companyId!)

      await service.from('credit_transactions').insert({
        company_id: companyId!,
        amount: failed,
        type: 'refund' as const,
        description: `Campaign "${campaign.name}" — ${failed} failed SMS refunded`,
        created_by: actorUserId ?? null,
      })
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
