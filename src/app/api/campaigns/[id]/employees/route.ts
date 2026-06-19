import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { normalizePhone } from '@/lib/phone'
import type { JwtAppMetadata } from '@/types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id || !appMeta?.role_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
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

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const name = (String(body.name ?? '')).trim()
  const rawPhone = String(body.phone_number ?? '').trim()
  const phone = rawPhone ? normalizePhone(rawPhone) : null
  const department = (String(body.department ?? '')).trim() || null

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (rawPhone && !phone) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })

  let employeeId: string | null = null
  if (phone) {
    const { data: emp } = await service
      .from('employees')
      .select('id')
      .eq('company_id', appMeta.company_id)
      .eq('phone', phone)
      .maybeSingle()
    employeeId = emp?.id ?? null
  }

  const { data, error } = await service
    .from('gift_tokens')
    .insert({ campaign_id: campaignId, employee_name: name, phone_number: phone, department, employee_id: employeeId })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to add employee' }, { status: 500 })

  return NextResponse.json({ id: data.id }, { status: 201 })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id || !appMeta?.role_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
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
  const tokenId = String(body.tokenId ?? '').trim()
  if (!tokenId) return NextResponse.json({ error: 'tokenId required' }, { status: 400 })

  const { error } = await service
    .from('gift_tokens')
    .delete()
    .eq('id', tokenId)
    .eq('campaign_id', campaignId)

  if (error) return NextResponse.json({ error: 'Failed to remove employee' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
