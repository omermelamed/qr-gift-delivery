'use client'

import Link from 'next/link'
import { DuplicateCampaignButton } from '@/components/admin/DuplicateCampaignButton'
import { DeleteCampaignButton } from '@/components/admin/DeleteCampaignButton'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { KebabMenu } from '@/components/admin/KebabMenu'
import { useT } from '@/lib/i18n/useT'

const MENU_ITEM = 'w-full text-start px-3 py-2 rounded-lg text-sm font-medium text-zinc-700 hover-brand transition-colors'
const MENU_ITEM_DANGER = 'w-full text-start px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors'

type CampaignRow = {
  id: string
  name: string
  campaign_date: string | null
  sent_at: string | null
  closed_at: string | null
  stats: { total: number; redeemed: number }
}

type Props = {
  campaigns: CampaignRow[]
  totalGifts: number
  totalRedeemed: number
}

export function AdminDashboardUI({ campaigns, totalGifts, totalRedeemed }: Props) {
  const t = useT()
  const totalCampaigns = campaigns.length
  const totalUnredeemed = totalGifts - totalRedeemed
  const overallPct = totalGifts > 0 ? Math.round((totalRedeemed / totalGifts) * 100) : 0

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">{t('Campaigns')}</h1>
        <Link
          href="/admin/campaigns/new"
          className="text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
          style={{ backgroundColor: 'var(--brand, #6366f1)' }}
        >
          {t('+ New Campaign')}
        </Link>
      </div>

      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: t('Campaigns'), value: totalCampaigns },
            { label: t('Gifts Sent'), value: totalGifts },
            { label: t('Redeemed'), value: `${totalRedeemed} (${overallPct}%)` },
            { label: t('Unredeemed'), value: totalUnredeemed },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white border border-zinc-200 rounded-xl p-4">
              <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide">{label}</p>
              <p className="text-2xl font-bold text-zinc-900 mt-1">{value}</p>
            </div>
          ))}
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-zinc-200">
          <div className="w-12 h-12 rounded-2xl bg-brand mx-auto mb-4" />
          <p className="text-zinc-900 font-semibold mb-1">{t('No campaigns yet')}</p>
          <p className="text-sm text-zinc-500 mb-6">{t('Create your first campaign to get started')}</p>
          <Link
            href="/admin/campaigns/new"
            className="text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
            style={{ backgroundColor: 'var(--brand, #6366f1)' }}
          >
            {t('+ New Campaign')}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {campaigns.map((c) => {
            const pct = c.stats.total > 0 ? Math.round((c.stats.redeemed / c.stats.total) * 100) : 0
            const showProgress = !!c.sent_at && c.stats.total > 0
            return (
              <Link
                key={c.id}
                href={`/admin/campaigns/${c.id}`}
                className="bg-white border border-zinc-200 rounded-xl p-5 hover:shadow-md transition-shadow group"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900 group-hover-brand-text transition-colors truncate">
                      {c.name}
                    </p>
                    <p className="text-sm text-zinc-400 mt-0.5">{c.campaign_date ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge sentAt={c.sent_at} closedAt={c.closed_at} />
                    <KebabMenu>
                      <DuplicateCampaignButton
                        campaignId={c.id}
                        sourceName={c.name}
                        sourceDate={c.campaign_date}
                        className={MENU_ITEM}
                      />
                      {!c.sent_at && <DeleteCampaignButton campaignId={c.id} className={MENU_ITEM_DANGER} />}
                    </KebabMenu>
                  </div>
                </div>

                {showProgress && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
                      <span>{c.stats.redeemed} {t('of')} {c.stats.total} {t('claimed')}</span>
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
