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

  // Atomic write: first writer wins, second writer gets 0 rows back
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

  // UPDATE hit 0 rows — find out whether the token exists at all
  const { data: existing } = await supabase
    .from('gift_tokens')
    .select('employee_name, redeemed')
    .eq('token', token)
    .single()

  if (!existing) {
    return NextResponse.json({ valid: false, reason: 'invalid' })
  }

  return NextResponse.json({
    valid: false,
    reason: 'already_used',
    employeeName: existing.employee_name,
  })
}
