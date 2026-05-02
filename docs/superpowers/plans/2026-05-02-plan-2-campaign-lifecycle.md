# Campaign Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reminder SMS button, scheduled send (with hourly cron), and wire up the duplicate button on the campaign detail page.

**Architecture:** One migration adds `scheduled_at` to campaigns. A new `/api/cron/send-scheduled` endpoint (protected by `CRON_SECRET`) is called hourly by Vercel Cron. The existing resend API is surfaced via a new `ReminderButton` client component. `DuplicateCampaignButton` already exists in the campaign list — it just needs to be added to the campaign detail header too.

**Tech Stack:** Next.js 15 App Router, Supabase service role, Vercel Cron (`vercel.json`).

---

## File Map

- **Create:** `supabase/migrations/20240502000015_campaign_scheduled_at.sql` — adds `scheduled_at` column
- **Modify:** `.github/workflows/migrate.yml` — add migration 015 to whitelist + idempotent patch
- **Modify:** `src/app/api/campaigns/route.ts` — accept `scheduledAt` in POST body
- **Modify:** `src/app/admin/campaigns/new/page.tsx` — add optional schedule picker
- **Modify:** `src/types/index.ts` — add `scheduled_at` to `Campaign` type
- **Create:** `src/components/admin/ReminderButton.tsx` — resend-to-unredeemed button with confirmation
- **Modify:** `src/app/admin/campaigns/[id]/page.tsx` — add ReminderButton + DuplicateCampaignButton to header; show scheduled badge
- **Create:** `src/app/api/cron/send-scheduled/route.ts` — cron endpoint
- **Create:** `vercel.json` — Vercel Cron config
- **Modify:** `src/app/admin/campaigns/[id]/page.tsx` — add DuplicateCampaignButton to header

---

### Task 1: Migration — add `scheduled_at` to campaigns

**Files:**
- Create: `supabase/migrations/20240502000015_campaign_scheduled_at.sql`
- Modify: `.github/workflows/migrate.yml`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/20240502000015_campaign_scheduled_at.sql`:
```sql
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
```

- [ ] **Step 2: Add to workflow whitelist and idempotent patch**

In `.github/workflows/migrate.yml`, in the DELETE whitelist add `'20240502000015'`:
```sql
          '20240502000015'
```

In the idempotent patch SQL block (after the existing patches), add:
```sql
          ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
```

- [ ] **Step 3: Update the Campaign type**

In `src/types/index.ts`, update the `Campaign` type:
```typescript
export type Campaign = {
  id: string
  company_id: string
  name: string
  campaign_date: string | null
  created_by: string | null
  created_at: string
  sent_at: string | null
  closed_at: string | null
  scheduled_at: string | null   // ← add this
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20240502000015_campaign_scheduled_at.sql .github/workflows/migrate.yml src/types/index.ts
git commit -m "feat: add scheduled_at column to campaigns"
```

---

### Task 2: Accept `scheduledAt` in campaign creation API

**Files:**
- Modify: `src/app/api/campaigns/route.ts`

- [ ] **Step 1: Update the POST handler**

In `src/app/api/campaigns/route.ts`, update the POST handler body parsing and insert:

```typescript
const body = await request.json().catch(() => ({}))
const { name, campaignDate, scheduledAt } = body

if (!name || typeof name !== 'string' || !name.trim()) {
  return NextResponse.json({ error: 'name is required' }, { status: 400 })
}
if (!campaignDate || typeof campaignDate !== 'string') {
  return NextResponse.json({ error: 'campaignDate is required' }, { status: 400 })
}
if (isNaN(Date.parse(campaignDate))) {
  return NextResponse.json({ error: 'campaignDate must be a valid date' }, { status: 400 })
}
if (scheduledAt !== undefined && scheduledAt !== null && isNaN(Date.parse(scheduledAt))) {
  return NextResponse.json({ error: 'scheduledAt must be a valid datetime' }, { status: 400 })
}

const service = createServiceClient()
const { data, error } = await service
  .from('campaigns')
  .insert({
    name: name.trim(),
    campaign_date: campaignDate,
    company_id: appMeta.company_id,
    created_by: user.id,
    scheduled_at: scheduledAt ?? null,
  })
  .select('id')
  .single()
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/campaigns/route.ts
git commit -m "feat: accept scheduledAt in campaign creation API"
```

---

### Task 3: Add schedule picker to new campaign form

**Files:**
- Modify: `src/app/admin/campaigns/new/page.tsx`

- [ ] **Step 1: Add scheduledAt state and field**

In `src/app/admin/campaigns/new/page.tsx`, add state and update the form:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewCampaignPage() {
  const [name, setName] = useState('')
  const [campaignDate, setCampaignDate] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          campaignDate,
          scheduledAt: scheduledAt || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create campaign'); return }
      router.push(`/admin/campaigns/${data.id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-lg mx-auto">
      <Link href="/admin" className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors mb-6 inline-block">
        ← Campaigns
      </Link>

      <h1 className="text-2xl font-bold text-zinc-900 mb-8">New Campaign</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 flex flex-col gap-5">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-medium text-zinc-700">Campaign name</label>
          <input
            id="name"
            type="text"
            placeholder="e.g. Passover 2026"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="date" className="text-sm font-medium text-zinc-700">Campaign date</label>
          <input
            id="date"
            type="date"
            value={campaignDate}
            onChange={(e) => setCampaignDate(e.target.value)}
            required
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="scheduled" className="text-sm font-medium text-zinc-700">
            Auto-send at <span className="text-zinc-400 font-normal">(optional)</span>
          </label>
          <input
            id="scheduled"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="text-xs text-zinc-400">Leave blank to launch manually. Campaigns are checked hourly.</p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all mt-1"
        >
          {loading ? 'Creating…' : 'Create Campaign'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Navigate to `/admin/campaigns/new`. A "Auto-send at" datetime-local input should appear below the campaign date field. Create a campaign with and without the schedule field — both should work.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/campaigns/new/page.tsx
git commit -m "feat: add optional scheduled send datetime picker to new campaign form"
```

---

### Task 4: Scheduled send badge on campaign detail

**Files:**
- Modify: `src/app/admin/campaigns/[id]/page.tsx`

- [ ] **Step 1: Fetch scheduled_at in the page query**

In `src/app/admin/campaigns/[id]/page.tsx`, update the campaign select to include `scheduled_at`:
```typescript
const { data: campaign } = await service
  .from('campaigns')
  .select('id, name, campaign_date, sent_at, closed_at, scheduled_at')
  .eq('id', campaignId)
  .eq('company_id', appMeta.company_id)
  .single()
```

- [ ] **Step 2: Show scheduled badge in header**

In the header `<div>` below the campaign name and date, add:
```tsx
<h1 className="text-2xl font-bold text-zinc-900">{campaign.name}</h1>
<p className="text-sm text-zinc-400 mt-0.5">{campaign.campaign_date ?? '—'}</p>
{campaign.scheduled_at && !campaign.sent_at && (
  <p className="text-xs text-amber-500 mt-1 font-medium">
    Scheduled: {new Date(campaign.scheduled_at).toLocaleString()}
  </p>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/campaigns/[id]/page.tsx
git commit -m "feat: show scheduled send time badge on draft campaign detail"
```

---

### Task 5: Reminder SMS button

**Files:**
- Create: `src/components/admin/ReminderButton.tsx`
- Modify: `src/app/admin/campaigns/[id]/page.tsx`

- [ ] **Step 1: Create ReminderButton component**

Create `src/components/admin/ReminderButton.tsx`:

```tsx
'use client'

import { useState } from 'react'

type Props = { campaignId: string; unredeemedCount: number }

export function ReminderButton({ campaignId, unredeemedCount }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ dispatched: number; failed: number } | null>(null)

  if (unredeemedCount === 0) return null

  async function handleSend() {
    setLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/resend`, { method: 'POST' })
      const data = await res.json()
      setResult({ dispatched: data.dispatched ?? 0, failed: data.failed ?? 0 })
    } catch {
      setResult({ dispatched: 0, failed: unredeemedCount })
    } finally {
      setLoading(false)
      setShowModal(false)
    }
  }

  return (
    <>
      {result && (
        <span className="text-xs text-zinc-500">
          Sent {result.dispatched}{result.failed > 0 ? `, ${result.failed} failed` : ''}
        </span>
      )}
      <button
        onClick={() => setShowModal(true)}
        disabled={loading}
        className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-50"
      >
        Resend to unredeemed ({unredeemedCount})
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-zinc-900 mb-2">Resend reminder?</h2>
            <p className="text-sm text-zinc-500 mb-5">
              This will send a new SMS with the QR code to {unredeemedCount} employee{unredeemedCount !== 1 ? 's' : ''} who haven't redeemed yet.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border border-zinc-200 rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
              >
                {loading ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Add to campaign detail header**

In `src/app/admin/campaigns/[id]/page.tsx`, add the import:
```tsx
import { ReminderButton } from '@/components/admin/ReminderButton'
```

Add the `unredeemedCount` variable after the existing computed values:
```typescript
const unredeemedCount = allTokens.filter((t) => !t.redeemed).length
```

In the header buttons section, add before `canClose`:
```tsx
{campaign.sent_at && !campaign.closed_at && (
  <ReminderButton campaignId={campaign.id} unredeemedCount={unredeemedCount} />
)}
```

- [ ] **Step 3: Verify**

Open a running campaign. A "Resend to unredeemed (N)" button should appear in the header. Clicking it opens a confirmation modal. Confirming fires the resend.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/ReminderButton.tsx src/app/admin/campaigns/[id]/page.tsx
git commit -m "feat: add reminder SMS button to running campaign detail header"
```

---

### Task 6: Cron endpoint for scheduled send

**Files:**
- Create: `src/app/api/cron/send-scheduled/route.ts`
- Create: `vercel.json`

- [ ] **Step 1: Create the cron endpoint**

Create `src/app/api/cron/send-scheduled/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()

  // Find all campaigns due to send
  const { data: dueCampaigns } = await service
    .from('campaigns')
    .select('id, company_id')
    .lte('scheduled_at', new Date().toISOString())
    .is('sent_at', null)
    .is('closed_at', null)

  if (!dueCampaigns || dueCampaigns.length === 0) {
    return NextResponse.json({ triggered: 0 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const results = await Promise.allSettled(
    dueCampaigns.map((campaign) =>
      fetch(`${appUrl}/api/campaigns/${campaign.id}/send`, {
        method: 'POST',
        headers: {
          'x-cron-secret': process.env.CRON_SECRET ?? '',
          'x-company-id': campaign.company_id,
        },
      })
    )
  )

  const triggered = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.filter((r) => r.status === 'rejected').length
  console.log(`[cron/send-scheduled] triggered=${triggered} failed=${failed}`)

  return NextResponse.json({ triggered, failed })
}
```

**Note:** The cron endpoint calls the existing `/api/campaigns/[id]/send` route. That route requires user auth. We need to make the send route also accept a cron-internal header as an alternative auth path.

- [ ] **Step 2: Update send route to accept cron calls**

In `src/app/api/campaigns/[id]/send/route.ts`, replace the auth block at the top of the POST handler:

```typescript
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  // Accept either user session auth OR internal cron secret
  const cronSecret = _request.headers.get('x-cron-secret')
  const isCronCall = cronSecret && cronSecret === process.env.CRON_SECRET

  let companyId: string | undefined

  if (isCronCall) {
    companyId = _request.headers.get('x-company-id') ?? undefined
    if (!companyId) return NextResponse.json({ error: 'Missing company id' }, { status: 400 })
  } else {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const appMeta = user.app_metadata as JwtAppMetadata
    const permissions = await fetchPermissions(appMeta.role_id)
    if (!hasPermission(permissions, 'campaigns:launch')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    companyId = appMeta.company_id
  }

  const service = createServiceClient()

  const { data: campaign, error: campaignError } = await service
    .from('campaigns')
    .select('id, name, company_id, sent_at')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()
  // ... rest unchanged
```

- [ ] **Step 3: Create vercel.json**

Create `vercel.json` in the project root:

```json
{
  "crons": [
    {
      "path": "/api/cron/send-scheduled",
      "schedule": "0 * * * *"
    }
  ]
}
```

This runs the cron job at the top of every hour. Vercel sends a POST request with `Authorization: Bearer <CRON_SECRET>` automatically.

**Note:** Add `CRON_SECRET` to Vercel environment variables. Generate with: `openssl rand -hex 32`

- [ ] **Step 4: Update middleware to exclude cron route**

In `src/middleware.ts`, add `/api/cron` to the matcher exclusion pattern. The current matcher already excludes `/api/` paths, so no change needed — verify the matcher:

```typescript
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
}
```

The `api/` exclusion already covers `/api/cron/send-scheduled`. No change needed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/send-scheduled/route.ts vercel.json src/app/api/campaigns/[id]/send/route.ts
git commit -m "feat: add scheduled send cron endpoint and vercel.json config"
```

---

### Task 7: Add Duplicate button to campaign detail header

**Files:**
- Modify: `src/app/admin/campaigns/[id]/page.tsx`

- [ ] **Step 1: Add DuplicateCampaignButton to the detail header**

In `src/app/admin/campaigns/[id]/page.tsx`, `DuplicateCampaignButton` is already imported. Add it to the header buttons section alongside the other actions:

```tsx
<div className="flex items-center gap-3 flex-shrink-0">
  <StatusBadge sentAt={campaign.sent_at} closedAt={campaign.closed_at} />
  {isDraft && <DeleteCampaignButton campaignId={campaign.id} redirectAfter />}
  <DuplicateCampaignButton
    campaignId={campaign.id}
    sourceName={campaign.name}
    sourceDate={campaign.campaign_date}
  />
  {campaign.sent_at && (
    <Link href={`/admin/campaigns/${campaign.id}/qr`} ...>View QR Codes</Link>
  )}
  {campaign.sent_at && !campaign.closed_at && (
    <ReminderButton campaignId={campaign.id} unredeemedCount={unredeemedCount} />
  )}
  {canClose && <CloseCampaignButton campaignId={campaign.id} />}
  {canLaunch && <LaunchButton campaignId={campaign.id} employeeCount={allTokens.length} />}
</div>
```

Note: `DuplicateCampaignButton` is already imported at the top of the file — no new import needed.

- [ ] **Step 2: Verify**

Open any campaign (draft, running, or closed). A copy icon button should appear in the header. Clicking it opens the duplicate modal. On confirm, it navigates to the new draft campaign.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/campaigns/[id]/page.tsx
git commit -m "feat: add Duplicate button to campaign detail page header"
```
