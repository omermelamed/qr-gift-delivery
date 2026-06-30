import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { verifyAndRedeem } from '@/lib/verify-redemption'
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
  const giftId: string | null = body.giftId ?? null
  // Actual arrived headcount (arrival-certificate campaigns). Clamp to a sane
  // integer ≥ 1 when provided; null means "not entered yet".
  const rawCount = Number(body.arrivedCount)
  const arrivedCount: number | null =
    body.arrivedCount != null && Number.isInteger(rawCount) && rawCount >= 1 ? rawCount : null

  const outcome = await verifyAndRedeem(
    token,
    { id: caller.id, app_metadata: caller.app_metadata as JwtAppMetadata | undefined },
    giftId,
    arrivedCount
  )

  // Preserve the prior 500 contract for a distributor-lookup DB failure
  if (!outcome.valid && outcome.reason === 'error') {
    return NextResponse.json({ valid: false, reason: 'invalid' }, { status: 500 })
  }

  return NextResponse.json(outcome)
}
