import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = await request.json().catch(() => ({}))
  const attending: unknown = body.attending

  if (typeof attending !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: tokenRow } = await service
    .from('gift_tokens')
    .select('redeemed, campaigns(supports_arrival_certificates, closed_at, max_attendee_count)')
    .eq('token', token)
    .single()

  if (!tokenRow) {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 404 })
  }

  const campaign = tokenRow.campaigns as unknown as
    { supports_arrival_certificates: boolean; closed_at: string | null; max_attendee_count: number | null } | null

  if (!campaign?.supports_arrival_certificates) {
    return NextResponse.json({ ok: false, error: 'not_supported' }, { status: 400 })
  }
  if (campaign.closed_at) {
    return NextResponse.json({ ok: false, error: 'campaign_closed' }, { status: 409 })
  }
  if (tokenRow.redeemed) {
    return NextResponse.json({ ok: false, error: 'locked' }, { status: 409 })
  }

  // Count is required and positive only when coming; cleared otherwise.
  let attendeeCount: number | null = null
  if (attending) {
    const raw = body.attendeeCount
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
      return NextResponse.json({ ok: false, error: 'invalid_count' }, { status: 400 })
    }
    attendeeCount = raw
    const max = campaign.max_attendee_count
    if (max !== null && raw > max) {
      return NextResponse.json({ ok: false, error: 'over_limit', max }, { status: 400 })
    }
  }

  // Idempotent overwrite: latest answer replaces the previous one.
  // WHERE redeemed = false keeps the lock-once-redeemed guarantee atomic.
  const { data: updated } = await service
    .from('gift_tokens')
    .update({
      attending,
      attendee_count: attendeeCount,
      responded_at: new Date().toISOString(),
    })
    .eq('token', token)
    .eq('redeemed', false)
    .select('attending, attendee_count')
    .single()

  if (!updated) {
    // Redeemed between the read above and this write.
    return NextResponse.json({ ok: false, error: 'locked' }, { status: 409 })
  }

  return NextResponse.json({
    ok: true,
    attending: updated.attending,
    attendeeCount: updated.attendee_count,
  })
}
