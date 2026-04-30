import { notFound } from 'next/navigation'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { TokenUploader } from '@/components/admin/TokenUploader'
import { LaunchButton } from '@/components/admin/LaunchButton'
import { CloseCampaignButton } from '@/components/admin/CloseCampaignButton'
import { RedemptionProgress } from '@/components/admin/RedemptionProgress'
import { EmployeeTable } from '@/components/admin/EmployeeTable'

function StatusBadge({ sentAt, closedAt }: { sentAt: string | null; closedAt: string | null }) {
  if (closedAt) return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-500">Closed</span>
  if (sentAt) return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">Sent</span>
  return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">Draft</span>
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const appMeta = user.app_metadata as JwtAppMetadata

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, name, campaign_date, sent_at, closed_at')
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!campaign) notFound()

  const { data: tokens } = await service
    .from('gift_tokens')
    .select('id, employee_name, phone_number, department, sms_sent_at, redeemed, redeemed_at, redeemed_by')
    .eq('campaign_id', campaignId)
    .order('redeemed', { ascending: true })
    .order('employee_name', { ascending: true })

  const allTokens = tokens ?? []
  const claimedCount = allTokens.filter((t) => t.redeemed).length
  const canLaunch = !campaign.sent_at && allTokens.length > 0
  const canClose = !!campaign.sent_at && !campaign.closed_at

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors">
          ← Campaigns
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">{campaign.name}</h1>
          <p className="text-sm text-zinc-400 mt-0.5">{campaign.campaign_date ?? '—'}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <StatusBadge sentAt={campaign.sent_at} closedAt={campaign.closed_at} />
          {canClose && <CloseCampaignButton campaignId={campaign.id} />}
          {canLaunch && (
            <LaunchButton campaignId={campaign.id} employeeCount={allTokens.length} />
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6 items-start">
        {/* Left rail */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-4">
          <RedemptionProgress
            campaignId={campaign.id}
            initialClaimed={claimedCount}
            total={allTokens.length}
          />
          {!campaign.sent_at && (
            <TokenUploader campaignId={campaign.id} />
          )}
        </div>

        {/* Right column */}
        <div className="flex-1 min-w-0">
          <EmployeeTable
            campaignId={campaign.id}
            initialRows={allTokens}
            isDraft={!campaign.sent_at}
          />
        </div>
      </div>
    </div>
  )
}
