import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { CampaignPopulator } from '@/components/admin/CampaignPopulator'
import { LaunchButton } from '@/components/admin/LaunchButton'
import { CloseCampaignButton } from '@/components/admin/CloseCampaignButton'
import { RedemptionProgress } from '@/components/admin/RedemptionProgress'
import { DistributorAssignment } from '@/components/admin/DistributorAssignment'
import { GiftOptionsEditor } from '@/components/admin/GiftOptionsEditor'
import { EmployeeTable } from '@/components/admin/EmployeeTable'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { DeleteCampaignButton } from '@/components/admin/DeleteCampaignButton'
import { CampaignNotes } from '@/components/admin/CampaignNotes'
import { DepartmentBreakdown } from '@/components/admin/DepartmentBreakdown'
import { DistributorStats } from '@/components/admin/DistributorStats'
import { DuplicateCampaignButton } from '@/components/admin/DuplicateCampaignButton'
import { ReminderButton } from '@/components/admin/ReminderButton'
import { GiftBreakdown } from '@/components/admin/GiftBreakdown'
import { CampaignDetailHeader } from '@/components/admin/CampaignDetailHeader'
import { CreditIndicator } from '@/components/admin/CreditIndicator'

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

  const [campaignResult, creditsResult] = await Promise.all([
    service
      .from('campaigns')
      .select('id, name, campaign_date, sent_at, closed_at, scheduled_at')
      .eq('id', campaignId)
      .eq('company_id', appMeta.company_id)
      .single(),
    service
      .from('credits')
      .select('balance')
      .eq('company_id', appMeta.company_id)
      .single(),
  ])

  const campaign = campaignResult.data
  if (!campaign) redirect('/admin')

  const creditBalance = creditsResult.data?.balance ?? 0

  const { data: tokens } = await service
    .from('gift_tokens')
    .select('id, employee_name, phone_number, department, sms_sent_at, redeemed, redeemed_at, redeemed_by, gift_id, token, qr_image_url')
    .eq('campaign_id', campaignId)
    .order('redeemed', { ascending: true })
    .order('employee_name', { ascending: true })

  const allTokens = tokens ?? []

  const { data: giftsData } = await service
    .from('campaign_gifts')
    .select('id, name, position')
    .eq('campaign_id', campaignId)
    .order('position', { ascending: true })

  const gifts = giftsData ?? []
  const claimedCount = allTokens.filter((t) => t.redeemed).length
  const isDraft = !campaign.sent_at
  const canLaunch = isDraft && allTokens.length > 0
  const canClose = !!campaign.sent_at && !campaign.closed_at
  const unredeemedCount = allTokens.filter((t) => !t.redeemed).length

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <CampaignDetailHeader
        campaignName={campaign.name}
        campaignDate={campaign.campaign_date}
        scheduledAt={campaign.scheduled_at}
        sentAt={campaign.sent_at}
      />

      <div className="flex items-start justify-between gap-4 mb-6">
        <div />
        <div className="group flex items-center gap-3 flex-shrink-0">
          <StatusBadge sentAt={campaign.sent_at} closedAt={campaign.closed_at} />
          {isDraft && <DeleteCampaignButton campaignId={campaign.id} redirectAfter />}
          <DuplicateCampaignButton
            campaignId={campaign.id}
            sourceName={campaign.name}
            sourceDate={campaign.campaign_date}
          />
          {campaign.sent_at && (
            <Link
              href={`/admin/campaigns/${campaign.id}/qr`}
              className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              View QR Codes
            </Link>
          )}
          {campaign.sent_at && (
            <a
              href={`/api/campaigns/${campaign.id}/export`}
              download
              className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              Export CSV
            </a>
          )}
          {campaign.sent_at && !campaign.closed_at && (
            <ReminderButton campaignId={campaign.id} tokens={allTokens} creditBalance={creditBalance} />
          )}
          {canClose && <CloseCampaignButton campaignId={campaign.id} />}
          {canLaunch && (
            <LaunchButton campaignId={campaign.id} employeeCount={allTokens.length} creditBalance={creditBalance} />
          )}
        </div>
      </div>

      <CreditIndicator
        balance={creditBalance}
        needed={
          isDraft
            ? allTokens.filter((t) => !!t.phone_number).length
            : allTokens.filter((t) => !t.redeemed && !!t.phone_number).length
        }
        label={isDraft ? undefined : 'if resending to all unclaimed'}
      />

      {/* ── Bento grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

        {isDraft ? (
          <>
            {/* Draft: Populator (2 cols) + Distributor + GiftOptions (1 col) */}
            <div className="lg:col-span-2">
              <CampaignPopulator campaignId={campaign.id} existingTokens={allTokens.map((t) => ({ employee_name: t.employee_name, phone_number: t.phone_number }))} />
            </div>
            <div className="flex flex-col gap-4">
              <DistributorAssignment campaignId={campaign.id} />
              <GiftOptionsEditor campaignId={campaign.id} />
            </div>

            {/* Employee table (2 cols) + Notes (1 col) */}
            <div className="lg:col-span-2">
              <EmployeeTable
                campaignId={campaign.id}
                initialRows={allTokens}
                isDraft={isDraft}
                gifts={gifts}
              />
            </div>
            <div>
              <CampaignNotes campaignId={campaign.id} currentUserId={user.id} />
            </div>
            <div className="lg:col-span-2">
              <DepartmentBreakdown tokens={allTokens} />
            </div>
          </>
        ) : (
          <>
            {/* Row 1: Progress + GiftBreakdown (2 cols) | Distributor (1 col) */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <RedemptionProgress
                campaignId={campaign.id}
                initialClaimed={claimedCount}
                total={allTokens.length}
              />
              {gifts.length >= 2 && (
                <GiftBreakdown gifts={gifts} tokens={allTokens} />
              )}
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
                gifts={gifts}
              />
            </div>
            <div className="lg:self-stretch">
              <CampaignNotes campaignId={campaign.id} currentUserId={user.id} />
            </div>
            <div>
              <DistributorStats campaignId={campaign.id} total={allTokens.length} />
            </div>
            {/* Row 3: Department breakdown (2 cols) */}
            <div className="lg:col-span-2">
              <DepartmentBreakdown tokens={allTokens} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
