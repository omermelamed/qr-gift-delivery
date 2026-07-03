import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { CloseCampaignButton } from '@/components/admin/CloseCampaignButton'
import { CampaignWizard } from '@/components/admin/wizard/CampaignWizard'
import { RedemptionProgress } from '@/components/admin/RedemptionProgress'
import { DistributorAssignment } from '@/components/admin/DistributorAssignment'
import { EmployeeTable } from '@/components/admin/EmployeeTable'
import { DeleteCampaignButton } from '@/components/admin/DeleteCampaignButton'
import { CampaignNotes } from '@/components/admin/CampaignNotes'
import { DistributorStats } from '@/components/admin/DistributorStats'
import { DuplicateCampaignButton } from '@/components/admin/DuplicateCampaignButton'
import { ReminderButton } from '@/components/admin/ReminderButton'
import { GiftBreakdown } from '@/components/admin/GiftBreakdown'
import { ArrivalSummary } from '@/components/admin/ArrivalSummary'
import { CampaignDetailHeader } from '@/components/admin/CampaignDetailHeader'
import { CreditIndicator } from '@/components/admin/CreditIndicator'
import { ViewQrLink, ExportCsvLink } from '@/components/admin/CampaignActions'
import { KebabMenu } from '@/components/admin/KebabMenu'
import { MENU_ITEM, MENU_ITEM_DANGER } from '@/components/admin/menuItemStyles'

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
  const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)
  const canEditGift = hasPermission(permissions, 'campaigns:launch')

  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) redirect('/login')

  const service = createServiceClient()

  const [campaignResult, creditsResult, companyResult] = await Promise.all([
    service
      .from('campaigns')
      .select('id, name, campaign_date, sent_at, closed_at, supports_arrival_certificates, max_attendee_count, sms_template, wizard_last_step')
      .eq('id', campaignId)
      .eq('company_id', companyId)
      .single(),
    service
      .from('credits')
      .select('balance')
      .eq('company_id', companyId)
      .single(),
    service
      .from('companies')
      .select('sms_template')
      .eq('id', companyId)
      .single(),
  ])

  const campaign = campaignResult.data
  if (!campaign) redirect('/admin')

  const creditBalance = creditsResult.data?.balance ?? 0
  const companyDefaultTemplate = companyResult.data?.sms_template ?? null

  const tokensResult = await service
    .from('gift_tokens')
    .select('id, employee_name, phone_number, department, sms_sent_at, redeemed, redeemed_at, redeemed_by, gift_id, token, qr_image_url, attending, attendee_count, arrived_count')
    .eq('campaign_id', campaignId)
    .order('redeemed', { ascending: true })
    .order('employee_name', { ascending: true })

  if (tokensResult.error) {
    console.error(`[campaign ${campaignId}] failed to load gift_tokens:`, tokensResult.error.message)
    throw new Error(`Failed to load campaign employees: ${tokensResult.error.message}`)
  }

  const allTokens = (tokensResult.data ?? []).map((t) => ({
    id: t.id,
    employee_name: t.employee_name,
    phone_number: t.phone_number,
    department: t.department,
    sms_sent_at: t.sms_sent_at,
    redeemed: t.redeemed,
    redeemed_at: t.redeemed_at,
    redeemed_by: t.redeemed_by,
    gift_id: t.gift_id,
    token: t.token,
    qr_image_url: t.qr_image_url,
    attending: t.attending,
    attendee_count: t.attendee_count,
    arrived_count: t.arrived_count,
  }))

  const { data: giftsData } = await service
    .from('campaign_gifts')
    .select('id, name, position')
    .eq('campaign_id', campaignId)
    .order('position', { ascending: true })

  const gifts = giftsData ?? []
  const claimedCount = allTokens.filter((t) => t.redeemed).length
  const isDraft = !campaign.sent_at
  const canClose = !!campaign.sent_at && !campaign.closed_at

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <CampaignDetailHeader
        campaignName={campaign.name}
        campaignDate={campaign.campaign_date}
        sentAt={campaign.sent_at}
        closedAt={campaign.closed_at}
      />

      <div className="flex items-start justify-between gap-4 mb-6">
        <div />
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 flex-shrink-0">
          {canClose && <CloseCampaignButton campaignId={campaign.id} />}
          {!isDraft && (
            <KebabMenu>
              <DuplicateCampaignButton
                campaignId={campaign.id}
                sourceName={campaign.name}
                sourceDate={campaign.campaign_date}
                className={MENU_ITEM}
              />
              {campaign.sent_at && !campaign.closed_at && (
                <ReminderButton campaignId={campaign.id} tokens={allTokens} creditBalance={creditBalance} className={MENU_ITEM} />
              )}
              {campaign.sent_at && <ViewQrLink campaignId={campaign.id} className={MENU_ITEM} />}
              {campaign.sent_at && <ExportCsvLink campaignId={campaign.id} className={MENU_ITEM} />}
            </KebabMenu>
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
          <div className="lg:col-span-3">
            <CampaignWizard
              campaign={{
                id: campaign.id,
                name: campaign.name,
                campaign_date: campaign.campaign_date,
                supports_arrival_certificates: campaign.supports_arrival_certificates,
                max_attendee_count: campaign.max_attendee_count,
                sms_template: campaign.sms_template,
                wizard_last_step: campaign.wizard_last_step,
              }}
              tokens={allTokens}
              gifts={gifts}
              creditBalance={creditBalance}
              companyDefaultTemplate={companyDefaultTemplate}
              canEditGift={canEditGift}
            />
          </div>
        ) : (
          <>
            {/* Main column (2 cols): arrival → progress → gifts → employees.
                One stacking column (matching the draft view) so the sidebar's
                height never interleaves with these via grid auto-flow, which
                previously pushed the cards out of place. */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              {campaign.supports_arrival_certificates && (
                <ArrivalSummary tokens={allTokens} />
              )}
              <RedemptionProgress
                campaignId={campaign.id}
                initialClaimed={claimedCount}
                total={allTokens.length}
              />
              {gifts.length >= 2 && (
                <GiftBreakdown gifts={gifts} tokens={allTokens} />
              )}
              <EmployeeTable
                campaignId={campaign.id}
                initialRows={allTokens}
                isDraft={isDraft}
                gifts={gifts}
                canEditGift={canEditGift}
                showAttendance={campaign.supports_arrival_certificates}
                canEditAttendance={canEditGift}
              />
            </div>

            {/* Sidebar (1 col): config + notes + stats, stacked independently. */}
            <div className="flex flex-col gap-4">
              <DistributorAssignment campaignId={campaign.id} />
              <CampaignNotes campaignId={campaign.id} currentUserId={user.id} />
              <DistributorStats campaignId={campaign.id} total={allTokens.length} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
