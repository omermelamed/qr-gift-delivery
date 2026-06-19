import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import type { JwtAppMetadata } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g)
  if (!matches) return []
  return [...new Set(matches.map((m) => m.slice(2, -2)))]
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'templates:manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.name && typeof body.name === 'string') {
    updates.name = body.name.trim()
  }
  if (body.bodyTemplate && typeof body.bodyTemplate === 'string') {
    updates.body_template = body.bodyTemplate.trim()
    updates.variables = extractVariables(body.bodyTemplate)
  }

  const service = createServiceClient()

  // Verify ownership
  const { data: existing } = await service
    .from('message_templates')
    .select('id')
    .eq('id', id)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const { error } = await service
    .from('message_templates')
    .update(updates)
    .eq('id', id)
    .eq('company_id', appMeta.company_id)

  if (error) {
    return NextResponse.json({ error: 'Failed to update template' }, { status: 500 })
  }

  logAuditEvent({
    companyId: appMeta.company_id,
    actorId: user.id,
    action: 'template.updated',
    resourceType: 'template',
    resourceId: id,
    metadata: updates,
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'templates:manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: existing } = await service
    .from('message_templates')
    .select('id, name')
    .eq('id', id)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const { error } = await service
    .from('message_templates')
    .delete()
    .eq('id', id)
    .eq('company_id', appMeta.company_id)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 })
  }

  logAuditEvent({
    companyId: appMeta.company_id,
    actorId: user.id,
    action: 'template.deleted',
    resourceType: 'template',
    resourceId: id,
    metadata: { name: existing.name },
  })

  return NextResponse.json({ ok: true })
}
