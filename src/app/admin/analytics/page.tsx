import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'
import { AnalyticsUI } from '@/components/admin/analytics/AnalyticsUI'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const appMeta = user.app_metadata as JwtAppMetadata

  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) redirect('/login')

  const service = createServiceClient()
  const { data: campaigns, error: campaignsError } = await service
    .from('campaigns')
    .select('id, name, campaign_date, sent_at, closed_at, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (campaignsError) {
    return (
      <div className="p-6">
        <p className="text-sm font-medium text-red-600">Couldn&apos;t load analytics data. Please refresh the page.</p>
      </div>
    )
  }

  const list = campaigns ?? []

  const { data: tokens, error: tokensError } = list.length
    ? await service
        .from('gift_tokens')
        .select('campaign_id, redeemed, redeemed_at, sms_sent_at, department, attending')
        .in('campaign_id', list.map((c) => c.id))
    : { data: [], error: null }

  if (tokensError) {
    return (
      <div className="p-6">
        <p className="text-sm font-medium text-red-600">Couldn&apos;t load analytics data. Please refresh the page.</p>
      </div>
    )
  }

  if (list.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-zinc-900">Analytics</h1>
        <p className="mt-2 text-sm text-zinc-500">Run your first campaign to start seeing analytics here.</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-zinc-900">Analytics</h1>
        <p className="mt-1 text-sm text-zinc-500">Across all campaigns for your company</p>
      </div>
      <AnalyticsUI campaigns={list} tokens={tokens ?? []} />
    </div>
  )
}
