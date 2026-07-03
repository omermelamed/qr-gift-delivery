import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)
  if (!hasPermission(permissions, 'campaigns:launch')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, name, sent_at')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.sent_at) return NextResponse.json({ error: 'Cannot delete a campaign that has already been sent' }, { status: 409 })

  const { error: deleteError } = await service
    .from('campaigns')
    .delete()
    .eq('id', campaignId)
    .eq('company_id', companyId)

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 })
  }

  logAuditEvent({
    companyId: companyId,
    actorId: user.id,
    action: 'campaign.deleted',
    resourceType: 'campaign',
    resourceId: campaignId,
    metadata: { name: campaign.name },
  })

  return new NextResponse(null, { status: 204 })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)
  if (!hasPermission(permissions, 'campaigns:launch')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const update: {
    name?: string
    campaign_date?: string
    supports_arrival_certificates?: boolean
    max_attendee_count?: number | null
    sms_template?: string | null
    wizard_last_step?: number
  } = {}

  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    update.name = body.name.trim()
  }

  if ('campaignDate' in body) {
    if (typeof body.campaignDate !== 'string' || isNaN(Date.parse(body.campaignDate))) {
      return NextResponse.json({ error: 'campaignDate must be a valid date' }, { status: 400 })
    }
    update.campaign_date = body.campaignDate
  }

  if ('wizardLastStep' in body) {
    const raw = body.wizardLastStep
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > 5) {
      return NextResponse.json({ error: 'invalid_step' }, { status: 400 })
    }
    update.wizard_last_step = raw
  }

  if ('supportsArrivalCertificates' in body) {
    if (typeof body.supportsArrivalCertificates !== 'boolean') {
      return NextResponse.json({ error: 'supportsArrivalCertificates must be a boolean' }, { status: 400 })
    }
    update.supports_arrival_certificates = body.supportsArrivalCertificates
  }

  if ('maxAttendeeCount' in body) {
    const raw = body.maxAttendeeCount
    if (raw !== null && (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1)) {
      return NextResponse.json({ error: 'invalid_max' }, { status: 400 })
    }
    update.max_attendee_count = raw
  }

  if ('smsTemplate' in body) {
    const raw = body.smsTemplate
    if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      update.sms_template = null
    } else if (typeof raw === 'string') {
      if (!raw.includes('{link}')) {
        return NextResponse.json({ error: 'invalid_template' }, { status: 400 })
      }
      update.sms_template = raw.trim()
    } else {
      return NextResponse.json({ error: 'invalid_template' }, { status: 400 })
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No recognized fields to update' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, sent_at')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.sent_at) {
    return NextResponse.json({ error: 'Cannot change settings on a campaign that has already been sent' }, { status: 409 })
  }

  const { error: updateError } = await service
    .from('campaigns')
    .update(update)
    .eq('id', campaignId)
    .eq('company_id', companyId)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
  }

  logAuditEvent({
    companyId: companyId,
    actorId: user.id,
    action: 'campaign.updated',
    resourceType: 'campaign',
    resourceId: campaignId,
    metadata: update,
  })

  return NextResponse.json({ ok: true })
}
