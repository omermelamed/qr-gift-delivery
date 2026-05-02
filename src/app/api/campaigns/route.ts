import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import type { JwtAppMetadata } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data } = await service
    .from('campaigns')
    .select('id, name, campaign_date, sent_at')
    .eq('company_id', appMeta.company_id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ campaigns: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'campaigns:create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!appMeta?.company_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { name, campaignDate, scheduledAt } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!campaignDate || typeof campaignDate !== 'string') {
    return NextResponse.json({ error: 'campaignDate is required' }, { status: 400 })
  }

  if (isNaN(Date.parse(campaignDate))) {
    return NextResponse.json({ error: 'campaignDate must be a valid date' }, { status: 400 })
  }

  if (scheduledAt !== undefined && scheduledAt !== null && isNaN(Date.parse(scheduledAt))) {
    return NextResponse.json({ error: 'scheduledAt must be a valid datetime' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('campaigns')
    .insert({
      name: name.trim(),
      campaign_date: campaignDate,
      company_id: appMeta.company_id,
      created_by: user.id,
      scheduled_at: scheduledAt ?? null,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }

  logAuditEvent({
    companyId: appMeta.company_id,
    actorId: user.id,
    action: 'campaign.created',
    resourceType: 'campaign',
    resourceId: data.id,
    metadata: { name: name.trim() },
  })

  return NextResponse.json({ id: data.id }, { status: 201 })
}
