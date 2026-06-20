import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { resolveCompanyId } from '@/lib/platform-auth'
import type { JwtAppMetadata } from '@/types'

export async function POST(request: NextRequest) {
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
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((id: unknown) => typeof id === 'string') : []

  if (ids.length === 0) return NextResponse.json({ users: [] })

  const service = createServiceClient()

  // Only resolve names for users that legitimately appear in this company's
  // context (M1) — never let a caller harvest arbitrary user names. The allowed
  // set is: (a) company members, plus (b) anyone who redeemed one of this
  // company's tokens (i.e. shows up as a "distributor"), which includes admins
  // and the platform admin acting on the company's behalf.
  const allowed = new Set<string>()

  const { data: ucr } = await service
    .from('user_company_roles')
    .select('user_id')
    .eq('company_id', companyId)
  for (const r of ucr ?? []) allowed.add(r.user_id)

  const { data: campaignRows } = await service
    .from('campaigns')
    .select('id')
    .eq('company_id', companyId)
  const campaignIds = (campaignRows ?? []).map((c) => c.id)
  if (campaignIds.length > 0) {
    const { data: redeemers } = await service
      .from('gift_tokens')
      .select('redeemed_by')
      .in('campaign_id', campaignIds)
      .in('redeemed_by', ids)
    for (const r of redeemers ?? []) if (r.redeemed_by) allowed.add(r.redeemed_by)
  }

  const users = await Promise.all(
    ids.map(async (id) => {
      const { data: { user: u } } = await service.auth.admin.getUserById(id)
      const meta = u?.app_metadata as JwtAppMetadata | undefined
      const inCompany = allowed.has(id) || meta?.company_id === companyId
      return {
        id,
        name: inCompany ? (u?.user_metadata?.full_name ?? u?.email?.split('@')[0] ?? id) : id,
      }
    })
  )

  return NextResponse.json({ users })
}
