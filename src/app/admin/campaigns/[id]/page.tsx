import { notFound } from 'next/navigation'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { CampaignPopulator } from '@/components/admin/CampaignPopulator'
import { LaunchButton } from '@/components/admin/LaunchButton'
import { CloseCampaignButton } from '@/components/admin/CloseCampaignButton'
import { RedemptionProgress } from '@/components/admin/RedemptionProgress'
import { DistributorAssignment } from '@/components/admin/DistributorAssignment'
import { EmployeeTable } from '@/components/admin/EmployeeTable'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { DeleteCampaignButton } from '@/components/admin/DeleteCampaignButton'
import { CampaignNotes } from '@/components/admin/CampaignNotes'
import { DepartmentBreakdown } from '@/components/admin/DepartmentBreakdown'

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
  const isDraft = !campaign.sent_at
  const canLaunch = isDraft && allTokens.length > 0
  const canClose = !!campaign.sent_at && !campaign.closed_at

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors">
          ← Campaigns
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">{campaign.name}</h1>
          <p className="text-sm text-zinc-400 mt-0.5">{campaign.campaign_date ?? '—'}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <StatusBadge sentAt={campaign.sent_at} closedAt={campaign.closed_at} />
          {isDraft && <DeleteCampaignButton campaignId={campaign.id} redirectAfter />}
          {campaign.sent_at && (
            <Link
              href={`/admin/campaigns/${campaign.id}/qr`}
              className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              View QR Codes
            </Link>
          )}
          {canClose && <CloseCampaignButton campaignId={campaign.id} />}
          {canLaunch && (
            <LaunchButton campaignId={campaign.id} employeeCount={allTokens.length} />
          )}
        </div>
      </div>

      {/* ── Bento grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

        {isDraft ? (
          <>
            {/* Draft: Populator (2 cols) + Distributor (1 col) */}
            <div className="lg:col-span-2">
              <CampaignPopulator campaignId={campaign.id} />
            </div>
            <div>
              <DistributorAssignment campaignId={campaign.id} />
            </div>

            {/* Employee table (2 cols) + Notes (1 col) */}
            <div className="lg:col-span-2">
              <EmployeeTable
                campaignId={campaign.id}
                initialRows={allTokens}
                isDraft={isDraft}
              />
            </div>
            <div>
              <CampaignNotes campaignId={campaign.id} currentUserId={user.id} />
            </div>
            <div className="lg:col-span-2">
              <DepartmentBreakdown campaignId={campaign.id} />
            </div>
          </>
        ) : (
          <>
            {/* Row 1: Progress (2 cols) | Distributor (1 col) */}
            <div className="lg:col-span-2">
              <RedemptionProgress
                campaignId={campaign.id}
                initialClaimed={claimedCount}
                total={allTokens.length}
              />
            </div>
            <div>
              <DistributorAssignment campaignId={campaign.id} />
            </div>

            {/* Row 2: Employee table (2 cols) | Notes (1 col) */}
            <div className="lg:col-span-2">
              <EmployeeTable
                campaignId={campaign.id}
                initialRows={allTokens}
                isDraft={isDraft}
              />
            </div>
            <div className="lg:self-stretch">
              <CampaignNotes campaignId={campaign.id} currentUserId={user.id} />
            </div>
            {/* Row 3: Department breakdown (2 cols) */}
            <div className="lg:col-span-2">
              <DepartmentBreakdown campaignId={campaign.id} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
