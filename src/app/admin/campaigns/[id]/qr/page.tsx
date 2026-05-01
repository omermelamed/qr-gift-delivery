import { notFound } from 'next/navigation'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { PrintButton } from './PrintButton'
import { QrGrid } from './QrGrid'

export default async function CampaignQrPage({
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
    .select('id, name, sent_at')
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!campaign) notFound()
  if (!campaign.sent_at) redirect(`/admin/campaigns/${campaignId}`)

  const { data: tokens } = await service
    .from('gift_tokens')
    .select('id, employee_name, phone_number, department, token, qr_image_url, redeemed')
    .eq('campaign_id', campaignId)
    .order('employee_name')

  const rows = tokens ?? []

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href={`/admin/campaigns/${campaignId}`}
            className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            ← {campaign.name}
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900 mt-2">QR Codes</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{rows.length} codes · share or print this page</p>
        </div>
        <PrintButton />
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-zinc-200">
          <p className="text-zinc-500">No QR codes found for this campaign.</p>
        </div>
      ) : (
        <QrGrid rows={rows} />
      )}
    </div>
  )
}
