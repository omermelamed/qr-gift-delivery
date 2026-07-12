import { effectiveDate, type CampaignRow } from './filterCampaigns'

export type TokenRow = {
  campaign_id: string
  redeemed: boolean
  redeemed_at: string | null
  sms_sent_at: string | null
  department: string | null
  attending: boolean | null
}

function rate(redeemed: number, total: number): number {
  return total === 0 ? 0 : Math.round((redeemed / total) * 100)
}

export type RedemptionRatePoint = { campaignId: string; name: string; total: number; redeemed: number; rate: number }

export function redemptionRateByCampaign(campaigns: CampaignRow[], tokens: TokenRow[]): RedemptionRatePoint[] {
  const sorted = [...campaigns].sort((a, b) => effectiveDate(b).localeCompare(effectiveDate(a)))
  return sorted.map((c) => {
    const campaignTokens = tokens.filter((t) => t.campaign_id === c.id)
    const redeemed = campaignTokens.filter((t) => t.redeemed).length
    const total = campaignTokens.length
    return { campaignId: c.id, name: c.name, total, redeemed, rate: rate(redeemed, total) }
  })
}

export type VolumePoint = { month: string; count: number }

export function campaignVolumeByMonth(campaigns: CampaignRow[]): VolumePoint[] {
  const counts = new Map<string, number>()
  for (const c of campaigns) {
    const month = effectiveDate(c).slice(0, 7)
    counts.set(month, (counts.get(month) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({ month, count }))
}

export type DepartmentPoint = { department: string; total: number; redeemed: number; rate: number }

export function departmentEngagement(campaigns: CampaignRow[], tokens: TokenRow[]): DepartmentPoint[] {
  const campaignIds = new Set(campaigns.map((c) => c.id))
  const byDept = new Map<string, { total: number; redeemed: number }>()
  for (const t of tokens) {
    if (!t.department || !campaignIds.has(t.campaign_id)) continue
    const entry = byDept.get(t.department) ?? { total: 0, redeemed: 0 }
    entry.total++
    if (t.redeemed) entry.redeemed++
    byDept.set(t.department, entry)
  }
  return [...byDept.entries()]
    .map(([department, { total, redeemed }]) => ({ department, total, redeemed, rate: rate(redeemed, total) }))
    .sort((a, b) => b.rate - a.rate)
}

export type RsvpPoint = { campaignId: string; name: string; attending: number; redeemed: number }

export function rsvpVsRedemption(campaigns: CampaignRow[], tokens: TokenRow[]): RsvpPoint[] {
  const sorted = [...campaigns].sort((a, b) => effectiveDate(b).localeCompare(effectiveDate(a)))
  const points: RsvpPoint[] = []
  for (const c of sorted) {
    const campaignTokens = tokens.filter((t) => t.campaign_id === c.id)
    const usesArrivalCertificates = campaignTokens.some((t) => t.attending !== null)
    if (!usesArrivalCertificates) continue
    points.push({
      campaignId: c.id,
      name: c.name,
      attending: campaignTokens.filter((t) => t.attending === true).length,
      redeemed: campaignTokens.filter((t) => t.redeemed).length,
    })
  }
  return points
}
