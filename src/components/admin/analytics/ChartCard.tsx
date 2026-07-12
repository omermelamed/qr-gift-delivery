'use client'

import type { ReactNode } from 'react'
import { useT } from '@/lib/i18n/useT'
import type { AnalyticsFilter, DateRangePreset, StatusFilter } from '@/lib/analytics/filterCampaigns'

const DATE_RANGE_OPTIONS: DateRangePreset[] = ['all', 'month', 'quarter', 'year']
const STATUS_OPTIONS: StatusFilter[] = ['all', 'draft', 'active', 'closed']

const DATE_LABEL: Record<DateRangePreset, string> = {
  all: 'All time',
  month: 'Last month',
  quarter: 'Last 3 months',
  year: 'This year',
}
const STATUS_LABEL: Record<StatusFilter, string> = {
  all: 'All statuses',
  draft: 'Draft',
  active: 'Active',
  closed: 'Closed',
}

const CHIP_SELECT_CLASS =
  'rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-600 focus:outline-none focus:border-brand'

export function FilterChips({ filter, onFilterChange }: { filter: AnalyticsFilter; onFilterChange: (next: AnalyticsFilter) => void }) {
  const t = useT()
  return (
    <>
      <select
        className={CHIP_SELECT_CLASS}
        value={filter.dateRange}
        onChange={(e) => onFilterChange({ ...filter, dateRange: e.target.value as DateRangePreset })}
      >
        {DATE_RANGE_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>{t(DATE_LABEL[opt])}</option>
        ))}
      </select>
      <input
        type="text"
        placeholder={t('Search campaign…')}
        className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-700 focus:outline-none focus:border-brand"
        value={filter.campaignName}
        onChange={(e) => onFilterChange({ ...filter, campaignName: e.target.value })}
      />
      <select
        className={CHIP_SELECT_CLASS}
        value={filter.status}
        onChange={(e) => onFilterChange({ ...filter, status: e.target.value as StatusFilter })}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>{t(STATUS_LABEL[opt])}</option>
        ))}
      </select>
    </>
  )
}

type ChartCardProps = {
  title: string
  subtitle: string
  children: ReactNode
  showFilters: boolean
  filter: AnalyticsFilter
  onFilterChange: (next: AnalyticsFilter) => void
  className?: string
}

export function ChartCard({ title, subtitle, children, showFilters, filter, onFilterChange, className = '' }: ChartCardProps) {
  return (
    <div className={`card flex flex-col p-5 ${className}`}>
      <div>
        <h3 className="text-sm font-bold text-zinc-900">{title}</h3>
        <p className="mt-0.5 text-xs text-zinc-400">{subtitle}</p>
      </div>
      <div className="mt-3.5 flex-1">{children}</div>
      {showFilters && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-dashed border-zinc-200 pt-3">
          <FilterChips filter={filter} onFilterChange={onFilterChange} />
        </div>
      )}
    </div>
  )
}
