import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

type RouteContext = { params: Promise<{ id: string }> }

type RecipientInput = {
  phone: string
  name?: string
  [key: string]: string | undefined
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'sms_campaigns:create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('sms_campaigns')
    .select('id, status, template_id')
    .eq('id', id)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.status !== 'draft') {
    return NextResponse.json({ error: 'Can only add recipients to draft campaigns' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const { recipients } = body as { recipients?: RecipientInput[] }

  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json({ error: 'recipients array is required' }, { status: 400 })
  }

  // Load template to render messages
  let bodyTemplate = '{{message}}'
  if (campaign.template_id) {
    const { data: tmpl } = await service
      .from('message_templates')
      .select('body_template')
      .eq('id', campaign.template_id)
      .single()
    if (tmpl) bodyTemplate = tmpl.body_template
  }

  const messages = recipients
    .filter((r) => r.phone && typeof r.phone === 'string')
    .map((r) => {
      let renderedBody = bodyTemplate
      for (const [key, value] of Object.entries(r)) {
        if (key !== 'phone' && value) {
          renderedBody = renderedBody.replaceAll(`{{${key}}}`, value)
        }
      }

      return {
        campaign_id: id,
        recipient_phone: r.phone.trim(),
        recipient_name: r.name?.trim() ?? null,
        body: renderedBody,
        status: 'pending' as const,
      }
    })

  if (messages.length === 0) {
    return NextResponse.json({ error: 'No valid recipients found' }, { status: 400 })
  }

  const { error: insertError } = await service
    .from('sms_messages')
    .insert(messages)

  if (insertError) {
    return NextResponse.json({ error: 'Failed to add recipients' }, { status: 500 })
  }

  // Update campaign recipient count
  const { count } = await service
    .from('sms_messages')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', id)

  await service
    .from('sms_campaigns')
    .update({ recipients_count: count ?? messages.length })
    .eq('id', id)

  return NextResponse.json({ added: messages.length, total: count ?? messages.length }, { status: 201 })
}
