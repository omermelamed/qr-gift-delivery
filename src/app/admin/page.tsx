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
    .select('id, name, campaign_date, sent_at, closed_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  const list = campaigns ?? []

  const { data: tokenRows } = list.length
    ? await service
        .from('gift_tokens')
        .select('campaign_id, redeemed')
        .in('campaign_id', list.map((c) => c.id))
    : { data: [] }

  const statsMap = new Map<string, { total: number; redeemed: number }>()
  for (const t of tokenRows ?? []) {
    if (!statsMap.has(t.campaign_id)) statsMap.set(t.campaign_id, { total: 0, redeemed: 0 })
    const s = statsMap.get(t.campaign_id)!
    s.total++
    if (t.redeemed) s.redeemed++
  }

  let totalGifts = 0, totalRedeemed = 0
  for (const v of statsMap.values()) { totalGifts += v.total; totalRedeemed += v.redeemed }

  const campaignsWithStats = list.map((c) => ({
    ...c,
    stats: statsMap.get(c.id) ?? { total: 0, redeemed: 0 },
  }))

  return (
    <AdminDashboardUI
      campaigns={campaignsWithStats}
      totalGifts={totalGifts}
      totalRedeemed={totalRedeemed}
    />
  )
}
