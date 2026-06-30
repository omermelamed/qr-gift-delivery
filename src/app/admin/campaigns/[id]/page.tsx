import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { CampaignPopulator } from '@/components/admin/CampaignPopulator'
import { LaunchButton } from '@/components/admin/LaunchButton'
import { CloseCampaignButton } from '@/components/admin/CloseCampaignButton'
import { RedemptionProgress } from '@/components/admin/RedemptionProgress'
import { DistributorAssignment } from '@/components/admin/DistributorAssignment'
import { GiftOptionsEditor } from '@/components/admin/GiftOptionsEditor'
import { ArrivalCertToggle } from '@/components/admin/ArrivalCertToggle'
import { CampaignSmsTemplate } from '@/components/admin/CampaignSmsTemplate'
import { EmployeeTable } from '@/components/admin/EmployeeTable'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { DeleteCampaignButton } from '@/components/admin/DeleteCampaignButton'
import { CampaignNotes } from '@/components/admin/CampaignNotes'
import { DepartmentBreakdown } from '@/components/admin/DepartmentBreakdown'
import { DistributorStats } from '@/components/admin/DistributorStats'
import { DuplicateCampaignButton } from '@/components/admin/DuplicateCampaignButton'
import { ReminderButton } from '@/components/admin/ReminderButton'
import { GiftBreakdown } from '@/components/admin/GiftBreakdown'
import { ArrivalSummary } from '@/components/admin/ArrivalSummary'
import { CampaignDetailHeader } from '@/components/admin/CampaignDetailHeader'
import { CreditIndicator } from '@/components/admin/CreditIndicator'
import { ViewQrLink, ExportCsvLink } from '@/components/admin/CampaignActions'

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
      .select('id, name, campaign_date, sent_at, closed_at, supports_arrival_certificates, max_attendee_count, sms_template')
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

  const [tokensResult, employeesResult] = await Promise.all([
    service
      .from('gift_tokens')
      .select('id, employee_name, phone_number, department, sms_sent_at, redeemed, redeemed_at, redeemed_by, gift_id, token, qr_image_url, attending, attendee_count, arrived_count')
      .eq('campaign_id', campaignId)
      .order('redeemed', { ascending: true })
      .order('employee_name', { ascending: true }),
    service
      .from('employees')
      .select('id, employee_name, phone, department')
      .eq('company_id', companyId),
  ])

  // Fail loudly: a broken gift_tokens query (e.g. a column added in code but not
  // yet migrated to the DB) must surface as an error, not silently render an
  // empty employee table that looks like data loss. PostgREST messages name the
  // offending column, not any token value, so they are safe to log.
  if (tokensResult.error) {
    console.error(`[campaign ${campaignId}] failed to load gift_tokens:`, tokensResult.error.message)
    throw new Error(`Failed to load campaign employees: ${tokensResult.error.message}`)
  }
  if (employeesResult.error) {
    // Non-fatal: employees only enrich name/phone/department; tokens carry their
    // own copy. Log it so the degraded enrichment is visible.
    console.error(`[campaign ${campaignId}] failed to load employees:`, employeesResult.error.message)
  }

  const employees = employeesResult.data ?? []
  const empByName = new Map(employees.map((e) => [e.employee_name, e]))
  const empByPhone = new Map(employees.filter((e) => e.phone).map((e) => [e.phone!, e]))

  const allTokens = (tokensResult.data ?? []).map((t) => {
    const emp = empByName.get(t.employee_name) ?? (t.phone_number ? empByPhone.get(t.phone_number) : undefined)
    return {
      id: t.id,
      employee_name: emp?.employee_name ?? t.employee_name,
      phone_number: emp?.phone ?? t.phone_number,
      department: emp?.department ?? t.department,
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
    }
  })

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
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <CampaignDetailHeader
        campaignName={campaign.name}
        campaignDate={campaign.campaign_date}
      />

      <div className="flex items-start justify-between gap-4 mb-6">
        <div />
        <div className="group flex flex-wrap items-center gap-2 sm:gap-3 flex-shrink-0">
          <StatusBadge sentAt={campaign.sent_at} closedAt={campaign.closed_at} />
          {isDraft && <DeleteCampaignButton campaignId={campaign.id} redirectAfter />}
          <DuplicateCampaignButton
            campaignId={campaign.id}
            sourceName={campaign.name}
            sourceDate={campaign.campaign_date}
          />
          {campaign.sent_at && <ViewQrLink campaignId={campaign.id} />}
          {campaign.sent_at && <ExportCsvLink campaignId={campaign.id} />}
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
            {/* Main column (2 cols): populator → employee table → breakdown.
                Kept as one stacking column so the sidebar's height never pushes
                these apart (grid rows would otherwise couple their heights). */}
            <div className="lg:col-span-2 flex flex-col gap-4">
              <CampaignPopulator campaignId={campaign.id} existingTokens={allTokens.map((t) => ({ employee_name: t.employee_name, phone_number: t.phone_number }))} />
              <EmployeeTable
                campaignId={campaign.id}
                initialRows={allTokens}
                isDraft={isDraft}
                gifts={gifts}
                canEditGift={canEditGift}
                showAttendance={campaign.supports_arrival_certificates}
                canEditAttendance={canEditGift}
              />
              <DepartmentBreakdown tokens={allTokens} />
            </div>

            {/* Sidebar (1 col): config cards + notes, stacked independently. */}
            <div className="flex flex-col gap-4">
              <DistributorAssignment campaignId={campaign.id} />
              <GiftOptionsEditor campaignId={campaign.id} />
              <ArrivalCertToggle campaignId={campaign.id} initial={campaign.supports_arrival_certificates} initialMax={campaign.max_attendee_count} />
              <CampaignSmsTemplate campaignId={campaign.id} initial={campaign.sms_template} companyDefault={companyDefaultTemplate} />
              <CampaignNotes campaignId={campaign.id} currentUserId={user.id} />
            </div>
          </>
        ) : (
          <>
            {/* Row 1: Progress + GiftBreakdown (2 cols) | Distributor (1 col) */}
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
                canEditGift={canEditGift}
                showAttendance={campaign.supports_arrival_certificates}
                canEditAttendance={canEditGift}
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
