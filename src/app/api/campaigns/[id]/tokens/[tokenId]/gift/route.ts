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
  const giftId: string | null = body.giftId ?? null

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (giftId) {
    const { data: gift } = await service
      .from('campaign_gifts')
      .select('id')
      .eq('id', giftId)
      .eq('campaign_id', campaignId)
      .single()
    if (!gift) return NextResponse.json({ error: 'invalid_gift' }, { status: 400 })
  }

  // Admin override is allowed anytime, including after redemption.
  const { data: updated } = await service
    .from('gift_tokens')
    .update({ gift_id: giftId, gift_chosen_at: giftId ? new Date().toISOString() : null })
    .eq('id', tokenId)
    .eq('campaign_id', campaignId)
    .select('id, gift_id')
    .single()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  logAuditEvent({
    companyId,
    actorId: user.id,
    action: 'token.gift_changed',
    resourceType: 'gift_token',
    resourceId: tokenId,
    metadata: { gift_id: giftId },
  })

  return NextResponse.json({ ok: true, gift_id: updated.gift_id })
}
