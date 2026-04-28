import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'reports:export')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const { data: tokens } = await service
    .from('gift_tokens')
    .select('employee_name, phone_number, department, sms_sent_at, redeemed, redeemed_at, redeemed_by')
    .eq('campaign_id', campaignId)
    .order('employee_name')

  if (!tokens) return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 })

  function csvEscape(v: unknown): string {
    return `"${String(v ?? '').replace(/"/g, '""')}"`
  }

  const header = 'name,phone_number,department,sms_sent_at,redeemed,redeemed_at,redeemed_by'
  const rows = tokens.map((t) =>
    [t.employee_name, t.phone_number, t.department, t.sms_sent_at, t.redeemed, t.redeemed_at, t.redeemed_by]
      .map(csvEscape)
      .join(',')
  )
  const csv = [header, ...rows].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="campaign-${campaignId}.csv"`,
    },
  })
}
