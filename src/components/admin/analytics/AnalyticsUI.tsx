'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/useT'
import { filterCampaigns, type AnalyticsFilter, type CampaignRow } from '@/lib/analytics/filterCampaigns'
import { redemptionRateByCampaign, campaignVolumeByMonth, departmentEngagement, rsvpVsRedemption, type TokenRow } from '@/lib/analytics/aggregate'
import { ChartCard, FilterChips } from './ChartCard'
import { RedemptionRateChart } from './RedemptionRateChart'
import { CampaignVolumeChart } from './CampaignVolumeChart'
import { DepartmentEngagementChart } from './DepartmentEngagementChart'
import { RsvpVsRedemptionChart } from './RsvpVsRedemptionChart'

const DEFAULT_FILTER: AnalyticsFilter = { dateRange: 'all', campaignName: '', status: 'all' }
const CHART_IDS = ['rate', 'volume', 'dept', 'rsvp'] as const
type ChartId = (typeof CHART_IDS)[number]

type Props = { campaigns: CampaignRow[]; tokens: TokenRow[] }

export function AnalyticsUI({ campaigns, tokens }: Props) {
  const t = useT()
  const [synced, setSynced] = useState(true)
  const [globalFilter, setGlobalFilter] = useState<AnalyticsFilter>(DEFAULT_FILTER)
  const [perChartFilter, setPerChartFilter] = useState<Record<ChartId, AnalyticsFilter>>({
    rate: DEFAULT_FILTER,
    volume: DEFAULT_FILTER,
    dept: DEFAULT_FILTER,
    rsvp: DEFAULT_FILTER,
  })

  function filterFor(id: ChartId): AnalyticsFilter {
    return synced ? globalFilter : perChartFilter[id]
  }

  function setFilterFor(id: ChartId, next: AnalyticsFilter) {
    if (synced) {
      setGlobalFilter(next)
    } else {
      setPerChartFilter((prev) => ({ ...prev, [id]: next }))
    }
  }

  function toggleSynced() {
    setSynced((prev) => {
      const next = !prev
      // Snap every chart to the current global value on every toggle, in both
      // directions: turning sync back on re-syncs everyone to globalFilter,
      // and turning sync off seeds each chart's independent filter with what
      // synced mode was just showing, instead of leaving stale values behind.
      setPerChartFilter({ rate: globalFilter, volume: globalFilter, dept: globalFilter, rsvp: globalFilter })
      return next
    })
  }

  const rateData = redemptionRateByCampaign(filterCampaigns(campaigns, filterFor('rate')), tokens)
  const volumeData = campaignVolumeByMonth(filterCampaigns(campaigns, filterFor('volume')))
  const deptData = departmentEngagement(filterCampaigns(campaigns, filterFor('dept')), tokens)
  const rsvpData = rsvpVsRedemption(filterCampaigns(campaigns, filterFor('rsvp')), tokens)

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-zinc-900">{t('Analytics')}</h1>
        <p className="mt-1 text-sm text-zinc-500">{t('Across all campaigns for your company')}</p>
      </div>

      <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5">
        <button
          type="button"
          role="switch"
          aria-checked={synced}
          onClick={toggleSynced}
          className={`relative h-[22px] w-[38px] flex-shrink-0 rounded-full transition-colors ${synced ? 'bg-brand' : 'bg-zinc-300'}`}
        >
          <span
            className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-transform rtl:end-0.5 ${
              synced ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-0.5 rtl:translate-x-0'
            }`}
          />
        </button>
        <div>
          <p className="text-sm font-bold text-zinc-900">{t('Sync filters across charts')}</p>
          <p className="text-xs text-zinc-500">
            {synced ? t('One filter set controls every chart') : t('Each chart keeps its own filters')}
          </p>
        </div>
      </div>

      {synced && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{t('Filters')}</span>
          <FilterChips filter={globalFilter} onFilterChange={setGlobalFilter} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ChartCard
          title={t('Redemption rate per campaign')}
          subtitle={t('% of gifts claimed, most recent first')}
          showFilters={!synced}
          filter={filterFor('rate')}
          onFilterChange={(f) => setFilterFor('rate', f)}
          className="lg:col-span-2"
        >
          <RedemptionRateChart data={rateData} />
        </ChartCard>

        <ChartCard
          title={t('Campaign volume over time')}
          subtitle={t('Campaigns launched per month')}
          showFilters={!synced}
          filter={filterFor('volume')}
          onFilterChange={(f) => setFilterFor('volume', f)}
        >
          <CampaignVolumeChart data={volumeData} />
        </ChartCard>

        <ChartCard
          title={t('Department engagement')}
          subtitle={t('Redemption rate by department, all campaigns')}
          showFilters={!synced}
          filter={filterFor('dept')}
          onFilterChange={(f) => setFilterFor('dept', f)}
        >
          <DepartmentEngagementChart data={deptData} />
        </ChartCard>

        <ChartCard
          title={t('RSVP vs. actual redemption')}
          subtitle={t('Confirmed attending vs. gifts actually redeemed — campaigns using arrival certificates only')}
          showFilters={!synced}
          filter={filterFor('rsvp')}
          onFilterChange={(f) => setFilterFor('rsvp', f)}
          className="lg:col-span-2"
        >
          <RsvpVsRedemptionChart data={rsvpData} />
        </ChartCard>
      </div>
    </div>
  )
}
