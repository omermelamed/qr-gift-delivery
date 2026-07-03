import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'
import { AdminDashboardUI } from '@/components/admin/AdminDashboardUI'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const appMeta = user.app_metadata as JwtAppMetadata

  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) redirect('/login')

  const service = createServiceClient()
  const { data: campaigns } = await service
    .from('campaigns')
    .select('id, name, campaign_date, sent_at, closed_at, created_by')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  const list = campaigns ?? []

  const [tokenResult, employeeResult] = await Promise.all([
    list.length
      ? service.from('gift_tokens').select('campaign_id, redeemed').in('campaign_id', list.map((c) => c.id))
      : Promise.resolve({ data: [] }),
    (() => {
      const creatorIds = [...new Set(list.map((c) => c.created_by).filter(Boolean) as string[])]
      return creatorIds.length
        ? service.from('employees').select('user_id, employee_name').in('user_id', creatorIds).eq('company_id', companyId)
        : Promise.resolve({ data: [] })
    })(),
  ])

  const statsMap = new Map<string, { total: number; redeemed: number }>()
  for (const t of tokenResult.data ?? []) {
    if (!statsMap.has(t.campaign_id)) statsMap.set(t.campaign_id, { total: 0, redeemed: 0 })
    const s = statsMap.get(t.campaign_id)!
    s.total++
    if (t.redeemed) s.redeemed++
  }

  const nameByUserId = new Map((employeeResult.data ?? []).map((e) => [e.user_id, e.employee_name]))

  // For creators not found in employees, resolve via auth admin
  const missingIds = [...new Set(list.map((c) => c.created_by).filter(Boolean) as string[])].filter((id) => !nameByUserId.has(id))
  if (missingIds.length) {
    const { data: usersData } = await service.auth.admin.listUsers({ perPage: 1000 })
    for (const u of usersData?.users ?? []) {
      if (missingIds.includes(u.id)) {
        nameByUserId.set(u.id, u.user_metadata?.full_name ?? u.email?.split('@')[0] ?? '—')
      }
    }
  }

  const campaignsWithStats = list.map((c) => ({
    ...c,
    created_by_name: c.created_by ? (nameByUserId.get(c.created_by) ?? '—') : null,
    stats: statsMap.get(c.id) ?? { total: 0, redeemed: 0 },
  }))

  return (
    <AdminDashboardUI
      campaigns={campaignsWithStats}
    />
  )
}
