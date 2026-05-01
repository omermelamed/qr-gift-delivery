import { notFound } from 'next/navigation'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { PrintButton } from './PrintButton'

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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 print:grid-cols-3">
          {rows.map((t) => (
            <div
              key={t.id}
              className={`bg-white border rounded-xl p-4 flex flex-col items-center gap-3 ${
                t.redeemed ? 'border-zinc-100 opacity-50' : 'border-zinc-200 shadow-sm'
              }`}
            >
              <p className="font-semibold text-zinc-900 text-sm text-center">{t.employee_name}</p>
              {t.department && (
                <p className="text-xs text-zinc-400 -mt-2">{t.department}</p>
              )}
              {t.qr_image_url ? (
                <img
                  src={t.qr_image_url}
                  alt={`QR for ${t.employee_name}`}
                  width={160}
                  height={160}
                  className="rounded"
                />
              ) : (
                <div className="w-40 h-40 bg-zinc-100 rounded flex items-center justify-center text-xs text-zinc-400">
                  QR generating…
                </div>
              )}
              <p className="text-xs text-zinc-400 font-mono break-all text-center">
                {t.phone_number.replace(/\d(?=\d{4})/g, '•')}
              </p>
              {t.redeemed && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500">
                  Redeemed
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
