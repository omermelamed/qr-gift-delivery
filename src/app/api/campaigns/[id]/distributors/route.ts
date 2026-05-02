import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
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
  if (!appMeta?.company_id || !appMeta?.role_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'campaigns:launch')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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
      const userResult = await service.auth.admin.getUserById(row.user_id)
      const u = userResult.data?.user
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
  if (!appMeta?.company_id || !appMeta?.role_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'campaigns:launch')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const userId: string | undefined = body.userId
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const service = createServiceClient()

  // Verify target user is a scanner or admin in this company
  const targetResult = await service.auth.admin.getUserById(userId)
  const targetUser = targetResult.data?.user
  const targetMeta = targetUser?.app_metadata as JwtAppMetadata | undefined

  const { data: ucr } = await service
    .from('user_company_roles')
    .select('roles(name)')
    .eq('user_id', userId)
    .eq('company_id', appMeta.company_id)
    .maybeSingle()

  const targetRole = ucr?.roles as unknown as { name: string } | null
  const isEligible =
    targetRole?.name === 'scanner' ||
    targetRole?.name === 'company_admin' ||
    targetMeta?.company_id === appMeta.company_id

  if (!isEligible) {
    return NextResponse.json({ error: 'User is not a member of this company' }, { status: 422 })
  }

  const { error } = await service
    .from('campaign_distributors')
    .insert({ campaign_id: campaignId, user_id: userId })

  if (error) return NextResponse.json({ error: 'Failed to assign distributor' }, { status: 500 })

  return NextResponse.json({ success: true })
}
