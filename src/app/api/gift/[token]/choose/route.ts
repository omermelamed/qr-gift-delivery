import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = await request.json().catch(() => ({}))
  const giftId: string | null = body.giftId ?? null
  if (!giftId) {
    return NextResponse.json({ ok: false, error: 'giftId required' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: tokenRow } = await service
    .from('gift_tokens')
    .select('campaign_id, gift_id, redeemed')
    .eq('token', token)
    .single()

  if (!tokenRow) {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 404 })
  }

  // Validate the chosen gift belongs to this token's campaign
  const { data: gift } = await service
    .from('campaign_gifts')
    .select('id, name')
    .eq('id', giftId)
    .eq('campaign_id', tokenRow.campaign_id)
    .single()

  if (!gift) {
    return NextResponse.json({ ok: false, error: 'invalid_gift' }, { status: 400 })
  }

  // Already chosen or already redeemed -> locked. Return the effective choice.
  if (tokenRow.gift_id || tokenRow.redeemed) {
    const effectiveId = tokenRow.gift_id ?? giftId
    const { data: current } = await service
      .from('campaign_gifts')
      .select('id, name')
      .eq('id', effectiveId)
      .single()
    return NextResponse.json({ ok: true, locked: true, gift: current ?? gift })
  }

  // Atomic lock: first writer wins
  const { data: locked } = await service
    .from('gift_tokens')
    .update({ gift_id: giftId, gift_chosen_at: new Date().toISOString() })
    .eq('token', token)
    .is('gift_id', null)
    .eq('redeemed', false)
    .select('gift_id')
    .single()

  if (!locked) {
    // Race: another request locked it first -> re-read and return that choice
    const { data: row } = await service
      .from('gift_tokens')
      .select('gift_id')
      .eq('token', token)
      .single()
    const chosenId = row?.gift_id ?? giftId
    const { data: g } = await service
      .from('campaign_gifts')
      .select('id, name')
      .eq('id', chosenId)
      .single()
    return NextResponse.json({ ok: true, locked: true, gift: g ?? gift })
  }

  return NextResponse.json({ ok: true, locked: false, gift })
}
