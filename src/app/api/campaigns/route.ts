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

  const service = createServiceClient()

  // Admins/managers (campaigns:read) see every campaign in the company.
  if (hasPermission(permissions, 'campaigns:read')) {
    const { data } = await service
      .from('campaigns')
      .select('id, name, campaign_date, sent_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    return NextResponse.json({ campaigns: data ?? [] })
  }

  // Scanners (tokens:scan) see only the campaigns they're assigned to scan.
  if (hasPermission(permissions, 'tokens:scan')) {
    const { data: assignments } = await service
      .from('campaign_distributors')
      .select('campaign_id')
      .eq('user_id', user.id)
    const ids = (assignments ?? []).map((a) => a.campaign_id)
    if (ids.length === 0) return NextResponse.json({ campaigns: [] })
    const { data } = await service
      .from('campaigns')
      .select('id, name, campaign_date, sent_at')
      .eq('company_id', companyId)
      .in('id', ids)
      .order('created_at', { ascending: false })

    // Redemption progress per campaign, so distributors can see what's left.
    const { data: tokens } = await service
      .from('gift_tokens')
      .select('campaign_id, redeemed')
      .in('campaign_id', ids)
    const counts = new Map<string, { total: number; redeemed: number }>()
    for (const tk of tokens ?? []) {
      const e = counts.get(tk.campaign_id) ?? { total: 0, redeemed: 0 }
      e.total++
      if (tk.redeemed) e.redeemed++
      counts.set(tk.campaign_id, e)
    }

    const campaigns = (data ?? []).map((c) => ({
      ...c,
      total: counts.get(c.id)?.total ?? 0,
      redeemed: counts.get(c.id)?.redeemed ?? 0,
    }))
    return NextResponse.json({ campaigns })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)
  if (!hasPermission(permissions, 'campaigns:create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { name, campaignDate, supportsArrivalCertificates, maxAttendeeCount } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!campaignDate || typeof campaignDate !== 'string') {
    return NextResponse.json({ error: 'campaignDate is required' }, { status: 400 })
  }

  if (isNaN(Date.parse(campaignDate))) {
    return NextResponse.json({ error: 'campaignDate must be a valid date' }, { status: 400 })
  }

  // Optional per-campaign attendee cap; integer >= 1 or null. Same rule as the PATCH route.
  if (maxAttendeeCount !== undefined && maxAttendeeCount !== null &&
      (typeof maxAttendeeCount !== 'number' || !Number.isInteger(maxAttendeeCount) || maxAttendeeCount < 1)) {
    return NextResponse.json({ error: 'invalid_max' }, { status: 400 })
  }
  // The cap only applies when arrival certificates are on; otherwise store no limit.
  const supportsArrival = supportsArrivalCertificates === true
  const maxAttendee = supportsArrival && typeof maxAttendeeCount === 'number' ? maxAttendeeCount : null

  const service = createServiceClient()
  const { data, error } = await service
    .from('campaigns')
    .insert({
      name: name.trim(),
      campaign_date: campaignDate,
      company_id: companyId,
      created_by: user.id,
      supports_arrival_certificates: supportsArrival,
      max_attendee_count: maxAttendee,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }

  logAuditEvent({
    companyId: companyId,
    actorId: user.id,
    action: 'campaign.created',
    resourceType: 'campaign',
    resourceId: data.id,
    metadata: { name: name.trim() },
  })

  return NextResponse.json({ id: data.id }, { status: 201 })
}
