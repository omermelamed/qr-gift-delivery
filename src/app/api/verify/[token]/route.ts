import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = await request.json().catch(() => ({}))
  const distributorId: string | null = body.distributorId ?? null

  const supabase = createServiceClient()

  // Fetch token row with campaign closed_at in one query
  const { data: tokenRow } = await supabase
    .from('gift_tokens')
    .select('id, employee_name, redeemed, campaign_id, campaigns(closed_at)')
    .eq('token', token)
    .single()

  if (!tokenRow) {
    return NextResponse.json({ valid: false, reason: 'invalid' })
  }

  const campaign = tokenRow.campaigns as unknown as { closed_at: string | null } | null
  if (campaign?.closed_at) {
    return NextResponse.json({ valid: false, reason: 'campaign_closed' })
  }

  if (tokenRow.redeemed) {
    return NextResponse.json({
      valid: false,
      reason: 'already_used',
      employeeName: tokenRow.employee_name,
    })
  }

  // Atomic write: first writer wins
  const { data: redeemed } = await supabase
    .from('gift_tokens')
    .update({
      redeemed: true,
      redeemed_at: new Date().toISOString(),
      redeemed_by: distributorId,
    })
    .eq('token', token)
    .eq('redeemed', false)
    .select('employee_name')
    .single()

  if (redeemed) {
    return NextResponse.json({ valid: true, employeeName: redeemed.employee_name })
  }

  // Race condition: another request redeemed it between our read and write
  return NextResponse.json({
    valid: false,
    reason: 'already_used',
    employeeName: tokenRow.employee_name,
  })
}
