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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params
  const ctx = await getAuthedService(campaignId)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: gifts } = await ctx.service
    .from('campaign_gifts')
    .select('id, name, position')
    .eq('campaign_id', campaignId)
    .order('position', { ascending: true })

  return NextResponse.json({ gifts: gifts ?? [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params
  const ctx = await getAuthedService(campaignId)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (ctx.campaign.sent_at) {
    return NextResponse.json({ error: 'Cannot modify gifts after campaign launch' }, { status: 422 })
  }

  const body = await request.json().catch(() => ({}))
  const name: string = (body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data: existing } = await ctx.service
    .from('campaign_gifts')
    .select('position')
    .eq('campaign_id', campaignId)
    .order('position', { ascending: false })
    .limit(1)

  const position = (existing?.[0]?.position ?? -1) + 1

  const { data: gift, error } = await ctx.service
    .from('campaign_gifts')
    .insert({ campaign_id: campaignId, name, position })
    .select('id, name, position')
    .single()

  if (error || !gift) return NextResponse.json({ error: 'Failed to add gift' }, { status: 500 })

  return NextResponse.json(gift, { status: 201 })
}
