import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { resolveCompanyId } from '@/lib/platform-auth'
import { logAuditEvent } from '@/lib/audit'
import type { JwtAppMetadata } from '@/types'

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
  if (typeof body.rsvpLocked !== 'boolean') {
    return NextResponse.json({ error: 'rsvpLocked must be a boolean' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, supports_arrival_certificates')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (!campaign.supports_arrival_certificates) {
    return NextResponse.json({ error: 'not_supported' }, { status: 400 })
  }

  // No sent_at/closed_at guard: locking/unlocking must work on a live campaign.
  const { error: updateError } = await service
    .from('campaigns')
    .update({ rsvp_locked: body.rsvpLocked })
    .eq('id', campaignId)
    .eq('company_id', companyId)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
  }

  logAuditEvent({
    companyId,
    actorId: user.id,
    action: 'campaign.rsvp_lock_changed',
    resourceType: 'campaign',
    resourceId: campaignId,
    metadata: { rsvpLocked: body.rsvpLocked },
  })

  return NextResponse.json({ ok: true, rsvpLocked: body.rsvpLocked })
}
