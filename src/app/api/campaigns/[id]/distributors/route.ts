import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const { data: rows } = await service
    .from('campaign_distributors')
    .select('user_id')
    .eq('campaign_id', campaignId)

  const distributors = await Promise.all(
    (rows ?? []).map(async (row) => {
      const { data: { user: u } } = await service.auth.admin.getUserById(row.user_id)
      return {
        userId: row.user_id,
        name: u?.user_metadata?.full_name ?? u?.email?.split('@')[0] ?? row.user_id,
        email: u?.email ?? '',
      }
    })
  )

  return NextResponse.json({ distributors })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const userId: string | undefined = body.userId
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const service = createServiceClient()

  // Verify target user is a scanner in this company
  const { data: ucr } = await service
    .from('user_company_roles')
    .select('roles(name)')
    .eq('user_id', userId)
    .eq('company_id', appMeta.company_id)
    .single()

  const targetRole = ucr?.roles as unknown as { name: string } | null
  if (!ucr || targetRole?.name !== 'scanner') {
    return NextResponse.json({ error: 'User is not a scanner in this company' }, { status: 422 })
  }

  const { error } = await service
    .from('campaign_distributors')
    .insert({ campaign_id: campaignId, user_id: userId })

  if (error) return NextResponse.json({ error: 'Failed to assign distributor' }, { status: 500 })

  return NextResponse.json({ success: true })
}
