import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

async function getAuthedService(campaignId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id || !appMeta?.role_id) return null
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'campaigns:launch')) return null
  const service = createServiceClient()
  const { data: campaign } = await service
    .from('campaigns')
    .select('id, sent_at')
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)
    .single()
  if (!campaign) return null
  return { service, campaign }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; giftId: string }> }
) {
  const { id: campaignId, giftId } = await params
  const ctx = await getAuthedService(campaignId)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.campaign.sent_at) {
    return NextResponse.json({ error: 'Cannot modify gifts after campaign launch' }, { status: 422 })
  }

  await ctx.service
    .from('campaign_gifts')
    .delete()
    .eq('id', giftId)
    .eq('campaign_id', campaignId)

  return NextResponse.json({ success: true })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; giftId: string }> }
) {
  const { id: campaignId, giftId } = await params
  const ctx = await getAuthedService(campaignId)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.campaign.sent_at) {
    return NextResponse.json({ error: 'Cannot modify gifts after campaign launch' }, { status: 422 })
  }

  const body = await request.json().catch(() => ({}))
  const name: string = (body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { error } = await ctx.service
    .from('campaign_gifts')
    .update({ name })
    .eq('id', giftId)
    .eq('campaign_id', campaignId)

  if (error) return NextResponse.json({ error: 'Failed to update gift' }, { status: 500 })

  return NextResponse.json({ success: true })
}
