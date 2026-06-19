import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)
  if (!hasPermission(permissions, 'templates:read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()
  const { data } = await service
    .from('message_templates')
    .select('id, name, body_template, variables, created_at, updated_at')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })

  return NextResponse.json({ templates: data ?? [] })
}

function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g)
  if (!matches) return []
  return [...new Set(matches.map((m) => m.slice(2, -2)))]
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)
  if (!hasPermission(permissions, 'templates:manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { name, bodyTemplate } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!bodyTemplate || typeof bodyTemplate !== 'string' || !bodyTemplate.trim()) {
    return NextResponse.json({ error: 'bodyTemplate is required' }, { status: 400 })
  }

  const variables = extractVariables(bodyTemplate)

  const service = createServiceClient()
  const { data, error } = await service
    .from('message_templates')
    .insert({
      company_id: companyId,
      name: name.trim(),
      body_template: bodyTemplate.trim(),
      variables,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 })
  }

  logAuditEvent({
    companyId: companyId,
    actorId: user.id,
    action: 'template.created',
    resourceType: 'template',
    resourceId: data.id,
    metadata: { name: name.trim(), variables },
  })

  return NextResponse.json({ id: data.id }, { status: 201 })
}
