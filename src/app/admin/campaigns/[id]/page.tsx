import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { TokenUploader } from '@/components/admin/TokenUploader'
import { LaunchButton } from '@/components/admin/LaunchButton'
import { RedemptionProgress } from '@/components/admin/RedemptionProgress'
import { EmployeeTable } from '@/components/admin/EmployeeTable'

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const appMeta = user!.app_metadata as JwtAppMetadata

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, name, campaign_date, sent_at')
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

  return (
    <main className="p-8 max-w-5xl mx-auto flex flex-col gap-6">
      <div className="mb-2">
        <Link href="/admin" className="text-sm text-gray-500 hover:underline">← Campaigns</Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{campaign.campaign_date ?? '—'}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
          campaign.sent_at ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
        }`}>
          {campaign.sent_at ? 'Sent' : 'Draft'}
        </span>
      </div>

      {canLaunch && <LaunchButton campaignId={campaign.id} employeeCount={allTokens.length} />}

      {!campaign.sent_at && <TokenUploader campaignId={campaign.id} />}

      <RedemptionProgress
        campaignId={campaign.id}
        initialClaimed={claimedCount}
        total={allTokens.length}
      />

      <EmployeeTable
        campaignId={campaign.id}
        initialRows={allTokens}
      />
    </main>
  )
}
