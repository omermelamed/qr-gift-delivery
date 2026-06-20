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

  // Only resolve names for users that belong to the caller's company (M1).
  // Foreign IDs are echoed back as-is, never enriched with a name.
  const { data: ucr } = await service
    .from('user_company_roles')
    .select('user_id')
    .eq('company_id', companyId)
  const allowed = new Set((ucr ?? []).map((r) => r.user_id))

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
