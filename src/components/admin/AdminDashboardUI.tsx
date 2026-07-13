'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { DuplicateCampaignButton } from '@/components/admin/DuplicateCampaignButton'
import { DeleteCampaignButton } from '@/components/admin/DeleteCampaignButton'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { KebabMenu } from '@/components/admin/KebabMenu'
import { StatusDropdown } from '@/components/admin/StatusDropdown'
import { DateRangeDropdown } from '@/components/admin/DateRangeDropdown'
import { MENU_ITEM, MENU_ITEM_DANGER } from '@/components/admin/menuItemStyles'
import { useT } from '@/lib/i18n/useT'
import { useLocale } from '@/lib/i18n/LanguageContext'
import type { StatusFilter } from '@/lib/analytics/filterCampaigns'

type CampaignRow = {
  id: string
  name: string
  campaign_date: string | null
  sent_at: string | null
  closed_at: string | null
  created_by_name: string | null
  stats: { total: number; redeemed: number }
}

type Props = {
  campaigns: CampaignRow[]
}

function campaignStatus(c: CampaignRow): 'draft' | 'active' | 'closed' {
  if (c.closed_at) return 'closed'
  if (c.sent_at) return 'active'
  return 'draft'
}

function formatDate(dateStr: string | null, locale: string): string {
  if (!dateStr) return '—'
  if (locale === 'he') {
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
  }
  return dateStr
}

export function AdminDashboardUI({ campaigns }: Props) {
  const t = useT()
  const { locale } = useLocale()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filtered = useMemo(() => {
    return campaigns.filter((c) => {
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
      if (statusFilter !== 'all' && campaignStatus(c) !== statusFilter) return false
      if (dateFrom && (c.campaign_date ?? '') < dateFrom) return false
      if (dateTo && (c.campaign_date ?? '') > dateTo) return false
      return true
    })
  }, [campaigns, search, statusFilter, dateFrom, dateTo])

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[28px] font-extrabold text-zinc-900 flex items-center gap-2.5">
          <span>{t('Campaigns')}</span>
          {campaigns.length > 0 && (
            <span className="rounded-full bg-[var(--color-surface-sage)] text-brand text-sm font-bold px-2.5 py-1">
              {campaigns.length}
            </span>
          )}
        </h1>
        <Link href="/admin/campaigns/new" className="btn-cta">
          {t('+ New Campaign')}
        </Link>
      </div>

      {campaigns.length > 0 && (
        <div className="toolbar flex gap-2 mb-5">
          <input
            type="text"
            placeholder={t('Search campaigns…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field h-9 flex-1 px-3 text-sm"
          />
          <StatusDropdown value={statusFilter} onChange={setStatusFilter} />
          <DateRangeDropdown from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="card text-center py-24">
          <div className="w-12 h-12 rounded-2xl bg-brand mx-auto mb-4" />
          <p className="text-zinc-900 font-semibold mb-1">{t('No campaigns yet')}</p>
          <p className="text-sm text-zinc-500 mb-6">{t('Create your first campaign to get started')}</p>
          <Link href="/admin/campaigns/new" className="btn-cta">
            {t('+ New Campaign')}
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-zinc-500 text-sm">{t('No campaigns match your filters')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((c) => {
            const pct = c.stats.total > 0 ? Math.round((c.stats.redeemed / c.stats.total) * 100) : 0
            const showProgress = !!c.sent_at && c.stats.total > 0
            const status = campaignStatus(c)
            return (
              <Link
                key={c.id}
                href={`/admin/campaigns/${c.id}`}
                className={`card card-with-status status-${status} block p-5 group`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-lg font-extrabold text-zinc-900 group-hover-brand-text transition-colors truncate">
                      {c.name}
                    </p>
                    <p className="text-sm font-medium text-zinc-400 mt-1">
                      <span className="text-zinc-500">{t('Campaign due date')}:</span> {formatDate(c.campaign_date, locale)}
                    </p>
                    {c.created_by_name && (
                      <p className="text-sm font-medium text-zinc-400 mt-0.5">
                        <span className="text-zinc-500">{t('Created by')}:</span> {c.created_by_name}
                      </p>
                    )}
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
                        style={{ width: `${pct}%`, backgroundColor: 'var(--brand, #6E8B74)' }}
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
