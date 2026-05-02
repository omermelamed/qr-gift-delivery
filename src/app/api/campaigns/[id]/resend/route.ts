import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { sendGiftMMS } from '@/lib/twilio'
import { logAuditEvent } from '@/lib/audit'
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'campaigns:launch')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, name')
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const { data: tokens } = await service
    .from('gift_tokens')
    .select('id, employee_name, phone_number, qr_image_url')
    .eq('campaign_id', campaignId)
    .eq('redeemed', false)

  if (!tokens || tokens.length === 0) {
    return NextResponse.json({ dispatched: 0, failed: 0 })
  }

  let dispatched = 0
  let failed = 0

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (token) => {
        if (process.env.TWILIO_MOCK !== 'true') {
          await sendGiftMMS({
            to: token.phone_number,
            employeeName: token.employee_name,
            holidayName: campaign.name,
            qrImageUrl: token.qr_image_url ?? '',
          })
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

  logAuditEvent({
    companyId: appMeta.company_id,
    actorId: user.id,
    action: 'campaign.reminder_sent',
    resourceType: 'campaign',
    resourceId: campaignId,
    metadata: { name: campaign.name, dispatched, failed },
  })

  return NextResponse.json({ dispatched, failed })
}
