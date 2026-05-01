import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id || !appMeta?.role_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'users:manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const name: string = (String(body.name ?? '')).trim()
  const logoUrl: string | null = body.logo_url ? String(body.logo_url) : null
  const smsTemplate: string | null = body.sms_template ? String(body.sms_template).trim() : null
  const themeColor: string | null = body.theme_color && /^#[0-9a-f]{6}$/i.test(String(body.theme_color))
    ? String(body.theme_color)
    : null

  if (!name) return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
  if (smsTemplate && !smsTemplate.includes('{link}')) {
    return NextResponse.json({ error: 'SMS template must contain {link}' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('companies')
    .update({ name, logo_url: logoUrl, sms_template: smsTemplate, theme_color: themeColor })
    .eq('id', appMeta.company_id)

  if (error) return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })

  return NextResponse.json({ success: true })
}
