import { createServiceClient } from '@/lib/supabase/server'
import { logAuditEvent } from '@/lib/audit'
import type { JwtAppMetadata, GiftOption } from '@/types'

// Single source of truth for token verification + redemption, shared by both
// scan surfaces: the camera scanner (POST /api/verify/[token]) and the QR-link
// page (/verify/[token]). Keeping the logic here guarantees the two paths behave
// identically — same authorization, same gift resolution, same atomic write.

export type VerifyCaller = { id: string; app_metadata?: JwtAppMetadata }

export type VerifyOutcome =
  | { valid: true; employeeName: string; giftName: string | null }
  | { valid: true; needsGiftSelection: true; employeeName: string; gifts: GiftOption[] }
  | { valid: false; reason: 'invalid' }
  | { valid: false; reason: 'error' }
  | { valid: false; reason: 'campaign_closed' }
  | { valid: false; reason: 'not_authorized' }
  | { valid: false; reason: 'already_used'; employeeName: string; giftName: string | null }

export async function verifyAndRedeem(
  token: string,
  caller: VerifyCaller,
  giftId: string | null = null
): Promise<VerifyOutcome> {
  const distributorId = caller.id
  const supabase = createServiceClient()

  // Fetch token row with campaign info in one query
  const { data: tokenRow } = await supabase
    .from('gift_tokens')
    .select('id, employee_name, redeemed, campaign_id, gift_id, campaigns(closed_at, company_id, name)')
    .eq('token', token)
    .single()

  if (!tokenRow) return { valid: false, reason: 'invalid' }

  const campaign = tokenRow.campaigns as unknown as { closed_at: string | null; company_id: string; name?: string } | null
  if (campaign?.closed_at) return { valid: false, reason: 'campaign_closed' }

  // Distributor restriction check — admins bypass it
  const { data: assignedDistributors, error: distError } = await supabase
    .from('campaign_distributors')
    .select('user_id')
    .eq('campaign_id', tokenRow.campaign_id)

  if (distError) return { valid: false, reason: 'error' }

  if (assignedDistributors && assignedDistributors.length > 0 && distributorId) {
    const assignedIds = new Set(assignedDistributors.map((r) => r.user_id))
    const callerIsPlatformAdmin = caller.app_metadata?.role_name === 'platform_admin'
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

      if (!privilegedRole) return { valid: false, reason: 'not_authorized' }
    }
  } else if (assignedDistributors && assignedDistributors.length > 0 && !distributorId) {
    return { valid: false, reason: 'not_authorized' }
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
  const giftNameFor = (id: string | null) =>
    id ? gifts.find((g) => g.id === id)?.name ?? null : null

  if (tokenRow.redeemed) {
    return {
      valid: false,
      reason: 'already_used',
      employeeName: tokenRow.employee_name,
      giftName: giftNameFor(storedGiftId),
    }
  }

  // Multi-gift with no employee choice and no scanner pick -> ask for a selection
  if (gifts.length >= 2 && !storedGiftId && !giftId) {
    return {
      valid: true,
      needsGiftSelection: true,
      employeeName: tokenRow.employee_name,
      gifts: gifts.map((g) => ({ id: g.id, name: g.name, position: g.position })),
    }
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
  // Stamp choice time only when recording a gift the employee hadn't pre-chosen
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
    logAuditEvent({
      companyId: campaign?.company_id ?? '',
      actorId: distributorId,
      action: 'token.redeemed',
      resourceType: 'gift_token',
      resourceId: tokenRow.id,
      metadata: {
        employee_name: redeemed.employee_name,
        campaign_name: campaign?.name ?? '',
        gift_id: resolvedGiftId,
      },
    })
    return { valid: true, employeeName: redeemed.employee_name, giftName: giftNameFor(resolvedGiftId) }
  }

  // Race: another request redeemed it between our read and write
  return {
    valid: false,
    reason: 'already_used',
    employeeName: tokenRow.employee_name,
    giftName: giftNameFor(resolvedGiftId),
  }
}
