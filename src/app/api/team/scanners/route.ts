import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
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
  if (!hasPermission(permissions, 'campaigns:read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  // Get all users who belong to this company — via UCR or app_metadata
  const [{ data: ucr }, listResult] = await Promise.all([
    service.from('user_company_roles').select('user_id').eq('company_id', companyId),
    service.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const ucrIds = new Set((ucr ?? []).map((r) => r.user_id))
  const allUsers = listResult.data?.users ?? []

  const companyUsers = allUsers.filter((u) => {
    const meta = u.app_metadata as JwtAppMetadata | undefined
    if (meta?.role_name === 'platform_admin') return false
    return ucrIds.has(u.id) || meta?.company_id === companyId
  })

  const scanners = companyUsers.map((u) => ({
    id: u.id,
    name: u.user_metadata?.full_name ?? u.email?.split('@')[0] ?? u.id,
    email: u.email ?? '',
  }))

  return NextResponse.json({ scanners })
}
