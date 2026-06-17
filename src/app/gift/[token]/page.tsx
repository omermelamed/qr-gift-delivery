import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'

export default async function GiftQrPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const service = createServiceClient()

  const { data: tokenRow } = await service
    .from('gift_tokens')
    .select('employee_name, redeemed, qr_image_url, campaigns(name)')
    .eq('token', token)
    .single()

  if (!tokenRow) return notFound()

  const campaign = tokenRow.campaigns as unknown as { name: string } | null

  if (tokenRow.redeemed) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-zinc-100 px-6">
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">&#10005;</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-900 mb-1">Already Claimed</h1>
          <p className="text-sm text-zinc-500">This gift has already been redeemed.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 to-violet-50 px-6">
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 max-w-sm w-full text-center">
        <h1 className="text-2xl font-bold text-zinc-900 mb-1">
          {tokenRow.employee_name}
        </h1>
        {campaign && (
          <p className="text-sm text-zinc-500 mb-6">{campaign.name}</p>
        )}

        {tokenRow.qr_image_url ? (
          <img
            src={tokenRow.qr_image_url}
            alt="Gift QR code"
            width={280}
            height={280}
            className="mx-auto rounded-lg"
          />
        ) : (
          <div className="w-[280px] h-[280px] bg-zinc-100 rounded-lg flex items-center justify-center mx-auto">
            <p className="text-zinc-400 text-sm">QR code not available</p>
          </div>
        )}

        <p className="text-sm text-zinc-500 mt-6">
          Show this QR code to a distributor to collect your gift.
        </p>
      </div>
    </main>
  )
}
