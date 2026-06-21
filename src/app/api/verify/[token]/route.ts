import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { logAuditEvent } from '@/lib/audit'
import type { JwtAppMetadata } from '@/types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Require authentication — unauthenticated callers cannot redeem tokens
  const authClient = await createClient()
  const { data: { user: caller } } = await authClient.auth.getUser()
  if (!caller) {
    return NextResponse.json({ valid: false, reason: 'not_authorized' })
  }

  const body = await request.json().catch(() => ({}))
  // Use the authenticated user's ID — never trust the client-supplied distributorId
  const distributorId: string = caller.id
  const giftId: string | null = body.giftId ?? null

  const supabase = createServiceClient()

  // Fetch token row with campaign info in one query
  const { data: tokenRow } = await supabase
    .from('gift_tokens')
    .select('id, employee_name, redeemed, campaign_id, gift_id, campaigns(closed_at, company_id, name)')
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
    const callerMeta = caller.app_metadata as JwtAppMetadata | undefined
    const callerIsPlatformAdmin = callerMeta?.role_name === 'platform_admin'
    if (!assignedIds.has(distributorId) && !callerIsPlatformAdmin) {
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

  // Fetch gift options for this campaign (gives us names for both the
  // already-claimed display and the redemption response)
  const { data: campaignGifts } = await supabase
    .from('campaign_gifts')
    .select('id, name, position')
    .eq('campaign_id', tokenRow.campaign_id)
    .order('position', { ascending: true })

  const gifts = campaignGifts ?? []
  const storedGiftId = (tokenRow as { gift_id: string | null }).gift_id

  if (tokenRow.redeemed) {
    const giftName = storedGiftId
      ? gifts.find((g) => g.id === storedGiftId)?.name ?? null
      : null
    return NextResponse.json({
      valid: false,
      reason: 'already_used',
      employeeName: tokenRow.employee_name,
      giftName,
    })
  }

  // Multi-gift with no employee choice and no scanner pick -> fall back to scanner selection
  if (gifts.length >= 2 && !storedGiftId && !giftId) {
    return NextResponse.json({
      valid: true,
      needsGiftSelection: true,
      employeeName: tokenRow.employee_name,
      gifts: gifts.map((g) => ({ id: g.id, name: g.name, position: g.position })),
    })
  }

  // Resolution order: employee's stored choice > scanner pick > single auto-stamp > none
  const resolvedGiftId = storedGiftId ?? giftId ?? (gifts.length === 1 ? gifts[0].id : null)

  const updatePayload: {
    redeemed: true
    redeemed_at: string
    redeemed_by: string
    gift_id: string | null
    gift_chosen_at?: string
  } = {
    redeemed: true,
    redeemed_at: new Date().toISOString(),
    redeemed_by: distributorId,
    gift_id: resolvedGiftId,
  }
  // Stamp choice time only when we are recording a gift the employee hadn't pre-chosen
  if (!storedGiftId && resolvedGiftId) {
    updatePayload.gift_chosen_at = new Date().toISOString()
  }

  // Atomic write: first writer wins
  const { data: redeemed } = await supabase
    .from('gift_tokens')
    .update(updatePayload)
    .eq('token', token)
    .eq('redeemed', false)
    .select('employee_name')
    .single()

  if (redeemed) {
    const giftName = resolvedGiftId
      ? gifts.find((g) => g.id === resolvedGiftId)?.name ?? null
      : null
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
    return NextResponse.json({ valid: true, employeeName: redeemed.employee_name, giftName })
  }

  // Race condition: another request redeemed it between our read and write
  return NextResponse.json({
    valid: false,
    reason: 'already_used',
    employeeName: tokenRow.employee_name,
    giftName: resolvedGiftId ? gifts.find((g) => g.id === resolvedGiftId)?.name ?? null : null,
  })
}
