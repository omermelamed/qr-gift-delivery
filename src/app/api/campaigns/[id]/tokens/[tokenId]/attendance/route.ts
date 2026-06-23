import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { resolveCompanyId } from '@/lib/platform-auth'
import { logAuditEvent } from '@/lib/audit'
import type { JwtAppMetadata } from '@/types'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tokenId: string }> }
) {
  const { id: campaignId, tokenId } = await params

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
  const raw = body.attendeeCount

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, supports_arrival_certificates')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!campaign.supports_arrival_certificates) {
    return NextResponse.json({ error: 'not_supported' }, { status: 400 })
  }

  // null/empty clears the record; a positive integer marks the person coming.
  let update: { attending: boolean | null; attendee_count: number | null; responded_at: string | null }
  if (raw === null || raw === undefined || raw === '') {
    update = { attending: null, attendee_count: null, responded_at: null }
  } else {
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
      return NextResponse.json({ error: 'invalid_count' }, { status: 400 })
    }
    update = { attending: true, attendee_count: raw, responded_at: new Date().toISOString() }
  }

  // Admin override is allowed anytime, including after redemption.
  const { data: updated } = await service
    .from('gift_tokens')
    .update(update)
    .eq('id', tokenId)
    .eq('campaign_id', campaignId)
    .select('id, attending, attendee_count')
    .single()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  logAuditEvent({
    companyId,
    actorId: user.id,
    action: 'token.attendance_changed',
    resourceType: 'gift_token',
    resourceId: tokenId,
    metadata: { attending: updated.attending, attendee_count: updated.attendee_count },
  })

  return NextResponse.json({ ok: true, attending: updated.attending, attendee_count: updated.attendee_count })
}
