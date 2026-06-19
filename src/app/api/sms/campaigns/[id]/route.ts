import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'sms_campaigns:read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('sms_campaigns')
    .select('id, name, status, template_id, recipients_count, sent_count, failed_count, credits_reserved, created_at, sent_at')
    .eq('id', id)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const { data: messages } = await service
    .from('sms_messages')
    .select('id, recipient_phone, recipient_name, status, error_message, sent_at, delivered_at')
    .eq('campaign_id', id)
    .order('created_at', { ascending: true })

  let template = null
  if (campaign.template_id) {
    const { data } = await service
      .from('message_templates')
      .select('id, name, body_template, variables')
      .eq('id', campaign.template_id)
      .single()
    template = data
  }

  return NextResponse.json({ campaign, messages: messages ?? [], template })
}
