# Company-wide Analytics Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/admin/analytics` page with four cross-campaign charts (redemption rate per campaign, campaign volume over time, department engagement, RSVP vs. actual redemption), filterable either as one synced set or independently per chart.

**Architecture:** A Server Component (`page.tsx`) fetches the company's full, unfiltered `campaigns` and `gift_tokens` rows once (service-role client, manually scoped to `company_id` — this codebase's established `/admin` pattern, not RLS) and hands them to a client component. The client component owns filter state and a synced/independent toggle; on every render it filters the raw campaigns with a pure `filterCampaigns` function and feeds the result into one pure aggregation function per chart, each producing the plain data array its Recharts wrapper renders.

**Tech Stack:** Next.js App Router, React, Recharts (new dependency), Tailwind (existing `zinc` neutral scale + `--brand`/`--color-secondary`/`--color-accent` design tokens), Vitest.

## Global Constraints

- No schema changes — every chart is backed by existing `campaigns`/`gift_tokens` columns.
- Chart-type switching is explicitly out of scope; each chart has one fixed visualization.
- Filter state lives in client component state, not URL search params.
- Date filter is preset buckets (All time / Last month / Last 3 months / This year), not an arbitrary date-range picker.
- Campaign filter is free-text substring search, not a dropdown.
- RSVP chart excludes campaigns with no arrival-certificate data (no token with `attending IS NOT NULL`).
- Unit tests only for the two pure `src/lib/analytics/*` files — no component-level tests (matches the approved spec's testing scope).
- Recharts does not auto-mirror for RTL; chart geometry stays LTR in both locales for v1 (text/labels still translate).
- Follow this codebase's existing `zinc` neutral Tailwind scale and `.card` styling for anything visual — do not invent new colors.

---

## Task 1: Add Recharts dependency

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: the `recharts` package, importable as `from 'recharts'` in later tasks.

- [ ] **Step 1: Install the dependency**

Run: `npm install recharts`

- [ ] **Step 2: Verify it installed cleanly**

Run: `npm run build`
Expected: build succeeds (recharts isn't used anywhere yet, so this just confirms the install didn't break anything).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(analytics): add recharts dependency"
```

---

## Task 2: `filterCampaigns` — pure filtering logic

**Files:**
- Create: `src/lib/analytics/filterCampaigns.ts`
- Test: `tests/lib/analytics-filter.test.ts`

**Interfaces:**
- Produces:
  - `type CampaignRow = { id: string; name: string; campaign_date: string | null; sent_at: string | null; closed_at: string | null; created_at: string }`
  - `type DateRangePreset = 'all' | 'month' | 'quarter' | 'year'`
  - `type StatusFilter = 'all' | 'draft' | 'active' | 'closed'`
  - `type AnalyticsFilter = { dateRange: DateRangePreset; campaignName: string; status: StatusFilter }`
  - `campaignStatus(c: Pick<CampaignRow, 'sent_at' | 'closed_at'>): 'draft' | 'active' | 'closed'`
  - `effectiveDate(c: CampaignRow): string` — `campaign_date ?? sent_at ?? created_at`
  - `filterCampaigns(campaigns: CampaignRow[], filter: AnalyticsFilter, now?: Date): CampaignRow[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/analytics-filter.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { filterCampaigns, campaignStatus, type CampaignRow } from '@/lib/analytics/filterCampaigns'

const NOW = new Date('2026-07-12T00:00:00Z')

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
  it('returns everything when the filter is all/empty/all', () => {
    const result = filterCampaigns(campaigns, { dateRange: 'all', campaignName: '', status: 'all' }, NOW)
    expect(result.map((c) => c.id)).toEqual(['1', '2', '3', '4'])
  })

  it('filters by status', () => {
    const result = filterCampaigns(campaigns, { dateRange: 'all', campaignName: '', status: 'draft' }, NOW)
    expect(result.map((c) => c.id)).toEqual(['3'])
  })

  it('filters by campaign name, case-insensitive substring', () => {
    const result = filterCampaigns(campaigns, { dateRange: 'all', campaignName: 'welcome', status: 'all' }, NOW)
    expect(result.map((c) => c.id)).toEqual(['4'])
  })

  it('filters by date range using campaign_date, falling back to sent_at then created_at', () => {
    // "month" = last 30 days from NOW (2026-07-12). Only campaign 1 (2026-07-01) and
    // campaign 3 (created 2026-07-10, no campaign_date/sent_at) fall inside that window.
    const result = filterCampaigns(campaigns, { dateRange: 'month', campaignName: '', status: 'all' }, NOW)
    expect(result.map((c) => c.id).sort()).toEqual(['1', '3'])
  })

  it('excludes campaigns older than a year', () => {
    const result = filterCampaigns(campaigns, { dateRange: 'year', campaignName: '', status: 'all' }, NOW)
    expect(result.map((c) => c.id)).not.toContain('4')
  })

  it('combines multiple filters (AND, not OR)', () => {
    const result = filterCampaigns(campaigns, { dateRange: 'all', campaignName: 'onboarding', status: 'active' }, NOW)
    expect(result.map((c) => c.id)).toEqual(['2'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/analytics-filter.test.ts`
Expected: FAIL — `Cannot find module '@/lib/analytics/filterCampaigns'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/analytics/filterCampaigns.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/analytics-filter.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/filterCampaigns.ts tests/lib/analytics-filter.test.ts
git commit -m "feat(analytics): add filterCampaigns pure function"
```

---

## Task 3: Aggregation functions — one per chart

**Files:**
- Create: `src/lib/analytics/aggregate.ts`
- Test: `tests/lib/analytics-aggregate.test.ts`

**Interfaces:**
- Consumes: `CampaignRow`, `effectiveDate` from `@/lib/analytics/filterCampaigns` (Task 2).
- Produces:
  - `type TokenRow = { campaign_id: string; redeemed: boolean; redeemed_at: string | null; sms_sent_at: string | null; department: string | null; attending: boolean | null }`
  - `type RedemptionRatePoint = { campaignId: string; name: string; total: number; redeemed: number; rate: number }`
  - `redemptionRateByCampaign(campaigns: CampaignRow[], tokens: TokenRow[]): RedemptionRatePoint[]`
  - `type VolumePoint = { month: string; count: number }`
  - `campaignVolumeByMonth(campaigns: CampaignRow[]): VolumePoint[]`
  - `type DepartmentPoint = { department: string; total: number; redeemed: number; rate: number }`
  - `departmentEngagement(campaigns: CampaignRow[], tokens: TokenRow[]): DepartmentPoint[]`
  - `type RsvpPoint = { campaignId: string; name: string; attending: number; redeemed: number }`
  - `rsvpVsRedemption(campaigns: CampaignRow[], tokens: TokenRow[]): RsvpPoint[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/analytics-aggregate.test.ts`:

```typescript
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
  { campaign_id: 'c1', redeemed: true, redeemed_at: '2026-07-01T10:00:00Z', sms_sent_at: '2026-07-01T09:00:00Z', department: 'Engineering', attending: true },
  { campaign_id: 'c1', redeemed: true, redeemed_at: '2026-07-01T11:00:00Z', sms_sent_at: '2026-07-01T09:00:00Z', department: 'Engineering', attending: true },
  { campaign_id: 'c1', redeemed: false, redeemed_at: null, sms_sent_at: '2026-07-01T09:00:00Z', department: 'Sales', attending: false },
  { campaign_id: 'c1', redeemed: false, redeemed_at: null, sms_sent_at: '2026-07-01T09:00:00Z', department: 'Sales', attending: null },
  { campaign_id: 'c2', redeemed: true, redeemed_at: '2026-06-01T10:00:00Z', sms_sent_at: '2026-06-01T09:00:00Z', department: 'Engineering', attending: null },
  { campaign_id: 'c2', redeemed: false, redeemed_at: null, sms_sent_at: '2026-06-01T09:00:00Z', department: null, attending: null },
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/analytics-aggregate.test.ts`
Expected: FAIL — `Cannot find module '@/lib/analytics/aggregate'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/analytics/aggregate.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/analytics-aggregate.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/analytics/aggregate.ts tests/lib/analytics-aggregate.test.ts
git commit -m "feat(analytics): add per-chart aggregation functions"
```

---

## Task 4: `ChartCard` shell + shared filter chips

**Files:**
- Create: `src/components/admin/analytics/ChartCard.tsx`

**Interfaces:**
- Consumes: `AnalyticsFilter`, `DateRangePreset`, `StatusFilter` from `@/lib/analytics/filterCampaigns` (Task 2).
- Produces:
  - `ChartCard(props: { title: string; subtitle: string; children: ReactNode; showFilters: boolean; filter: AnalyticsFilter; onFilterChange: (next: AnalyticsFilter) => void; className?: string }): JSX.Element`
  - `FilterChips(props: { filter: AnalyticsFilter; onFilterChange: (next: AnalyticsFilter) => void }): JSX.Element` (also exported — reused by `AnalyticsUI` for the global bar in Task 6).

- [ ] **Step 1: Write the component**

Create `src/components/admin/analytics/ChartCard.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds (the component isn't rendered anywhere yet, but TypeScript/Next will still type-check it as part of the build).

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/analytics/ChartCard.tsx
git commit -m "feat(analytics): add ChartCard shell and shared filter chips"
```

---

## Task 5: The four chart components

**Files:**
- Create: `src/components/admin/analytics/RedemptionRateChart.tsx`
- Create: `src/components/admin/analytics/CampaignVolumeChart.tsx`
- Create: `src/components/admin/analytics/DepartmentEngagementChart.tsx`
- Create: `src/components/admin/analytics/RsvpVsRedemptionChart.tsx`

**Interfaces:**
- Consumes: `RedemptionRatePoint`, `VolumePoint`, `DepartmentPoint`, `RsvpPoint` from `@/lib/analytics/aggregate` (Task 3).
- Produces:
  - `RedemptionRateChart(props: { data: RedemptionRatePoint[] }): JSX.Element`
  - `CampaignVolumeChart(props: { data: VolumePoint[] }): JSX.Element`
  - `DepartmentEngagementChart(props: { data: DepartmentPoint[] }): JSX.Element`
  - `RsvpVsRedemptionChart(props: { data: RsvpPoint[] }): JSX.Element`

- [ ] **Step 1: Write `RedemptionRateChart.tsx`**

```tsx
'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useT } from '@/lib/i18n/useT'
import type { RedemptionRatePoint } from '@/lib/analytics/aggregate'

export function RedemptionRateChart({ data }: { data: RedemptionRatePoint[] }) {
  const t = useT()
  if (data.length === 0) {
    return <p className="rounded-lg bg-zinc-50 px-3 py-6 text-center text-xs text-zinc-400">{t('No campaigns match these filters')}</p>
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="#EDE9E2" />
        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#888D89' }} />
        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 12, fill: '#2E312F' }} />
        <Tooltip formatter={(value: number) => [`${value}%`, t('Redeemed')]} />
        <Bar dataKey="rate" fill="#6E8B74" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 2: Write `CampaignVolumeChart.tsx`**

```tsx
'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useT } from '@/lib/i18n/useT'
import type { VolumePoint } from '@/lib/analytics/aggregate'

export function CampaignVolumeChart({ data }: { data: VolumePoint[] }) {
  const t = useT()
  if (data.length === 0) {
    return <p className="rounded-lg bg-zinc-50 px-3 py-6 text-center text-xs text-zinc-400">{t('No campaigns match these filters')}</p>
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="#EDE9E2" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#888D89' }} />
        <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11, fill: '#888D89' }} />
        <Tooltip formatter={(value: number) => [value, t('Campaigns')]} />
        <Bar dataKey="count" fill="#6E8B74" radius={[6, 6, 2, 2]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 3: Write `DepartmentEngagementChart.tsx`**

```tsx
'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useT } from '@/lib/i18n/useT'
import type { DepartmentPoint } from '@/lib/analytics/aggregate'

export function DepartmentEngagementChart({ data }: { data: DepartmentPoint[] }) {
  const t = useT()
  if (data.length === 0) {
    return <p className="rounded-lg bg-zinc-50 px-3 py-6 text-center text-xs text-zinc-400">{t('No campaigns match these filters')}</p>
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="#EDE9E2" />
        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#888D89' }} />
        <YAxis type="category" dataKey="department" width={120} tick={{ fontSize: 12, fill: '#2E312F' }} />
        <Tooltip formatter={(value: number) => [`${value}%`, t('Redeemed')]} />
        <Bar dataKey="rate" fill="#E8B86D" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 4: Write `RsvpVsRedemptionChart.tsx`**

```tsx
'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useT } from '@/lib/i18n/useT'
import type { RsvpPoint } from '@/lib/analytics/aggregate'

export function RsvpVsRedemptionChart({ data }: { data: RsvpPoint[] }) {
  const t = useT()
  if (data.length === 0) {
    return <p className="rounded-lg bg-zinc-50 px-3 py-6 text-center text-xs text-zinc-400">{t('No campaigns use arrival certificates in this range')}</p>
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 48)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="#EDE9E2" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#888D89' }} />
        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: '#2E312F' }} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="attending" name={t('Confirmed attending')} fill="#C76D4A" radius={[0, 4, 4, 0]} />
        <Bar dataKey="redeemed" name={t('Actually redeemed')} fill="#6E8B74" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/analytics/RedemptionRateChart.tsx src/components/admin/analytics/CampaignVolumeChart.tsx src/components/admin/analytics/DepartmentEngagementChart.tsx src/components/admin/analytics/RsvpVsRedemptionChart.tsx
git commit -m "feat(analytics): add the four Recharts chart components"
```

---

## Task 6: `AnalyticsUI` — filter state, sync toggle, wiring

**Files:**
- Create: `src/components/admin/analytics/AnalyticsUI.tsx`

**Interfaces:**
- Consumes:
  - `filterCampaigns`, `AnalyticsFilter`, `CampaignRow` from `@/lib/analytics/filterCampaigns` (Task 2)
  - `redemptionRateByCampaign`, `campaignVolumeByMonth`, `departmentEngagement`, `rsvpVsRedemption`, `TokenRow` from `@/lib/analytics/aggregate` (Task 3)
  - `ChartCard`, `FilterChips` from `./ChartCard` (Task 4)
  - The four chart components from Task 5
- Produces: `AnalyticsUI(props: { campaigns: CampaignRow[]; tokens: TokenRow[] }): JSX.Element` — consumed by `page.tsx` in Task 7.

- [ ] **Step 1: Write the component**

Create `src/components/admin/analytics/AnalyticsUI.tsx`:

```tsx
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
      if (next) {
        // Snap every chart back to the global values, discarding divergence.
        setPerChartFilter({ rate: globalFilter, volume: globalFilter, dept: globalFilter, rsvp: globalFilter })
      }
      return next
    })
  }

  const rateData = redemptionRateByCampaign(filterCampaigns(campaigns, filterFor('rate')), tokens)
  const volumeData = campaignVolumeByMonth(filterCampaigns(campaigns, filterFor('volume')))
  const deptData = departmentEngagement(filterCampaigns(campaigns, filterFor('dept')), tokens)
  const rsvpData = rsvpVsRedemption(filterCampaigns(campaigns, filterFor('rsvp')), tokens)

  return (
    <div>
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/analytics/AnalyticsUI.tsx
git commit -m "feat(analytics): add AnalyticsUI with sync toggle and filter wiring"
```

---

## Task 7: `/admin/analytics` page — data fetching

**Files:**
- Create: `src/app/admin/analytics/page.tsx`

**Interfaces:**
- Consumes: `AnalyticsUI` from `@/components/admin/analytics/AnalyticsUI` (Task 6); `resolveCompanyId` from `@/lib/platform-auth`; `createClient`, `createServiceClient` from `@/lib/supabase/server`; `JwtAppMetadata` from `@/types` — all pre-existing, same imports `src/app/admin/page.tsx` already uses.

- [ ] **Step 1: Write the page**

Create `src/app/admin/analytics/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'
import { AnalyticsUI } from '@/components/admin/analytics/AnalyticsUI'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const appMeta = user.app_metadata as JwtAppMetadata

  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) redirect('/login')

  const service = createServiceClient()
  const { data: campaigns, error: campaignsError } = await service
    .from('campaigns')
    .select('id, name, campaign_date, sent_at, closed_at, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (campaignsError) {
    return (
      <div className="p-6">
        <p className="text-sm font-medium text-red-600">Couldn&apos;t load analytics data. Please refresh the page.</p>
      </div>
    )
  }

  const list = campaigns ?? []

  const { data: tokens, error: tokensError } = list.length
    ? await service
        .from('gift_tokens')
        .select('campaign_id, redeemed, redeemed_at, sms_sent_at, department, attending')
        .in('campaign_id', list.map((c) => c.id))
    : { data: [], error: null }

  if (tokensError) {
    return (
      <div className="p-6">
        <p className="text-sm font-medium text-red-600">Couldn&apos;t load analytics data. Please refresh the page.</p>
      </div>
    )
  }

  if (list.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-zinc-900">Analytics</h1>
        <p className="mt-2 text-sm text-zinc-500">Run your first campaign to start seeing analytics here.</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-zinc-900">Analytics</h1>
        <p className="mt-1 text-sm text-zinc-500">Across all campaigns for your company</p>
      </div>
      <AnalyticsUI campaigns={list} tokens={tokens ?? []} />
    </div>
  )
}
```

- [ ] **Step 2: Verify it builds and the route exists**

Run: `npm run build`
Expected: build succeeds and lists `/admin/analytics` among the built routes.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/analytics/page.tsx
git commit -m "feat(analytics): add /admin/analytics page"
```

---

## Task 8: Sidebar nav entry

**Files:**
- Modify: `src/components/admin/Sidebar.tsx`

- [ ] **Step 1: Add the active-route check and nav item**

In `src/components/admin/Sidebar.tsx`, add alongside the existing `isCampaigns`/`isTeam`/etc. checks (near line 20-24):

```typescript
const isAnalytics = pathname.startsWith('/admin/analytics')
```

Then add a new entry to the `navItems` array, immediately after the `Campaigns` entry so it reads as a peer of the main campaigns view:

```typescript
{ href: '/admin/analytics', label: t('Analytics'), active: isAnalytics, icon: (
  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
)},
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manually confirm the nav link works**

Run: `npm run dev`, log in as a company admin, and click "Analytics" in the sidebar. Confirm it navigates to `/admin/analytics` and highlights as active. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/Sidebar.tsx
git commit -m "feat(analytics): add Analytics entry to the admin sidebar"
```

---

## Task 9: Hebrew translations

**Files:**
- Modify: `src/lib/i18n/translations.he.ts`

- [ ] **Step 1: Grep for each key first, to avoid duplicating anything that already exists**

Run:
```bash
grep -n "'Analytics'\|'Redeemed'\|'Filters'" src/lib/i18n/translations.he.ts
```
Expected: no matches for `'Analytics'` or `'Filters'`; `'Redeemed'` may already exist from the landing page — if so, reuse that entry rather than adding a duplicate key (duplicate object keys in `translations.he.ts` would silently let the later one win, which is exactly the kind of orphan/duplicate this codebase's own convention explicitly avoids).

- [ ] **Step 2: Add the new entries**

Add a new `// Analytics page` block to `src/lib/i18n/translations.he.ts` (near the other feature-grouped blocks, e.g. after the landing page block):

```typescript
  // Analytics page
  'Analytics': 'ניתוח נתונים',
  'Across all campaigns for your company': 'בכל הקמפיינים של החברה שלכם',
  "Couldn't load analytics data. Please refresh the page.": 'לא ניתן היה לטעון את נתוני הניתוח. נסו לרענן את הדף.',
  'Run your first campaign to start seeing analytics here.': 'הריצו את הקמפיין הראשון שלכם כדי להתחיל לראות כאן ניתוח נתונים.',
  'Sync filters across charts': 'סנכרון סינון בין כל הגרפים',
  'One filter set controls every chart': 'סט סינון אחד שולט על כל הגרפים',
  'Each chart keeps its own filters': 'לכל גרף יש סינון משלו',
  'Filters': 'סינון',
  'Search campaign…': 'חיפוש קמפיין…',
  'All time': 'כל הזמן',
  'Last month': 'החודש האחרון',
  'Last 3 months': '3 החודשים האחרונים',
  'This year': 'השנה',
  'All statuses': 'כל הסטטוסים',
  'Draft': 'טיוטה',
  'Active': 'פעיל',
  'Closed': 'סגור',
  'Redemption rate per campaign': 'שיעור מימוש לפי קמפיין',
  '% of gifts claimed, most recent first': 'אחוז המתנות שמומשו, החדש ביותר קודם',
  'Campaign volume over time': 'כמות קמפיינים לאורך זמן',
  'Campaigns launched per month': 'קמפיינים שהושקו בכל חודש',
  'Campaigns': 'קמפיינים',
  'Department engagement': 'מעורבות לפי מחלקה',
  'Redemption rate by department, all campaigns': 'שיעור מימוש לפי מחלקה, כל הקמפיינים',
  'RSVP vs. actual redemption': 'אישורי הגעה מול מימוש בפועל',
  'Confirmed attending vs. gifts actually redeemed — campaigns using arrival certificates only': 'אישרו הגעה מול מתנות שמומשו בפועל — קמפיינים עם אישורי הגעה בלבד',
  'Confirmed attending': 'אישרו הגעה',
  'Actually redeemed': 'מומשו בפועל',
  'No campaigns match these filters': 'אין קמפיינים התואמים לסינון זה',
  'No campaigns use arrival certificates in this range': 'אין קמפיינים עם אישורי הגעה בטווח זה',
```

Note: if the grep in Step 1 found an existing `'Redeemed'` entry, do not add it again here — the chart tooltip already reuses that key via `t('Redeemed')` in `RedemptionRateChart.tsx`/`DepartmentEngagementChart.tsx` (Task 5).

- [ ] **Step 3: Verify it builds and lints clean**

Run: `npm run build && npm run lint`
Expected: both succeed — this catches duplicate-key issues and any TypeScript problems from the new strings.

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/translations.he.ts
git commit -m "feat(analytics): add Hebrew translations for the analytics page"
```

---

## Task 10: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full lint and test suite**

Run: `npm run lint && npm test`
Expected: lint clean; all tests pass, including the 15 new tests from Tasks 2 and 3.

- [ ] **Step 2: Run a full production build**

Run: `npm run build`
Expected: succeeds, `/admin/analytics` listed among the routes.

- [ ] **Step 3: Manual check in both locales**

Run: `npm run dev`, log in as a company admin with at least one campaign that has redeemed tokens, and visit `/admin/analytics`. Confirm:
- All four charts render with real data.
- The sync toggle switches between the single top filter bar and per-card filter rows, and per-card values snap back to the global filter when re-synced.
- Changing the campaign-name search, date preset, and status filter each narrows the charts correctly.
- Switch to Hebrew via the language toggle: page mirrors to RTL, all new copy is translated, no layout breakage.
- If the company has zero campaigns using arrival certificates, the RSVP chart shows its distinct empty state rather than a blank chart.

Stop the dev server when done.

- [ ] **Step 4: Final commit if any fixes were needed during manual check**

If Step 3 surfaced any issues, fix them, re-run Steps 1-3, then:

```bash
git add -A
git commit -m "fix(analytics): address issues found in manual verification"
```

If nothing needed fixing, no commit is needed for this task.
