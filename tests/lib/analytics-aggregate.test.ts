import { describe, it, expect } from 'vitest'
import type { CampaignRow } from '@/lib/analytics/filterCampaigns'
import {
  redemptionRateByCampaign,
  campaignVolumeByMonth,
  departmentEngagement,
  rsvpVsRedemption,
  type TokenRow,
} from '@/lib/analytics/aggregate'

const campaigns: CampaignRow[] = [
  { id: 'c1', name: 'Holiday 2026', campaign_date: '2026-07-01', sent_at: '2026-07-01T09:00:00Z', closed_at: null, created_at: '2026-06-20T00:00:00Z' },
  { id: 'c2', name: 'Onboarding Q3', campaign_date: '2026-06-01', sent_at: '2026-06-01T09:00:00Z', closed_at: null, created_at: '2026-05-20T00:00:00Z' },
]

const tokens: TokenRow[] = [
  { campaign_id: 'c1', redeemed: true, department: 'Engineering', attending: true },
  { campaign_id: 'c1', redeemed: true, department: 'Engineering', attending: true },
  { campaign_id: 'c1', redeemed: false, department: 'Sales', attending: false },
  { campaign_id: 'c1', redeemed: false, department: 'Sales', attending: null },
  { campaign_id: 'c2', redeemed: true, department: 'Engineering', attending: null },
  { campaign_id: 'c2', redeemed: false, department: null, attending: null },
]

describe('redemptionRateByCampaign', () => {
  it('computes total/redeemed/rate per campaign, most recent first', () => {
    const result = redemptionRateByCampaign(campaigns, tokens)
    expect(result).toEqual([
      { campaignId: 'c1', name: 'Holiday 2026', total: 4, redeemed: 2, rate: 50 },
      { campaignId: 'c2', name: 'Onboarding Q3', total: 2, redeemed: 1, rate: 50 },
    ])
  })

  it('reports rate 0 for a campaign with no tokens', () => {
    const empty: CampaignRow = { id: 'c3', name: 'Empty', campaign_date: '2026-08-01', sent_at: null, closed_at: null, created_at: '2026-08-01T00:00:00Z' }
    const result = redemptionRateByCampaign([empty], [])
    expect(result).toEqual([{ campaignId: 'c3', name: 'Empty', total: 0, redeemed: 0, rate: 0 }])
  })
})

describe('campaignVolumeByMonth', () => {
  it('buckets campaigns by month of their effective date, sorted chronologically', () => {
    const result = campaignVolumeByMonth(campaigns)
    expect(result).toEqual([
      { month: '2026-06', count: 1 },
      { month: '2026-07', count: 1 },
    ])
  })
})

describe('departmentEngagement', () => {
  it('aggregates redemption rate per department across all filtered campaigns, sorted by rate desc', () => {
    const result = departmentEngagement(campaigns, tokens)
    // Engineering: 3 tokens, 3 redeemed -> 100%. Sales: 2 tokens, 0 redeemed -> 0%.
    // Tokens with a null department are excluded.
    expect(result).toEqual([
      { department: 'Engineering', total: 3, redeemed: 3, rate: 100 },
      { department: 'Sales', total: 2, redeemed: 0, rate: 0 },
    ])
  })
})

describe('rsvpVsRedemption', () => {
  it('includes only campaigns with at least one non-null attending value', () => {
    const result = rsvpVsRedemption(campaigns, tokens)
    // c1 has attending values (true/true/false/null) -> included.
    // c2's only token has attending: null -> excluded (no arrival-certificate data).
    expect(result).toEqual([{ campaignId: 'c1', name: 'Holiday 2026', attending: 2, redeemed: 2 }])
  })

  it('returns an empty array when no filtered campaign has arrival-certificate data', () => {
    const noAttendance: TokenRow[] = tokens.filter((t) => t.campaign_id === 'c2')
    const result = rsvpVsRedemption([campaigns[1]], noAttendance)
    expect(result).toEqual([])
  })
})
