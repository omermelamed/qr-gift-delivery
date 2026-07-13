import { describe, it, expect } from 'vitest'
import { filterCampaigns, campaignStatus, type CampaignRow } from '@/lib/analytics/filterCampaigns'

const campaigns: CampaignRow[] = [
  { id: '1', name: 'Holiday 2026', campaign_date: '2026-07-01', sent_at: '2026-07-01T09:00:00Z', closed_at: '2026-07-05T00:00:00Z', created_at: '2026-06-20T00:00:00Z' },
  { id: '2', name: 'Onboarding Q3', campaign_date: null, sent_at: '2026-06-01T09:00:00Z', closed_at: null, created_at: '2026-05-20T00:00:00Z' },
  { id: '3', name: 'Draft Retreat', campaign_date: null, sent_at: null, closed_at: null, created_at: '2026-07-10T00:00:00Z' },
  { id: '4', name: 'Old Welcome Bash', campaign_date: '2025-01-15', sent_at: '2025-01-15T09:00:00Z', closed_at: '2025-01-20T00:00:00Z', created_at: '2025-01-10T00:00:00Z' },
]

describe('campaignStatus', () => {
  it('is closed when closed_at is set', () => {
    expect(campaignStatus({ sent_at: '2026-01-01T00:00:00Z', closed_at: '2026-01-02T00:00:00Z' })).toBe('closed')
  })
  it('is active when sent but not closed', () => {
    expect(campaignStatus({ sent_at: '2026-01-01T00:00:00Z', closed_at: null })).toBe('active')
  })
  it('is draft when never sent', () => {
    expect(campaignStatus({ sent_at: null, closed_at: null })).toBe('draft')
  })
})

describe('filterCampaigns', () => {
  it('returns everything when the filter is empty', () => {
    const result = filterCampaigns(campaigns, { dateFrom: '', dateTo: '', campaignName: '', status: 'all' })
    expect(result.map((c) => c.id)).toEqual(['1', '2', '3', '4'])
  })

  it('filters by status', () => {
    const result = filterCampaigns(campaigns, { dateFrom: '', dateTo: '', campaignName: '', status: 'draft' })
    expect(result.map((c) => c.id)).toEqual(['3'])
  })

  it('filters by campaign name, case-insensitive substring', () => {
    const result = filterCampaigns(campaigns, { dateFrom: '', dateTo: '', campaignName: 'welcome', status: 'all' })
    expect(result.map((c) => c.id)).toEqual(['4'])
  })

  it('filters by date range using campaign_date, falling back to sent_at then created_at', () => {
    // 2026-06-12 through 2026-07-12. Only campaign 1 (2026-07-01) and campaign 3
    // (created 2026-07-10, no campaign_date/sent_at) fall inside that window.
    const result = filterCampaigns(campaigns, { dateFrom: '2026-06-12', dateTo: '2026-07-12', campaignName: '', status: 'all' })
    expect(result.map((c) => c.id).sort()).toEqual(['1', '3'])
  })

  it('excludes campaigns older than a year', () => {
    const result = filterCampaigns(campaigns, { dateFrom: '2025-07-12', dateTo: '', campaignName: '', status: 'all' })
    expect(result.map((c) => c.id)).not.toContain('4')
  })

  it('combines multiple filters (AND, not OR)', () => {
    const result = filterCampaigns(campaigns, { dateFrom: '', dateTo: '', campaignName: 'onboarding', status: 'active' })
    expect(result.map((c) => c.id)).toEqual(['2'])
  })
})
