import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: ucr } = await service
    .from('user_company_roles')
    .select('user_id, roles(name)')
    .eq('company_id', appMeta.company_id)

  // Include both scanners and admins — admins can distribute too
  const eligibleUserIds = (ucr ?? [])
    .filter((row) => {
      const role = row.roles as unknown as { name: string } | null
      return role?.name === 'scanner' || role?.name === 'company_admin'
    })
    .map((row) => row.user_id)

  // Also include users whose app_metadata marks them as admin for this company
  // (initial admins may not have a UCR row)
  const { data: { users: allUsers } } = await service.auth.admin.listUsers({ perPage: 1000 })
  const adminsByMeta = allUsers
    .filter((u) => {
      const meta = u.app_metadata as JwtAppMetadata | undefined
      return meta?.company_id === appMeta.company_id &&
        meta?.role_name === 'company_admin' &&
        !eligibleUserIds.includes(u.id)
    })
    .map((u) => u.id)

  const allEligibleIds = [...new Set([...eligibleUserIds, ...adminsByMeta])]

  const scanners = await Promise.all(
    allEligibleIds.map(async (userId) => {
      const { data: { user: u } } = await service.auth.admin.getUserById(userId)
      return {
        id: userId,
        name: u?.user_metadata?.full_name ?? u?.email?.split('@')[0] ?? userId,
        email: u?.email ?? '',
      }
    })
  )

  return NextResponse.json({ scanners })
}
