import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { getSmsProvider, buildGiftSmsBody } from '@/lib/sms'
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

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)
  if (!hasPermission(permissions, 'campaigns:launch')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, name, sms_template')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const { data: company } = await service
    .from('companies')
    .select('sms_template')
    .eq('id', companyId)
    .single()

  const effectiveTemplate = resolveSmsTemplate(campaign.sms_template, company?.sms_template ?? null)

  const body = await _request.json().catch(() => ({}))
  const tokenIds: string[] | undefined = Array.isArray(body.tokenIds) ? body.tokenIds : undefined

  let query = service
    .from('gift_tokens')
    .select('id, token, employee_name, phone_number, qr_image_url')
    .eq('campaign_id', campaignId)
    .eq('redeemed', false)

  if (tokenIds && tokenIds.length > 0) {
    query = query.in('id', tokenIds)
  }

  const { data: tokens } = await query

  if (!tokens || tokens.length === 0) {
    return NextResponse.json({ dispatched: 0, failed: 0 })
  }

  // Credit check for resend
  const smsTokens = tokens.filter((t) => !!t.phone_number)
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
      description: `Campaign "${campaign.name}" resend — ${smsCount} SMS`,
      created_by: user.id,
    })
  }

  const smsProvider = getSmsProvider()
  let dispatched = 0
  let failed = 0

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (token) => {
        if (token.phone_number) {
          const giftLink = `${process.env.NEXT_PUBLIC_APP_URL}/gift/${token.token}`
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
    for (const r of results) {
      if (r.status === 'fulfilled') dispatched++
      else { failed++; console.error('[resend] token failed:', r.reason) }
    }
    if (i + BATCH_SIZE < tokens.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS))
    }
  }

  // Refund credits for failed resends
  if (failed > 0 && smsCount > 0) {
    const { data: currentCredits } = await service
      .from('credits')
      .select('total_used, balance')
      .eq('company_id', companyId)
      .single()

    if (currentCredits) {
      await service
        .from('credits')
        .update({
          total_used: currentCredits.total_used - failed,
          balance: currentCredits.balance + failed,
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', companyId)

      await service.from('credit_transactions').insert({
        company_id: companyId,
        amount: failed,
        type: 'refund' as const,
        description: `Campaign "${campaign.name}" resend — ${failed} failed SMS refunded`,
        created_by: user.id,
      })
    }
  }

  logAuditEvent({
    companyId: companyId,
    actorId: user.id,
    action: 'campaign.reminder_sent',
    resourceType: 'campaign',
    resourceId: campaignId,
    metadata: { name: campaign.name, dispatched, failed },
  })

  return NextResponse.json({ dispatched, failed })
}
