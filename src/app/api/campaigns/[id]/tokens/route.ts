import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { normalizePhone } from '@/lib/phone'
import type { JwtAppMetadata } from '@/types'

type InputRow = { name: string; phone_number: string; department?: string }
type InsertRow = { campaign_id: string; employee_name: string; phone_number: string; department: string | null }
type RowError = { row: number; reason: string }

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'campaigns:create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, sent_at')
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.sent_at) return NextResponse.json({ error: 'Campaign already sent' }, { status: 409 })

  const body = await request.json().catch(() => ({}))
  const source: string | undefined = body.source

  let insertRows: InsertRow[] = []
  const errors: RowError[] = []

  if (source === 'directory') {
    const employeeIds: string[] = Array.isArray(body.employeeIds) ? body.employeeIds : []
    if (employeeIds.length === 0) return NextResponse.json({ error: 'No employees selected' }, { status: 400 })

    const { data: employees } = await service
      .from('employees')
      .select('employee_name, phone, department')
      .in('id', employeeIds)
      .eq('company_id', appMeta.company_id)

    insertRows = (employees ?? [])
      .filter((e) => !!e.phone)  // skip team members without a phone number set
      .map((e) => ({
        campaign_id: campaignId,
        employee_name: e.employee_name,
        phone_number: e.phone!,
        department: e.department,
      }))
  } else if (source === 'clone') {
    const sourceCampaignId: string | undefined = body.sourceCampaignId
    if (!sourceCampaignId) return NextResponse.json({ error: 'sourceCampaignId required' }, { status: 400 })

    const { data: sourceCampaign } = await service
      .from('campaigns')
      .select('id')
      .eq('id', sourceCampaignId)
      .eq('company_id', appMeta.company_id)
      .single()

    if (!sourceCampaign) return NextResponse.json({ error: 'Source campaign not found' }, { status: 404 })

    const { data: sourceTokens } = await service
      .from('gift_tokens')
      .select('employee_name, phone_number, department')
      .eq('campaign_id', sourceCampaignId)

    insertRows = (sourceTokens ?? []).map((t) => ({
      campaign_id: campaignId,
      employee_name: t.employee_name,
      phone_number: t.phone_number,
      department: t.department,
    }))
  } else {
    const rows: InputRow[] = Array.isArray(body.rows) ? body.rows : []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row.name?.trim()) { errors.push({ row: i, reason: 'Missing name' }); continue }
      const phone = normalizePhone(row.phone_number ?? '')
      if (!phone) { errors.push({ row: i, reason: 'Invalid phone number' }); continue }
      insertRows.push({
        campaign_id: campaignId,
        employee_name: row.name.trim(),
        phone_number: phone,
        department: row.department?.trim() || null,
      })
    }
  }

  if (insertRows.length > 0) {
    const { error: deleteError } = await service.from('gift_tokens').delete().eq('campaign_id', campaignId).is('sms_sent_at', null)
    if (deleteError) return NextResponse.json({ error: 'Failed to clear existing tokens' }, { status: 500 })
    const { error: insertError } = await service.from('gift_tokens').insert(insertRows)
    if (insertError) return NextResponse.json({ error: 'Failed to insert employees' }, { status: 500 })
  }

  return NextResponse.json({ inserted: insertRows.length, skipped: errors.length, errors })
}
