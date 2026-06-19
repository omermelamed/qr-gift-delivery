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

  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'sms_campaigns:read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()
  const { data } = await service
    .from('sms_campaigns')
    .select('id, name, status, recipients_count, sent_count, failed_count, created_at, sent_at')
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
  if (!hasPermission(permissions, 'sms_campaigns:create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { name, templateId } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const service = createServiceClient()

  if (templateId) {
    const { data: tmpl } = await service
      .from('message_templates')
      .select('id')
      .eq('id', templateId)
      .eq('company_id', appMeta.company_id)
      .single()
    if (!tmpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const { data, error } = await service
    .from('sms_campaigns')
    .insert({
      company_id: appMeta.company_id,
      name: name.trim(),
      template_id: templateId ?? null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }

  logAuditEvent({
    companyId: appMeta.company_id,
    actorId: user.id,
    action: 'sms_campaign.created',
    resourceType: 'sms_campaign',
    resourceId: data.id,
    metadata: { name: name.trim() },
  })

  return NextResponse.json({ id: data.id }, { status: 201 })
}
