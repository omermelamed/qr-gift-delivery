# Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add company-wide summary stats to the admin dashboard and per-campaign department breakdown, distributor stats, and an export CSV button to the campaign detail page.

**Architecture:** All data is queried server-side using the existing Supabase service client. No new API routes needed — data is derived from existing `gift_tokens` and `campaigns` tables. New React components are added to the campaign detail bento grid.

**Tech Stack:** Next.js 15 App Router (server components), Supabase service role client, Tailwind CSS.

---

## File Map

- **Modify:** `src/app/admin/page.tsx` — add summary stats bar above campaign list
- **Create:** `src/components/admin/DepartmentBreakdown.tsx` — department breakdown card (server component)
- **Create:** `src/components/admin/DistributorStats.tsx` — distributor stats card (server component)
- **Modify:** `src/app/admin/campaigns/[id]/page.tsx` — add new cards to bento grid + export button

---

### Task 1: Summary stats bar on `/admin`

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Compute summary stats in the server component**

In `src/app/admin/page.tsx`, after the existing `statsMap` loop, add:

```typescript
const totalCampaigns = list.length
const totalGifts = [...statsMap.values()].reduce((s, v) => s + v.total, 0)
const totalRedeemed = [...statsMap.values()].reduce((s, v) => s + v.redeemed, 0)
const totalUnredeemed = totalGifts - totalRedeemed
const overallPct = totalGifts > 0 ? Math.round((totalRedeemed / totalGifts) * 100) : 0
```

- [ ] **Step 2: Render the stats bar**

Replace the existing heading block:
```tsx
<div className="flex items-center justify-between mb-8">
  <div>
    <h1 className="text-2xl font-bold text-zinc-900">Campaigns</h1>
    <p className="text-sm text-zinc-500 mt-0.5">{list.length} total</p>
  </div>
  <Link ...>+ New Campaign</Link>
</div>
```

With:
```tsx
<div className="flex items-center justify-between mb-6">
  <h1 className="text-2xl font-bold text-zinc-900">Campaigns</h1>
  <Link
    href="/admin/campaigns/new"
    className="text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
    style={{ backgroundColor: 'var(--brand, #6366f1)' }}
  >
    + New Campaign
  </Link>
</div>

{list.length > 0 && (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
    {[
      { label: 'Campaigns', value: totalCampaigns },
      { label: 'Gifts Sent', value: totalGifts },
      { label: 'Redeemed', value: `${totalRedeemed} (${overallPct}%)` },
      { label: 'Unredeemed', value: totalUnredeemed },
    ].map(({ label, value }) => (
      <div key={label} className="bg-white border border-zinc-200 rounded-xl p-4">
        <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-zinc-900 mt-1">{value}</p>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 3: Verify in browser**

Navigate to `/admin`. With campaigns present, four stat cards should appear above the campaign list.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: add summary stats bar to admin campaigns dashboard"
```

---

### Task 2: Department breakdown card

**Files:**
- Create: `src/components/admin/DepartmentBreakdown.tsx`
- Modify: `src/app/admin/campaigns/[id]/page.tsx`

- [ ] **Step 1: Create the DepartmentBreakdown server component**

Create `src/components/admin/DepartmentBreakdown.tsx`:

```tsx
import { createServiceClient } from '@/lib/supabase/server'

type Props = { campaignId: string }

export async function DepartmentBreakdown({ campaignId }: Props) {
  const service = createServiceClient()

  const { data: tokens } = await service
    .from('gift_tokens')
    .select('department, redeemed')
    .eq('campaign_id', campaignId)

  if (!tokens || tokens.length === 0) return null

  // Group by department
  const map = new Map<string, { total: number; claimed: number }>()
  for (const t of tokens) {
    const key = t.department ?? '(No department)'
    if (!map.has(key)) map.set(key, { total: 0, claimed: 0 })
    const s = map.get(key)!
    s.total++
    if (t.redeemed) s.claimed++
  }

  // Only render if there's more than one department (otherwise breakdown adds no value)
  if (map.size <= 1) return null

  const rows = [...map.entries()]
    .map(([dept, s]) => ({ dept, ...s, pct: Math.round((s.claimed / s.total) * 100) }))
    .sort((a, b) => b.total - a.total)

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h2 className="font-semibold text-zinc-900 mb-4">By Department</h2>
      <div className="flex flex-col gap-3">
        {rows.map(({ dept, claimed, total, pct }) => (
          <div key={dept}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-zinc-700 font-medium truncate">{dept}</span>
              <span className="text-zinc-400 text-xs flex-shrink-0 ml-2">{claimed}/{total} · {pct}%</span>
            </div>
            <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: 'var(--brand, #6366f1)' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add to campaign detail page**

In `src/app/admin/campaigns/[id]/page.tsx`, add the import:
```tsx
import { DepartmentBreakdown } from '@/components/admin/DepartmentBreakdown'
```

In the running/closed layout (after the EmployeeTable div), add a third row spanning 2 cols:
```tsx
{/* Row 3: Department breakdown (2 cols) */}
<div className="lg:col-span-2">
  <DepartmentBreakdown campaignId={campaign.id} />
</div>
```

Also add it to the draft layout after the employee table div:
```tsx
<div className="lg:col-span-2">
  <DepartmentBreakdown campaignId={campaign.id} />
</div>
```

- [ ] **Step 3: Verify**

Open a campaign with tokens that have different departments set. The breakdown card should appear below the employee table. If all tokens have the same department (or no departments), the card is hidden.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/DepartmentBreakdown.tsx src/app/admin/campaigns/[id]/page.tsx
git commit -m "feat: add department breakdown card to campaign detail page"
```

---

### Task 3: Distributor stats card

**Files:**
- Create: `src/components/admin/DistributorStats.tsx`
- Modify: `src/app/admin/campaigns/[id]/page.tsx`

- [ ] **Step 1: Create the DistributorStats server component**

Create `src/components/admin/DistributorStats.tsx`:

```tsx
import { createServiceClient } from '@/lib/supabase/server'

type Props = { campaignId: string; total: number }

export async function DistributorStats({ campaignId, total }: Props) {
  const service = createServiceClient()

  const { data: tokens } = await service
    .from('gift_tokens')
    .select('redeemed_by')
    .eq('campaign_id', campaignId)
    .eq('redeemed', true)
    .not('redeemed_by', 'is', null)

  if (!tokens || tokens.length === 0) return null

  // Count per distributor
  const countMap = new Map<string, number>()
  for (const t of tokens) {
    if (!t.redeemed_by) continue
    countMap.set(t.redeemed_by, (countMap.get(t.redeemed_by) ?? 0) + 1)
  }

  if (countMap.size === 0) return null

  // Fetch user display names
  const rows = await Promise.all(
    [...countMap.entries()].map(async ([userId, count]) => {
      const result = await service.auth.admin.getUserById(userId)
      const u = result.data?.user
      const name = u?.user_metadata?.full_name ?? u?.email?.split('@')[0] ?? userId
      return { userId, name, count }
    })
  )

  rows.sort((a, b) => b.count - a.count)

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h2 className="font-semibold text-zinc-900 mb-4">Distributor Stats</h2>
      <div className="flex flex-col gap-2">
        {rows.map(({ userId, name, count }) => (
          <div key={userId} className="flex items-center justify-between text-sm">
            <span className="text-zinc-700 truncate">{name}</span>
            <span className="text-zinc-500 flex-shrink-0 ml-2">
              {count} gift{count !== 1 ? 's' : ''} · {total > 0 ? Math.round((count / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add to campaign detail page**

Add the import in `src/app/admin/campaigns/[id]/page.tsx`:
```tsx
import { DistributorStats } from '@/components/admin/DistributorStats'
```

In the running/closed layout, add below the Notes card (right column):
```tsx
{/* Distributor stats — right column below Notes */}
<div>
  <DistributorStats campaignId={campaign.id} total={claimedCount} />
</div>
```

- [ ] **Step 3: Verify**

Open a running campaign where some tokens have been redeemed. The distributor stats card should appear in the right column below notes, showing each distributor's name and count.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/DistributorStats.tsx src/app/admin/campaigns/[id]/page.tsx
git commit -m "feat: add distributor stats card to campaign detail page"
```

---

### Task 4: Export CSV button

**Files:**
- Modify: `src/app/admin/campaigns/[id]/page.tsx`

- [ ] **Step 1: Add export button to the campaign detail header**

In `src/app/admin/campaigns/[id]/page.tsx`, find the header buttons section:
```tsx
<div className="flex items-center gap-3 flex-shrink-0">
  <StatusBadge sentAt={campaign.sent_at} closedAt={campaign.closed_at} />
  {isDraft && <DeleteCampaignButton campaignId={campaign.id} redirectAfter />}
  {campaign.sent_at && (
    <Link
      href={`/admin/campaigns/${campaign.id}/qr`}
      ...
    >
      View QR Codes
    </Link>
  )}
  {canClose && <CloseCampaignButton campaignId={campaign.id} />}
  {canLaunch && (
    <LaunchButton campaignId={campaign.id} employeeCount={allTokens.length} />
  )}
</div>
```

Add an Export CSV link after the View QR Codes link:
```tsx
{campaign.sent_at && (
  <a
    href={`/api/campaigns/${campaign.id}/export`}
    download
    className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
  >
    Export CSV
  </a>
)}
```

- [ ] **Step 2: Verify**

Open a running or closed campaign. An "Export CSV" button should appear in the header. Clicking it should download a CSV file named `campaign-<id>.csv`.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/campaigns/[id]/page.tsx
git commit -m "feat: add Export CSV button to campaign detail header"
```
