import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { logAuditEvent } from '@/lib/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = await request.json().catch(() => ({}))
  const distributorId: string | null = body.distributorId ?? null
  const giftId: string | null = body.giftId ?? null

  const supabase = createServiceClient()

  // Fetch token row with campaign info in one query
  const { data: tokenRow } = await supabase
    .from('gift_tokens')
    .select('id, employee_name, redeemed, campaign_id, campaigns(closed_at, company_id, name)')
    .eq('token', token)
    .single()

  if (!tokenRow) {
    return NextResponse.json({ valid: false, reason: 'invalid' })
  }

  const campaign = tokenRow.campaigns as unknown as { closed_at: string | null; company_id: string; name?: string } | null
  if (campaign?.closed_at) {
    return NextResponse.json({ valid: false, reason: 'campaign_closed' })
  }

  // Distributor restriction check — admins bypass it
  const { data: assignedDistributors, error: distError } = await supabase
    .from('campaign_distributors')
    .select('user_id')
    .eq('campaign_id', tokenRow.campaign_id)

  if (distError) {
    return NextResponse.json({ valid: false, reason: 'invalid' }, { status: 500 })
  }

  if (assignedDistributors && assignedDistributors.length > 0 && distributorId) {
    const assignedIds = new Set(assignedDistributors.map((r) => r.user_id))
    if (!assignedIds.has(distributorId)) {
      const companyId = campaign?.company_id
      const { data: privilegedRole } = companyId
        ? await supabase
            .from('user_company_roles')
            .select('roles!inner(name)')
            .eq('user_id', distributorId)
            .eq('company_id', companyId)
            .in('roles.name', ['company_admin', 'campaign_manager'])
            .maybeSingle()
        : { data: null }

      if (!privilegedRole) {
        return NextResponse.json({ valid: false, reason: 'not_authorized' })
      }
    }
  } else if (assignedDistributors && assignedDistributors.length > 0 && !distributorId) {
    return NextResponse.json({ valid: false, reason: 'not_authorized' })
  }

  // Fetch gift options for this campaign
  const { data: campaignGifts } = await supabase
    .from('campaign_gifts')
    .select('id, name, position')
    .eq('campaign_id', tokenRow.campaign_id)
    .order('position', { ascending: true })

  const gifts = campaignGifts ?? []

  // Multi-gift: ask scanner to pick before redeeming
  if (gifts.length >= 2 && !giftId) {
    return NextResponse.json({
      valid: true,
      needsGiftSelection: true,
      employeeName: tokenRow.employee_name,
      gifts: gifts.map((g) => ({ id: g.id, name: g.name, position: g.position })),
    })
  }

  if (tokenRow.redeemed) {
    return NextResponse.json({
      valid: false,
      reason: 'already_used',
      employeeName: tokenRow.employee_name,
    })
  }

  // Auto-stamp single gift when campaign has exactly one option
  const resolvedGiftId = giftId ?? (gifts.length === 1 ? gifts[0].id : null)

  // Atomic write: first writer wins
  const { data: redeemed } = await supabase
    .from('gift_tokens')
    .update({
      redeemed: true,
      redeemed_at: new Date().toISOString(),
      redeemed_by: distributorId,
      gift_id: resolvedGiftId,
    })
    .eq('token', token)
    .eq('redeemed', false)
    .select('employee_name')
    .single()

  if (redeemed) {
    logAuditEvent({
      companyId: campaign?.company_id ?? '',
      actorId: distributorId,
      action: 'token.redeemed',
      resourceType: 'gift_token',
      resourceId: tokenRow.id,
      metadata: {
        employee_name: redeemed.employee_name,
        campaign_name: (tokenRow.campaigns as unknown as { name?: string } | null)?.name ?? '',
        gift_id: resolvedGiftId,
      },
    })
    return NextResponse.json({ valid: true, employeeName: redeemed.employee_name })
  }

  // Race condition: another request redeemed it between our read and write
  return NextResponse.json({
    valid: false,
    reason: 'already_used',
    employeeName: tokenRow.employee_name,
  })
}
