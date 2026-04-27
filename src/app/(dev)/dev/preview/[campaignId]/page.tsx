import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'

export default async function DevPreviewPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  if (process.env.NODE_ENV === 'production') notFound()

  const { campaignId } = await params
  const supabase = createServiceClient()

  const { data: tokens } = await supabase
    .from('gift_tokens')
    .select('id, employee_name, phone_number, qr_image_url, token')
    .eq('campaign_id', campaignId)
    .order('employee_name')

  if (!tokens || tokens.length === 0) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold mb-2">Dev Preview</h1>
        <p className="text-gray-500">No tokens found for campaign {campaignId}</p>
      </main>
    )
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-1">Dev Preview</h1>
      <p className="text-gray-500 mb-8 text-sm">
        {tokens.length} tokens · Campaign {campaignId}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {tokens.map((t) => (
          <div
            key={t.id}
            className="border rounded-xl p-4 flex flex-col items-center gap-3 bg-white shadow-sm"
          >
            <p className="font-semibold">{t.employee_name}</p>
            <p className="text-xs text-gray-400">{t.phone_number}</p>
            {t.qr_image_url ? (
              <img
                src={t.qr_image_url}
                alt={`QR for ${t.employee_name}`}
                width={160}
                height={160}
                className="rounded"
              />
            ) : (
              <div className="w-40 h-40 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-400">
                QR pending
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}
