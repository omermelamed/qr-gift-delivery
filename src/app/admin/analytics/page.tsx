import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'
import { AnalyticsUI } from '@/components/admin/analytics/AnalyticsUI'
import { AnalyticsStatusMessage } from '@/components/admin/analytics/AnalyticsStatusMessage'

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
    return <AnalyticsStatusMessage variant="error" />
  }

  const list = campaigns ?? []

  const { data: tokens, error: tokensError } = list.length
    ? await service
        .from('gift_tokens')
        .select('campaign_id, redeemed, department, attending')
        .in('campaign_id', list.map((c) => c.id))
    : { data: [], error: null }

  if (tokensError) {
    return <AnalyticsStatusMessage variant="error" />
  }

  if (list.length === 0) {
    return <AnalyticsStatusMessage variant="empty" />
  }

  return (
    <div className="p-6">
      <AnalyticsUI campaigns={list} tokens={tokens ?? []} />
    </div>
  )
}
