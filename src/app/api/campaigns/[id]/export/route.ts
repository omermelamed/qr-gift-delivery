import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'
import { he } from '@/lib/i18n/translations.he'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const jar = await cookies()
  const locale = jar.get('giftflow-locale')?.value === 'he' ? 'he' : 'en'
  const tr = (key: string) => (locale === 'he' ? he[key] ?? key : key)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)
  if (!hasPermission(permissions, 'reports:export')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, supports_arrival_certificates')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const [tokensResult, employeesResult, giftsResult] = await Promise.all([
    service
      .from('gift_tokens')
      .select('employee_name, phone_number, department, sms_sent_at, redeemed, redeemed_at, redeemed_by, gift_id, attending, attendee_count, arrived_count')
      .eq('campaign_id', campaignId)
      .order('employee_name'),
    service
      .from('employees')
      .select('employee_name, phone, department')
      .eq('company_id', companyId),
    service
      .from('campaign_gifts')
      .select('id, name')
      .eq('campaign_id', campaignId),
  ])

  if (!tokensResult.data) return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 })

  const empList = employeesResult.data ?? []
  const empByName = new Map(empList.map((e) => [e.employee_name, e]))
  const empByPhone = new Map(empList.filter((e) => e.phone).map((e) => [e.phone!, e]))

  const gifts = giftsResult.data ?? []
  const giftNameById = new Map(gifts.map((g) => [g.id, g.name]))
  const showGiftCol = gifts.length > 0
  const showAttendance = campaign.supports_arrival_certificates

  const tokens = tokensResult.data.map((t) => {
    const emp = empByName.get(t.employee_name) ?? (t.phone_number ? empByPhone.get(t.phone_number) : undefined)
    return {
      employee_name: emp?.employee_name ?? t.employee_name,
      phone_number: emp?.phone ?? t.phone_number,
      department: emp?.department ?? t.department,
      gift: t.gift_id ? (giftNameById.get(t.gift_id) ?? '') : '',
      plannedCount: t.attending === true && t.attendee_count != null ? t.attendee_count : '',
      arrivedCount: t.arrived_count != null ? t.arrived_count : '',
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
    let s = String(v ?? '')
    // Neutralize spreadsheet formula injection: a cell starting with = + - @
    // (or a tab/CR) is treated as a formula by Excel/Sheets even when quoted.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return `"${s.replace(/"/g, '""')}"`
  }

  const header = [
    tr('Name'),
    tr('Phone'),
    tr('Department'),
    ...(showGiftCol ? [tr('Gift')] : []),
    ...(showAttendance ? [tr('Planned to arrive'), tr('Actually arrived')] : []),
    tr('Sent at'),
    tr('Claimed'),
    tr('Claimed At'),
    tr('Scanner'),
  ]
    .map(csvEscape)
    .join(',')
  const rows = tokens.map((t) =>
    [
      t.employee_name,
      t.phone_number,
      t.department,
      ...(showGiftCol ? [t.gift] : []),
      ...(showAttendance ? [t.plannedCount, t.arrivedCount] : []),
      t.sms_sent_at,
      tr(t.redeemed ? 'Yes' : 'No'),
      t.redeemed_at,
      t.redeemed_by ? (scannerNames.get(t.redeemed_by) ?? t.redeemed_by) : '',
    ]
      .map(csvEscape)
      .join(',')
  )
  // Prepend a UTF-8 BOM so Excel decodes the file as UTF-8 (it otherwise falls
  // back to the system codepage, e.g. Windows-1255, and mangles Hebrew names).
  const csv = '﻿' + [header, ...rows].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="campaign-${campaignId}.csv"`,
    },
  })
}
