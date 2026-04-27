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
  const rows: InputRow[] = Array.isArray(body.rows) ? body.rows : []

  const valid: InsertRow[] = []
  const errors: RowError[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row.name?.trim()) { errors.push({ row: i, reason: 'Missing name' }); continue }
    const phone = normalizePhone(row.phone_number ?? '')
    if (!phone) { errors.push({ row: i, reason: 'Invalid phone number' }); continue }
    valid.push({
      campaign_id: campaignId,
      employee_name: row.name.trim(),
      phone_number: phone,
      department: row.department?.trim() || null,
    })
  }

  if (valid.length > 0) {
    const { error: deleteError } = await service.from('gift_tokens').delete().eq('campaign_id', campaignId).is('sms_sent_at', null)
    if (deleteError) return NextResponse.json({ error: 'Failed to clear existing tokens' }, { status: 500 })
    const { error: insertError } = await service.from('gift_tokens').insert(valid)
    if (insertError) return NextResponse.json({ error: 'Failed to insert employees' }, { status: 500 })
  }

  return NextResponse.json({ inserted: valid.length, skipped: errors.length, errors })
}
