'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import { DuplicateCampaignButton } from '@/components/admin/DuplicateCampaignButton'
import { DeleteCampaignButton } from '@/components/admin/DeleteCampaignButton'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { KebabMenu } from '@/components/admin/KebabMenu'
import { MENU_ITEM, MENU_ITEM_DANGER } from '@/components/admin/menuItemStyles'
import { useT } from '@/lib/i18n/useT'
import { useLocale } from '@/lib/i18n/LanguageContext'

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

type StatusFilter = 'all' | 'draft' | 'active' | 'closed'

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

const STATUS_DOT: Record<StatusFilter, string> = {
  all: 'bg-zinc-300',
  draft: 'bg-violet-400',
  active: 'bg-green-500',
  closed: 'bg-zinc-400',
}

function StatusDropdown({ value, onChange }: { value: StatusFilter; onChange: (v: StatusFilter) => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const options: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('All statuses') },
    { value: 'draft', label: t('Draft') },
    { value: 'active', label: t('Active') },
    { value: 'closed', label: t('Closed') },
  ]

  const selected = options.find((o) => o.value === value)!

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-9 flex items-center gap-2 border border-zinc-200 rounded-lg px-3 text-sm bg-white hover:border-zinc-300 focus:outline-none focus:ring-2 ring-brand transition-colors whitespace-nowrap"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[value]}`} />
        <span className="text-zinc-700">{selected.label}</span>
        <svg className={`w-4 h-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 right-0 z-20 bg-white border border-zinc-200 rounded-xl shadow-lg py-1 min-w-[160px]">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-zinc-50 transition-colors ${opt.value === value ? 'text-zinc-900 font-medium' : 'text-zinc-600'}`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[opt.value]}`} />
              {opt.label}
              {opt.value === value && (
                <svg className="w-3.5 h-3.5 text-brand ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DateRangeDropdown({ from, to, onFromChange, onToChange }: {
  from: string; to: string; onFromChange: (v: string) => void; onToChange: (v: string) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const hasFilter = from || to
  const label = hasFilter
    ? [from, to].filter(Boolean).join(' → ')
    : t('All dates')

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`h-9 flex items-center gap-2 border rounded-lg px-3 text-sm bg-white hover:border-zinc-300 focus:outline-none focus:ring-2 ring-brand transition-colors whitespace-nowrap ${hasFilter ? 'border-brand text-brand' : 'border-zinc-200 text-zinc-700'}`}
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>{label}</span>
        {hasFilter && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onFromChange(''); onToChange('') }}
            className="flex items-center text-brand/60 hover:text-brand transition-colors"
            title={t('Clear dates')}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        )}
        <svg className={`w-4 h-4 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 right-0 z-20 bg-white border border-zinc-200 rounded-xl shadow-lg p-3 w-64">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500">{t('From date')}</label>
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => onFromChange(e.target.value)}
                className="h-9 w-full border border-zinc-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 ring-brand"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500">{t('To date')}</label>
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => onToChange(e.target.value)}
                className="h-9 w-full border border-zinc-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 ring-brand"
              />
            </div>
            {hasFilter && (
              <button
                type="button"
                onClick={() => { onFromChange(''); onToChange('') }}
                className="text-xs text-zinc-400 hover:text-zinc-600 text-left pt-1 transition-colors"
              >
                {t('Clear dates')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
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
        <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2.5">
          <span>{t('Campaigns')}</span>
          {campaigns.length > 0 && (
            <span className="text-lg text-zinc-400 font-normal">({campaigns.length})</span>
          )}
        </h1>
        <Link
          href="/admin/campaigns/new"
          className="text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
          style={{ backgroundColor: 'var(--brand, #6E8B74)' }}
        >
          {t('+ New Campaign')}
        </Link>
      </div>

      {campaigns.length > 0 && (
        <div className="flex gap-2 mb-5">
          <input
            type="text"
            placeholder={t('Search campaigns…')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 flex-1 border border-zinc-200 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 ring-brand focus:border-transparent"
          />
          <StatusDropdown value={statusFilter} onChange={setStatusFilter} />
          <DateRangeDropdown from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
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
            style={{ backgroundColor: 'var(--brand, #6E8B74)' }}
          >
            {t('+ New Campaign')}
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-zinc-200">
          <p className="text-zinc-500 text-sm">{t('No campaigns match your filters')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((c) => {
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
                    <p className="text-xs text-zinc-400 mt-1">
                      <span className="text-zinc-500">{t('Campaign due date')}:</span> {formatDate(c.campaign_date, locale)}
                    </p>
                    {c.created_by_name && (
                      <p className="text-xs text-zinc-400 mt-0.5">
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
