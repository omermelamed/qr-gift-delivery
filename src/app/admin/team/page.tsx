import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId, isPlatformAdmin } from '@/lib/platform-auth'
import { TeamPageUI, type Member } from '@/components/admin/TeamPageUI'

export default async function TeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const appMeta = user.app_metadata as JwtAppMetadata
  if (appMeta.role_name !== 'company_admin' && !isPlatformAdmin(appMeta)) redirect('/admin')

  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) redirect('/admin')

  const service = createServiceClient()

  const { data: ucr } = await service
    .from('user_company_roles')
    .select('user_id, role_id, roles(name)')
    .eq('company_id', companyId)

  const companyUserIds = new Set((ucr ?? []).map((r) => r.user_id))

  const listResult = await service.auth.admin.listUsers({ perPage: 1000 })
  const allUsers = listResult.data?.users ?? []

  const companyUsers = allUsers.filter((u) => {
    const meta = u.app_metadata as JwtAppMetadata | undefined
    if (meta?.role_name === 'platform_admin') return false
    return companyUserIds.has(u.id) || meta?.company_id === companyId
  })

  const userIds = companyUsers.map((u) => u.id)
  const { data: employeeRows } = userIds.length > 0
    ? await service.from('employees').select('user_id, employee_name, phone').in('user_id', userIds).eq('company_id', companyId)
    : { data: [] }
  const employeeByUserId = new Map((employeeRows ?? []).map((e) => [e.user_id, e]))

  const members: Member[] = companyUsers.map((u) => {
    const ucrRow = (ucr ?? []).find((r) => r.user_id === u.id)
    const roleRow = ucrRow?.roles as unknown as { name: string } | null
    const meta = u.app_metadata as JwtAppMetadata | undefined
    const bannedUntil = (u as unknown as { banned_until?: string }).banned_until
    const reinvitedAt = (u.app_metadata as Record<string, unknown>)?.reinvited_at as string | undefined
    const isReinvited = !!(reinvitedAt && (!u.last_sign_in_at || new Date(reinvitedAt) > new Date(u.last_sign_in_at)))
    const emp = employeeByUserId.get(u.id)
    return {
      id: u.id,
      email: u.email ?? '',
      name: emp?.employee_name ?? u.user_metadata?.full_name ?? u.email?.split('@')[0] ?? '—',
      phone: emp?.phone ?? '',
      role_name: roleRow?.name ?? meta?.role_name ?? '—',
      isPending: !u.last_sign_in_at,
      isReinvited,
      isDeactivated: !!(bannedUntil && new Date(bannedUntil) > new Date()),
      isSelf: u.id === user.id,
    }
  })

  return <TeamPageUI members={members} />
}
