export type CampaignRow = {
  id: string
  name: string
  campaign_date: string | null
  sent_at: string | null
  closed_at: string | null
  created_at: string
}

export type StatusFilter = 'all' | 'draft' | 'active' | 'closed'

export type AnalyticsFilter = {
  dateFrom: string
  dateTo: string
  campaignName: string
  status: StatusFilter
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

export function filterCampaigns(campaigns: CampaignRow[], filter: AnalyticsFilter): CampaignRow[] {
  const name = filter.campaignName.trim().toLowerCase()

  return campaigns.filter((c) => {
    if (filter.status !== 'all' && campaignStatus(c) !== filter.status) return false
    if (name && !c.name.toLowerCase().includes(name)) return false
    const date = effectiveDate(c).slice(0, 10)
    if (filter.dateFrom && date < filter.dateFrom) return false
    if (filter.dateTo && date > filter.dateTo) return false
    return true
  })
}
