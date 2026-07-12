export type CampaignRow = {
  id: string
  name: string
  campaign_date: string | null
  sent_at: string | null
  closed_at: string | null
  created_at: string
}

export type DateRangePreset = 'all' | 'month' | 'quarter' | 'year'
export type StatusFilter = 'all' | 'draft' | 'active' | 'closed'

export type AnalyticsFilter = {
  dateRange: DateRangePreset
  campaignName: string
  status: StatusFilter
}

const DATE_RANGE_DAYS: Record<Exclude<DateRangePreset, 'all'>, number> = {
  month: 30,
  quarter: 90,
  year: 365,
}

/** Mirrors the derivation already used in AdminDashboardUI.tsx's campaigns list. */
export function campaignStatus(c: Pick<CampaignRow, 'sent_at' | 'closed_at'>): 'draft' | 'active' | 'closed' {
  if (c.closed_at) return 'closed'
  if (c.sent_at) return 'active'
  return 'draft'
}

/** The date a campaign is "about," for filtering/sorting/bucketing — the planned
 *  event date if one was set, otherwise when it was sent, otherwise when the
 *  draft was created. */
export function effectiveDate(c: CampaignRow): string {
  return c.campaign_date ?? c.sent_at ?? c.created_at
}

export function filterCampaigns(campaigns: CampaignRow[], filter: AnalyticsFilter, now: Date = new Date()): CampaignRow[] {
  const name = filter.campaignName.trim().toLowerCase()
  let cutoff: Date | null = null
  if (filter.dateRange !== 'all') {
    cutoff = new Date(now)
    cutoff.setDate(cutoff.getDate() - DATE_RANGE_DAYS[filter.dateRange])
  }

  return campaigns.filter((c) => {
    if (filter.status !== 'all' && campaignStatus(c) !== filter.status) return false
    if (name && !c.name.toLowerCase().includes(name)) return false
    if (cutoff && new Date(effectiveDate(c)) < cutoff) return false
    return true
  })
}
