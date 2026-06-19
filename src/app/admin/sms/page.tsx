import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { SmsDashboardUI } from '@/components/sms/SmsDashboardUI'

export default async function SmsDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const appMeta = user.app_metadata as JwtAppMetadata

  const service = createServiceClient()

  const [creditsResult, campaignsResult, templateCountResult] = await Promise.all([
    service
      .from('credits')
      .select('total_purchased, total_used, balance')
      .eq('company_id', appMeta.company_id)
      .single(),
    service
      .from('sms_campaigns')
      .select('id, name, status, recipients_count, sent_count, failed_count, created_at, sent_at')
      .eq('company_id', appMeta.company_id)
      .order('created_at', { ascending: false }),
    service
      .from('message_templates')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', appMeta.company_id),
  ])

  const credits = creditsResult.data ?? { total_purchased: 0, total_used: 0, balance: 0 }
  const campaigns = campaignsResult.data ?? []

  // Aggregate stats across all campaigns
  let totalSent = 0
  let totalFailed = 0
  let totalRecipients = 0
  for (const c of campaigns) {
    totalSent += c.sent_count
    totalFailed += c.failed_count
    totalRecipients += c.recipients_count
  }

  return (
    <SmsDashboardUI
      credits={credits}
      campaigns={campaigns}
      stats={{
        totalCampaigns: campaigns.length,
        totalRecipients,
        totalSent,
        totalFailed,
        templateCount: templateCountResult.count ?? 0,
      }}
    />
  )
}
