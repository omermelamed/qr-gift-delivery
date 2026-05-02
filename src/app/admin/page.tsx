import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { DuplicateCampaignButton } from '@/components/admin/DuplicateCampaignButton'
import { DeleteCampaignButton } from '@/components/admin/DeleteCampaignButton'
import { StatusBadge } from '@/components/admin/StatusBadge'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const appMeta = user.app_metadata as JwtAppMetadata

  const service = createServiceClient()
  const { data: campaigns } = await service
    .from('campaigns')
    .select('id, name, campaign_date, sent_at, closed_at')
    .eq('company_id', appMeta.company_id)
    .order('created_at', { ascending: false })

  const list = campaigns ?? []

  // Fetch redemption counts for all campaigns in one query
  const { data: tokenRows } = list.length
    ? await service
        .from('gift_tokens')
        .select('campaign_id, redeemed')
        .in('campaign_id', list.map((c) => c.id))
    : { data: [] }

  const statsMap = new Map<string, { total: number; redeemed: number }>()
  for (const t of tokenRows ?? []) {
    if (!statsMap.has(t.campaign_id)) statsMap.set(t.campaign_id, { total: 0, redeemed: 0 })
    const s = statsMap.get(t.campaign_id)!
    s.total++
    if (t.redeemed) s.redeemed++
  }

  const totalCampaigns = list.length
  let totalGifts = 0, totalRedeemed = 0
  for (const v of statsMap.values()) { totalGifts += v.total; totalRedeemed += v.redeemed }
  const totalUnredeemed = totalGifts - totalRedeemed
  const overallPct = totalGifts > 0 ? Math.round((totalRedeemed / totalGifts) * 100) : 0

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Campaigns</h1>
        <Link
          href="/admin/campaigns/new"
          className="text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
          style={{ backgroundColor: 'var(--brand, #6366f1)' }}
        >
          + New Campaign
        </Link>
      </div>

      {list.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Campaigns', value: totalCampaigns },
            { label: 'Gifts Sent', value: totalGifts },
            { label: 'Redeemed', value: `${totalRedeemed} (${overallPct}%)` },
            { label: 'Unredeemed', value: totalUnredeemed },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white border border-zinc-200 rounded-xl p-4">
              <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide">{label}</p>
              <p className="text-2xl font-bold text-zinc-900 mt-1">{value}</p>
            </div>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-zinc-200">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 mx-auto mb-4" />
          <p className="text-zinc-900 font-semibold mb-1">No campaigns yet</p>
          <p className="text-sm text-zinc-500 mb-6">Create your first campaign to get started</p>
          <Link
            href="/admin/campaigns/new"
            className="text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
            style={{ backgroundColor: 'var(--brand, #6366f1)' }}
          >
            + New Campaign
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((c) => {
            const stats = statsMap.get(c.id) ?? { total: 0, redeemed: 0 }
            const pct = stats.total > 0 ? Math.round((stats.redeemed / stats.total) * 100) : 0
            const showProgress = !!c.sent_at && stats.total > 0
            return (
              <Link
                key={c.id}
                href={`/admin/campaigns/${c.id}`}
                className="bg-white border border-zinc-200 rounded-xl p-5 hover:shadow-md transition-shadow group"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900 group-hover:text-indigo-600 transition-colors truncate">
                      {c.name}
                    </p>
                    <p className="text-sm text-zinc-400 mt-0.5">{c.campaign_date ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!c.sent_at && <DeleteCampaignButton campaignId={c.id} />}
                    <DuplicateCampaignButton
                      campaignId={c.id}
                      sourceName={c.name}
                      sourceDate={c.campaign_date}
                    />
                    <StatusBadge sentAt={c.sent_at} closedAt={c.closed_at} />
                  </div>
                </div>

                {showProgress && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
                      <span>{stats.redeemed} of {stats.total} claimed</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: 'var(--brand, #6366f1)' }}
                      />
                    </div>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
