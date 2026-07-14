'use client'

import type { ReactNode } from 'react'
import { useT } from '@/lib/i18n/useT'
import { StatusDropdown } from '@/components/admin/StatusDropdown'
import { DateRangeDropdown } from '@/components/admin/DateRangeDropdown'
import type { AnalyticsFilter } from '@/lib/analytics/filterCampaigns'

export function FilterChips({ filter, onFilterChange }: { filter: AnalyticsFilter; onFilterChange: (next: AnalyticsFilter) => void }) {
  const t = useT()
  return (
    <>
      <DateRangeDropdown
        from={filter.dateFrom}
        to={filter.dateTo}
        onFromChange={(v) => onFilterChange({ ...filter, dateFrom: v })}
        onToChange={(v) => onFilterChange({ ...filter, dateTo: v })}
      />
      <StatusDropdown
        value={filter.status}
        onChange={(v) => onFilterChange({ ...filter, status: v })}
      />
      <input
        type="text"
        placeholder={t('Search campaigns…')}
        className="input-field h-9 px-3 text-sm"
        value={filter.campaignName}
        onChange={(e) => onFilterChange({ ...filter, campaignName: e.target.value })}
        aria-label={t('Campaign name')}
      />
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
