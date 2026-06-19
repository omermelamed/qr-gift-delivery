import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'reports:export')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const [tokensResult, employeesResult] = await Promise.all([
    service
      .from('gift_tokens')
      .select('employee_name, phone_number, department, sms_sent_at, redeemed, redeemed_at, redeemed_by')
      .eq('campaign_id', campaignId)
      .order('employee_name'),
    service
      .from('employees')
      .select('employee_name, phone, department')
      .eq('company_id', companyId),
  ])

  if (!tokensResult.data) return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 })

  const empList = employeesResult.data ?? []
  const empByName = new Map(empList.map((e) => [e.employee_name, e]))
  const empByPhone = new Map(empList.filter((e) => e.phone).map((e) => [e.phone!, e]))

  const tokens = tokensResult.data.map((t) => {
    const emp = empByName.get(t.employee_name) ?? (t.phone_number ? empByPhone.get(t.phone_number) : undefined)
    return {
      employee_name: emp?.employee_name ?? t.employee_name,
      phone_number: emp?.phone ?? t.phone_number,
      department: emp?.department ?? t.department,
      sms_sent_at: t.sms_sent_at,
      redeemed: t.redeemed,
      redeemed_at: t.redeemed_at,
      redeemed_by: t.redeemed_by,
    }
  })

  // Resolve redeemed_by UUIDs to human-readable names
  const scannerIds = [...new Set(tokens.map((t) => t.redeemed_by).filter(Boolean) as string[])]
  const scannerNames = new Map<string, string>()
  if (scannerIds.length > 0) {
    const { data: { users } } = await service.auth.admin.listUsers({ perPage: 1000 })
    for (const u of users) {
      if (scannerIds.includes(u.id)) {
        scannerNames.set(u.id, u.user_metadata?.full_name ?? u.email ?? u.id)
      }
    }
  }

  function csvEscape(v: unknown): string {
    return `"${String(v ?? '').replace(/"/g, '""')}"`
  }

  const header = 'name,phone_number,department,sms_sent_at,redeemed,redeemed_at,redeemed_by'
  const rows = tokens.map((t) =>
    [
      t.employee_name,
      t.phone_number,
      t.department,
      t.sms_sent_at,
      t.redeemed,
      t.redeemed_at,
      t.redeemed_by ? (scannerNames.get(t.redeemed_by) ?? t.redeemed_by) : '',
    ]
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
