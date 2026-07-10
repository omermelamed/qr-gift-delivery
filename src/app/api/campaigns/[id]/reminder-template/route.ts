import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'

export async function PATCH(
  request: NextRequest,
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

  const body = await request.json().catch(() => ({}))
  if (!('reminderSmsTemplate' in body)) {
    return NextResponse.json({ error: 'reminderSmsTemplate is required' }, { status: 400 })
  }

  const raw = body.reminderSmsTemplate
  let reminderSmsTemplate: string | null
  if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    reminderSmsTemplate = null
  } else if (typeof raw === 'string') {
    if (!raw.includes('{link}')) {
      return NextResponse.json({ error: 'invalid_template' }, { status: 400 })
    }
    reminderSmsTemplate = raw.trim()
  } else {
    return NextResponse.json({ error: 'invalid_template' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const { error: updateError } = await service
    .from('campaigns')
    .update({ reminder_sms_template: reminderSmsTemplate })
    .eq('id', campaignId)
    .eq('company_id', companyId)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update reminder message' }, { status: 500 })
  }

  logAuditEvent({
    companyId,
    actorId: user.id,
    action: 'campaign.reminder_template_updated',
    resourceType: 'campaign',
    resourceId: campaignId,
    metadata: { reminderSmsTemplate },
  })

  return NextResponse.json({ ok: true })
}
