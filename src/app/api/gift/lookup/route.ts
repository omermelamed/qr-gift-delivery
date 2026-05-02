import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const raw: string = body.phone ?? ''

  const phone = normalizePhone(raw)
  if (!phone) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: tokens } = await service
    .from('gift_tokens')
    .select('campaign_id, employee_name, campaigns(name, campaign_date, closed_at, companies(name))')
    .eq('phone_number', phone)
    .eq('redeemed', false)

  const gifts = (tokens ?? [])
    .filter((t) => {
      const campaign = t.campaigns as unknown as { closed_at: string | null } | null
      return !campaign?.closed_at
    })
    .map((t) => {
      const campaign = t.campaigns as unknown as {
        name: string
        campaign_date: string | null
        companies: { name: string } | null
      } | null
      return {
        campaignName: campaign?.name ?? 'Gift',
        campaignDate: campaign?.campaign_date ?? null,
        companyName: campaign?.companies?.name ?? '',
        employeeName: t.employee_name,
      }
    })

  return NextResponse.json({ gifts })
}
