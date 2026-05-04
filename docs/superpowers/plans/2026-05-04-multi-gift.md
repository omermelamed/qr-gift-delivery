# Multi-Gift Campaign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow campaigns to define multiple gift options; distributors pick which gift an employee took at scan time; admins see per-gift breakdowns in the campaign dashboard.

**Architecture:** A new `campaign_gifts` table holds named options per campaign. `gift_tokens` gains a nullable `gift_id` column stamped at redemption. The verify API returns a `needsGiftSelection` signal when a campaign has 2+ gifts and no gift was passed; the scan page shows a tap-target gift picker in that case. Single-gift campaigns are entirely unaffected.

**Tech Stack:** Next.js 15 App Router, Supabase Postgres + RLS, Tailwind CSS, TypeScript.

---

## File Map

- **Create:** `supabase/migrations/20240504000018_multi_gift.sql`
- **Modify:** `.github/workflows/migrate.yml` — whitelist + idempotent patch
- **Create:** `src/app/api/campaigns/[id]/gifts/route.ts` — GET + POST gift options
- **Create:** `src/app/api/campaigns/[id]/gifts/[giftId]/route.ts` — DELETE + PUT gift option
- **Create:** `src/components/admin/GiftOptionsEditor.tsx` — client component for draft layout
- **Modify:** `src/app/admin/campaigns/[id]/page.tsx` — fetch gifts, wire GiftOptionsEditor, pass gifts to children
- **Modify:** `src/app/api/verify/[token]/route.ts` — accept giftId, return needsGiftSelection
- **Modify:** `src/types/index.ts` — add GiftOption type, extend TokenVerifyResult
- **Modify:** `src/app/scan/page.tsx` — add gift_selection state + gift picker UI
- **Modify:** `src/components/admin/EmployeeTable.tsx` — add Gift column
- **Create:** `src/components/admin/GiftBreakdown.tsx` — gift distribution bar
- **Modify:** `src/app/admin/campaigns/[id]/page.tsx` — add GiftBreakdown to bento grid

---

### Task 1: Migration — campaign_gifts table + gift_id on gift_tokens

**Files:**
- Create: `supabase/migrations/20240504000018_multi_gift.sql`
- Modify: `.github/workflows/migrate.yml`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/20240504000018_multi_gift.sql`:

```sql
CREATE TABLE campaign_gifts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX campaign_gifts_campaign_idx ON campaign_gifts (campaign_id, position);

ALTER TABLE campaign_gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_gifts_company_isolation"
  ON campaign_gifts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_gifts.campaign_id
        AND c.company_id = public.jwt_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_gifts.campaign_id
        AND c.company_id = public.jwt_company_id()
    )
  );

ALTER TABLE gift_tokens
  ADD COLUMN IF NOT EXISTS gift_id UUID REFERENCES campaign_gifts(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Update workflow whitelist and idempotent patch**

In `.github/workflows/migrate.yml`:

A) Add `'20240504000018'` to the DELETE whitelist after `'20240502000015'`.

B) In the idempotent patch SQL block, add after the `scheduled_at` line:

```sql
          CREATE TABLE IF NOT EXISTS campaign_gifts (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            position    INT  NOT NULL DEFAULT 0,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
          );
          CREATE INDEX IF NOT EXISTS campaign_gifts_campaign_idx ON campaign_gifts (campaign_id, position);
          ALTER TABLE gift_tokens ADD COLUMN IF NOT EXISTS gift_id UUID REFERENCES campaign_gifts(id) ON DELETE SET NULL;
```

- [ ] **Step 3: Update types**

In `src/types/index.ts`, add the `GiftOption` type and extend `TokenVerifyResult`:

```typescript
export type GiftOption = {
  id: string
  name: string
  position: number
}
```

Update `TokenVerifyResult`:
```typescript
export type TokenVerifyResult =
  | { valid: true; employeeName: string; needsGiftSelection?: false }
  | { valid: true; employeeName: string; needsGiftSelection: true; gifts: GiftOption[] }
  | { valid: false; reason: 'already_used'; employeeName: string }
  | { valid: false; reason: 'invalid' }
  | { valid: false; reason: 'campaign_closed' }
  | { valid: false; reason: 'not_authorized' }
```

- [ ] **Step 4: TypeScript check**

```bash
./node_modules/.bin/tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20240504000018_multi_gift.sql .github/workflows/migrate.yml src/types/index.ts
git commit -m "feat: add campaign_gifts table, gift_id on gift_tokens, GiftOption type"
```

---

### Task 2: Gift management API routes

**Files:**
- Create: `src/app/api/campaigns/[id]/gifts/route.ts`
- Create: `src/app/api/campaigns/[id]/gifts/[giftId]/route.ts`

- [ ] **Step 1: Create GET + POST route**

Create `src/app/api/campaigns/[id]/gifts/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

async function getAuthedService(campaignId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id || !appMeta?.role_id) return null
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'campaigns:launch')) return null
  const service = createServiceClient()
  const { data: campaign } = await service
    .from('campaigns')
    .select('id, sent_at')
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)
    .single()
  if (!campaign) return null
  return { service, campaign }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params
  const ctx = await getAuthedService(campaignId)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: gifts } = await ctx.service
    .from('campaign_gifts')
    .select('id, name, position')
    .eq('campaign_id', campaignId)
    .order('position', { ascending: true })

  return NextResponse.json({ gifts: gifts ?? [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params
  const ctx = await getAuthedService(campaignId)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (ctx.campaign.sent_at) {
    return NextResponse.json({ error: 'Cannot modify gifts after campaign launch' }, { status: 422 })
  }

  const body = await request.json().catch(() => ({}))
  const name: string = (body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  // Position = current max + 1
  const { data: existing } = await ctx.service
    .from('campaign_gifts')
    .select('position')
    .eq('campaign_id', campaignId)
    .order('position', { ascending: false })
    .limit(1)

  const position = (existing?.[0]?.position ?? -1) + 1

  const { data: gift, error } = await ctx.service
    .from('campaign_gifts')
    .insert({ campaign_id: campaignId, name, position })
    .select('id, name, position')
    .single()

  if (error || !gift) return NextResponse.json({ error: 'Failed to add gift' }, { status: 500 })

  return NextResponse.json(gift, { status: 201 })
}
```

- [ ] **Step 2: Create DELETE + PUT route**

Create `src/app/api/campaigns/[id]/gifts/[giftId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

async function getAuthedService(campaignId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id || !appMeta?.role_id) return null
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'campaigns:launch')) return null
  const service = createServiceClient()
  const { data: campaign } = await service
    .from('campaigns')
    .select('id, sent_at')
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)
    .single()
  if (!campaign) return null
  return { service, campaign }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; giftId: string }> }
) {
  const { id: campaignId, giftId } = await params
  const ctx = await getAuthedService(campaignId)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.campaign.sent_at) {
    return NextResponse.json({ error: 'Cannot modify gifts after campaign launch' }, { status: 422 })
  }

  await ctx.service
    .from('campaign_gifts')
    .delete()
    .eq('id', giftId)
    .eq('campaign_id', campaignId)

  return NextResponse.json({ success: true })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; giftId: string }> }
) {
  const { id: campaignId, giftId } = await params
  const ctx = await getAuthedService(campaignId)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.campaign.sent_at) {
    return NextResponse.json({ error: 'Cannot modify gifts after campaign launch' }, { status: 422 })
  }

  const body = await request.json().catch(() => ({}))
  const name: string = (body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { error } = await ctx.service
    .from('campaign_gifts')
    .update({ name })
    .eq('id', giftId)
    .eq('campaign_id', campaignId)

  if (error) return NextResponse.json({ error: 'Failed to update gift' }, { status: 500 })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: TypeScript check**

```bash
./node_modules/.bin/tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/api/campaigns/[id]/gifts/route.ts' 'src/app/api/campaigns/[id]/gifts/[giftId]/route.ts'
git commit -m "feat: add gift management API routes (GET, POST, DELETE, PUT)"
```

---

### Task 3: GiftOptionsEditor component + wire into campaign detail

**Files:**
- Create: `src/components/admin/GiftOptionsEditor.tsx`
- Modify: `src/app/admin/campaigns/[id]/page.tsx`

- [ ] **Step 1: Create GiftOptionsEditor**

Create `src/components/admin/GiftOptionsEditor.tsx`:

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import type { GiftOption } from '@/types'

type Props = { campaignId: string; disabled?: boolean }

export function GiftOptionsEditor({ campaignId, disabled = false }: Props) {
  const [gifts, setGifts] = useState<GiftOption[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}/gifts`)
      .then((r) => r.json())
      .then((d) => setGifts(d.gifts ?? []))
  }, [campaignId])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/gifts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        const gift = await res.json()
        setGifts((prev) => [...prev, gift])
        setNewName('')
        inputRef.current?.focus()
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/campaigns/${campaignId}/gifts/${id}`, { method: 'DELETE' })
    setGifts((prev) => prev.filter((g) => g.id !== id))
  }

  async function handleSaveEdit(id: string) {
    const name = editName.trim()
    if (!name) return
    await fetch(`/api/campaigns/${campaignId}/gifts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setGifts((prev) => prev.map((g) => g.id === id ? { ...g, name } : g))
    setEditingId(null)
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h2 className="font-semibold text-zinc-900 mb-1">Gift Options</h2>
      <p className="text-xs text-zinc-400 mb-4">
        {gifts.length === 0
          ? 'No options — campaign will use single-gift flow'
          : `${gifts.length} option${gifts.length !== 1 ? 's' : ''} defined`}
      </p>

      {gifts.length > 0 && (
        <ul className="flex flex-col gap-2 mb-4">
          {gifts.map((g, i) => (
            <li key={g.id} className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full text-white text-xs flex items-center justify-center flex-shrink-0 font-bold"
                style={{ backgroundColor: GIFT_COLORS[i % GIFT_COLORS.length] }}>
                {i + 1}
              </span>
              {editingId === g.id ? (
                <>
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(g.id); if (e.key === 'Escape') setEditingId(null) }}
                    className="flex-1 border border-zinc-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button onClick={() => handleSaveEdit(g.id)} className="text-xs font-medium" style={{ color: 'var(--brand,#6366f1)' }}>Save</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-zinc-400">Cancel</button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-zinc-800">{g.name}</span>
                  {!disabled && (
                    <>
                      <button onClick={() => { setEditingId(g.id); setEditName(g.name) }}
                        className="text-zinc-400 hover:text-zinc-700 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={() => handleDelete(g.id)}
                        className="text-zinc-400 hover:text-red-500 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="e.g. Spa Voucher"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={loading || !newName.trim()}
            className="text-white rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:brightness-110 transition-all"
            style={{ backgroundColor: 'var(--brand,#6366f1)' }}
          >
            Add
          </button>
        </form>
      )}
    </div>
  )
}

export const GIFT_COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#14b8a6', '#f43f5e', '#f97316']
```

- [ ] **Step 2: Wire GiftOptionsEditor into the draft bento layout**

In `src/app/admin/campaigns/[id]/page.tsx`, add import:
```tsx
import { GiftOptionsEditor } from '@/components/admin/GiftOptionsEditor'
```

In the **draft** layout, add `GiftOptionsEditor` below `DistributorAssignment` in the right column. Change the right column from a single `<div>` to two stacked divs:

```tsx
{/* Draft right column: Distributor + Gift Options */}
<div className="flex flex-col gap-4">
  <DistributorAssignment campaignId={campaign.id} />
  <GiftOptionsEditor campaignId={campaign.id} />
</div>
```

- [ ] **Step 3: TypeScript check**

```bash
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/GiftOptionsEditor.tsx src/app/admin/campaigns/[id]/page.tsx
git commit -m "feat: add GiftOptionsEditor component to draft campaign layout"
```

---

### Task 4: Update verify API to support gift selection

**Files:**
- Modify: `src/app/api/verify/[token]/route.ts`

- [ ] **Step 1: Update the verify route**

Read the current file, then apply these changes:

1. Extract `giftId` from the request body:
```typescript
const distributorId: string | null = body.distributorId ?? null
const giftId: string | null = body.giftId ?? null
```

2. After the distributor authorization checks and before the `tokenRow.redeemed` check, fetch the campaign's gifts:
```typescript
// Fetch gift options for this campaign
const { data: campaignGifts } = await supabase
  .from('campaign_gifts')
  .select('id, name, position')
  .eq('campaign_id', tokenRow.campaign_id)
  .order('position', { ascending: true })

const gifts = campaignGifts ?? []
```

3. If the campaign has 2+ gifts and no giftId was provided, return the gift selection signal (BEFORE checking redeemed — we don't want to reveal already_used to unauthorized gift pickers):
```typescript
if (gifts.length >= 2 && !giftId) {
  // Don't redeem yet — ask scanner to pick a gift first
  return NextResponse.json({
    valid: true,
    needsGiftSelection: true,
    employeeName: tokenRow.employee_name,
    gifts: gifts.map((g) => ({ id: g.id, name: g.name, position: g.position })),
  })
}
```

4. Update the atomic UPDATE to also stamp `gift_id`. If there's exactly 1 gift and no giftId provided, auto-stamp it:
```typescript
const resolvedGiftId = giftId ?? (gifts.length === 1 ? gifts[0].id : null)

const { data: redeemed } = await supabase
  .from('gift_tokens')
  .update({
    redeemed: true,
    redeemed_at: new Date().toISOString(),
    redeemed_by: distributorId,
    gift_id: resolvedGiftId,
  })
  .eq('token', token)
  .eq('redeemed', false)
  .select('employee_name')
  .single()
```

The full updated file after all changes:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { logAuditEvent } from '@/lib/audit'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = await request.json().catch(() => ({}))
  const distributorId: string | null = body.distributorId ?? null
  const giftId: string | null = body.giftId ?? null

  const supabase = createServiceClient()

  const { data: tokenRow } = await supabase
    .from('gift_tokens')
    .select('id, employee_name, redeemed, campaign_id, campaigns(closed_at, company_id, name)')
    .eq('token', token)
    .single()

  if (!tokenRow) {
    return NextResponse.json({ valid: false, reason: 'invalid' })
  }

  const campaign = tokenRow.campaigns as unknown as { closed_at: string | null; company_id: string; name?: string } | null
  if (campaign?.closed_at) {
    return NextResponse.json({ valid: false, reason: 'campaign_closed' })
  }

  // Distributor restriction check
  const { data: assignedDistributors, error: distError } = await supabase
    .from('campaign_distributors')
    .select('user_id')
    .eq('campaign_id', tokenRow.campaign_id)

  if (distError) {
    return NextResponse.json({ valid: false, reason: 'invalid' }, { status: 500 })
  }

  if (assignedDistributors && assignedDistributors.length > 0 && distributorId) {
    const assignedIds = new Set(assignedDistributors.map((r) => r.user_id))
    if (!assignedIds.has(distributorId)) {
      const companyId = campaign?.company_id
      const { data: privilegedRole } = companyId
        ? await supabase
            .from('user_company_roles')
            .select('roles!inner(name)')
            .eq('user_id', distributorId)
            .eq('company_id', companyId)
            .in('roles.name', ['company_admin', 'campaign_manager'])
            .maybeSingle()
        : { data: null }

      if (!privilegedRole) {
        return NextResponse.json({ valid: false, reason: 'not_authorized' })
      }
    }
  } else if (assignedDistributors && assignedDistributors.length > 0 && !distributorId) {
    return NextResponse.json({ valid: false, reason: 'not_authorized' })
  }

  // Fetch gift options
  const { data: campaignGifts } = await supabase
    .from('campaign_gifts')
    .select('id, name, position')
    .eq('campaign_id', tokenRow.campaign_id)
    .order('position', { ascending: true })

  const gifts = campaignGifts ?? []

  // Multi-gift: ask scanner to pick before redeeming
  if (gifts.length >= 2 && !giftId) {
    return NextResponse.json({
      valid: true,
      needsGiftSelection: true,
      employeeName: tokenRow.employee_name,
      gifts: gifts.map((g) => ({ id: g.id, name: g.name, position: g.position })),
    })
  }

  if (tokenRow.redeemed) {
    return NextResponse.json({
      valid: false,
      reason: 'already_used',
      employeeName: tokenRow.employee_name,
    })
  }

  const resolvedGiftId = giftId ?? (gifts.length === 1 ? gifts[0].id : null)

  const { data: redeemed } = await supabase
    .from('gift_tokens')
    .update({
      redeemed: true,
      redeemed_at: new Date().toISOString(),
      redeemed_by: distributorId,
      gift_id: resolvedGiftId,
    })
    .eq('token', token)
    .eq('redeemed', false)
    .select('employee_name')
    .single()

  if (redeemed) {
    logAuditEvent({
      companyId: campaign?.company_id ?? '',
      actorId: distributorId,
      action: 'token.redeemed',
      resourceType: 'gift_token',
      resourceId: tokenRow.id,
      metadata: {
        employee_name: redeemed.employee_name,
        campaign_name: (tokenRow.campaigns as unknown as { name?: string } | null)?.name ?? '',
        gift_id: resolvedGiftId,
      },
    })
    return NextResponse.json({ valid: true, employeeName: redeemed.employee_name })
  }

  return NextResponse.json({
    valid: false,
    reason: 'already_used',
    employeeName: tokenRow.employee_name,
  })
}
```

- [ ] **Step 2: TypeScript check**

```bash
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/verify/[token]/route.ts
git commit -m "feat: verify API returns needsGiftSelection for multi-gift campaigns, stamps gift_id on redemption"
```

---

### Task 5: Update scan page with gift picker

**Files:**
- Modify: `src/app/scan/page.tsx`

- [ ] **Step 1: Update the scan page**

The scan page needs a new `'gift_selection'` state and a gift picker UI. Replace the entire file with:

```tsx
'use client'

import { useState, useCallback, useEffect } from 'react'
import { QrScanner } from '@/components/QrScanner'
import { createClient } from '@/lib/supabase/browser'
import type { TokenVerifyResult, GiftOption } from '@/types'

type ScanState = 'scanning' | 'loading' | 'gift_selection' | 'result'
type ScanOutcome = 'success' | 'already_claimed' | 'invalid' | 'closed' | 'not_authorized'

type ScanHistoryEntry = {
  employeeName: string | null
  outcome: ScanOutcome
  timestamp: Date
}

const TOKEN_PATTERN = /\/verify\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

const GIFT_COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#14b8a6', '#f43f5e', '#f97316']

function outcomeFromResult(result: TokenVerifyResult): ScanOutcome {
  if (result.valid) return 'success'
  if (result.reason === 'already_used') return 'already_claimed'
  if (result.reason === 'campaign_closed') return 'closed'
  if (result.reason === 'not_authorized') return 'not_authorized'
  return 'invalid'
}

export default function ScanPage() {
  const [scanState, setScanState] = useState<ScanState>('scanning')
  const [result, setResult] = useState<TokenVerifyResult | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)
  // Multi-gift state
  const [pendingToken, setPendingToken] = useState<string | null>(null)
  const [pendingEmployee, setPendingEmployee] = useState<string | null>(null)
  const [giftOptions, setGiftOptions] = useState<GiftOption[]>([])
  const [giftLoading, setGiftLoading] = useState(false)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null)
    })
  }, [])

  const handleScan = useCallback(
    async (text: string) => {
      if (scanState !== 'scanning') return
      setScanState('loading')

      const match = text.match(TOKEN_PATTERN)
      if (!match) {
        const r: TokenVerifyResult = { valid: false, reason: 'invalid' }
        setResult(r)
        setScanHistory((prev) => [{ employeeName: null, outcome: 'invalid', timestamp: new Date() }, ...prev].slice(0, 10))
        setScanState('result')
        return
      }

      const token = match[1]
      let r: TokenVerifyResult = { valid: false, reason: 'invalid' }
      try {
        const res = await fetch(`/api/verify/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ distributorId: userId }),
        })
        r = await res.json()
      } catch {
        r = { valid: false, reason: 'invalid' }
      }

      // Multi-gift: show gift picker before confirming redemption
      if (r.valid && r.needsGiftSelection) {
        setPendingToken(token)
        setPendingEmployee(r.employeeName)
        setGiftOptions(r.gifts)
        setScanState('gift_selection')
        return
      }

      const employeeName = r.valid ? r.employeeName : (r.reason === 'already_used' ? r.employeeName : null)
      setScanHistory((prev) => [{
        employeeName: employeeName ?? null,
        outcome: outcomeFromResult(r),
        timestamp: new Date(),
      }, ...prev].slice(0, 10))
      setResult(r)
      setScanState('result')
    },
    [scanState, userId]
  )

  async function handleGiftSelect(giftId: string) {
    if (!pendingToken) return
    setGiftLoading(true)
    let r: TokenVerifyResult = { valid: false, reason: 'invalid' }
    try {
      const res = await fetch(`/api/verify/${pendingToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distributorId: userId, giftId }),
      })
      r = await res.json()
    } catch {
      r = { valid: false, reason: 'invalid' }
    }
    setGiftLoading(false)
    const employeeName = r.valid ? r.employeeName : (r.reason === 'already_used' ? r.employeeName : null)
    setScanHistory((prev) => [{
      employeeName: employeeName ?? pendingEmployee,
      outcome: outcomeFromResult(r),
      timestamp: new Date(),
    }, ...prev].slice(0, 10))
    setPendingToken(null)
    setPendingEmployee(null)
    setGiftOptions([])
    setResult(r)
    setScanState('result')
  }

  function handleDismiss() {
    setResult(null)
    setScanState('scanning')
  }

  function handleCancelGift() {
    setPendingToken(null)
    setPendingEmployee(null)
    setGiftOptions([])
    setScanState('scanning')
  }

  return (
    <main className="flex flex-col bg-black overflow-hidden" style={{ height: '100dvh' }}>
      <div className="relative flex-1 overflow-hidden">
        {/* Camera */}
        <div className="absolute inset-0">
          <QrScanner onResult={handleScan} active={scanState === 'scanning' && userId !== null} />
        </div>

        {/* Scan frame overlay */}
        {scanState === 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="relative w-52 h-52">
              <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-indigo-400 rounded-tl-lg" />
              <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-indigo-400 rounded-tr-lg" />
              <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-indigo-400 rounded-bl-lg" />
              <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-indigo-400 rounded-br-lg" />
              <span className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-scan-line" style={{ top: '50%' }} />
            </div>
            <p className="text-white/50 text-sm mt-6">Point camera at QR code</p>
          </div>
        )}

        {/* Loading overlay */}
        {scanState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="w-10 h-10 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Gift selection takeover */}
        {scanState === 'gift_selection' && (
          <div className="absolute inset-0 flex flex-col bg-zinc-900 px-6 pt-12 pb-8">
            <p className="text-white/60 text-sm text-center mb-1">Scanning for</p>
            <p className="text-white text-2xl font-bold text-center mb-8">{pendingEmployee}</p>
            <p className="text-white/80 text-sm font-medium text-center mb-4">Which gift did they take?</p>
            <div className="flex flex-col gap-3 flex-1">
              {giftOptions.map((gift, i) => (
                <button
                  key={gift.id}
                  onClick={() => handleGiftSelect(gift.id)}
                  disabled={giftLoading}
                  className="w-full py-5 rounded-2xl text-white text-lg font-semibold disabled:opacity-50 active:scale-95 transition-transform"
                  style={{ backgroundColor: GIFT_COLORS[i % GIFT_COLORS.length] }}
                >
                  {gift.name}
                </button>
              ))}
            </div>
            <button
              onClick={handleCancelGift}
              disabled={giftLoading}
              className="mt-6 text-white/40 text-sm text-center w-full"
            >
              Cancel scan
            </button>
          </div>
        )}

        {/* Result takeover */}
        {scanState === 'result' && result && (
          <div
            onClick={handleDismiss}
            className={`absolute inset-0 flex flex-col items-center justify-center gap-5 cursor-pointer select-none ${
              result.valid ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg">
              <span className="text-4xl">{result.valid ? '✓' : '✗'}</span>
            </div>

            {result.valid ? (
              <>
                <p className="text-white text-4xl font-bold text-center px-8">{result.employeeName}</p>
                <p className="text-white/80 text-lg">Gift collected</p>
              </>
            ) : result.reason === 'campaign_closed' ? (
              <>
                <p className="text-white text-3xl font-bold">Campaign closed</p>
                <p className="text-white/80 text-lg">No further gifts can be claimed</p>
              </>
            ) : result.reason === 'not_authorized' ? (
              <>
                <p className="text-white text-3xl font-bold">Not authorised</p>
                <p className="text-white/80 text-lg">You are not assigned to this campaign</p>
              </>
            ) : result.reason === 'already_used' ? (
              <>
                <p className="text-white text-3xl font-bold">Already claimed</p>
                {result.employeeName && (
                  <p className="text-white/80 text-lg">{result.employeeName}</p>
                )}
              </>
            ) : (
              <>
                <p className="text-white text-3xl font-bold">Could not verify</p>
                <p className="text-white/80 text-lg">Try again</p>
              </>
            )}

            <p className="text-white/40 text-sm absolute bottom-10">Tap anywhere to scan next</p>
          </div>
        )}

        {/* Back to admin + History */}
        {scanState !== 'result' && scanState !== 'gift_selection' && (
          <>
            <a
              href="/admin"
              className="absolute top-5 left-5 bg-zinc-800/80 text-white text-sm font-medium px-4 py-2 rounded-full backdrop-blur-sm"
            >
              ← Admin
            </a>
            <button
              onClick={() => setShowHistory(true)}
              className="absolute bottom-8 right-6 bg-zinc-800/80 text-white text-sm font-medium px-4 py-2 rounded-full backdrop-blur-sm"
            >
              History {scanHistory.length > 0 && `(${scanHistory.length})`}
            </button>
          </>
        )}

        {/* History bottom sheet */}
        {showHistory && (
          <div
            className="absolute inset-0 flex flex-col justify-end z-30"
            onClick={() => setShowHistory(false)}
          >
            <div
              className="bg-zinc-900/95 rounded-t-2xl p-5 max-h-[60vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Recent scans</h2>
                <button onClick={() => setShowHistory(false)} className="text-zinc-400 hover:text-white transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {scanHistory.length === 0 ? (
                <p className="text-zinc-400 text-sm text-center py-6">No scans yet this session</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {scanHistory.map((entry, i) => (
                    <li key={`${entry.timestamp.getTime()}-${i}`} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        entry.outcome === 'success' ? 'bg-green-500/20' : 'bg-red-500/20'
                      }`}>
                        {entry.outcome === 'success' ? (
                          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {entry.employeeName ??
                            (entry.outcome === 'invalid' ? 'Invalid QR code' :
                             entry.outcome === 'not_authorized' ? 'Not authorised' :
                             entry.outcome === 'closed' ? 'Campaign closed' : 'Unknown')}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className={`text-xs font-medium flex-shrink-0 ${
                        entry.outcome === 'success' ? 'text-green-400' :
                        entry.outcome === 'already_claimed' ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {entry.outcome === 'success' ? 'Claimed' :
                         entry.outcome === 'already_claimed' ? 'Already claimed' :
                         entry.outcome === 'closed' ? 'Closed' :
                         entry.outcome === 'not_authorized' ? 'Not auth.' : 'Invalid'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/scan/page.tsx
git commit -m "feat: add gift picker to scan page for multi-gift campaigns"
```

---

### Task 6: Update campaign detail page to fetch gifts + update EmployeeTable

**Files:**
- Modify: `src/app/admin/campaigns/[id]/page.tsx`
- Modify: `src/components/admin/EmployeeTable.tsx`

- [ ] **Step 1: Fetch gifts and gift_id in campaign detail page**

In `src/app/admin/campaigns/[id]/page.tsx`:

1. Add gifts query after the tokens query:
```typescript
const { data: giftsData } = await service
  .from('campaign_gifts')
  .select('id, name, position')
  .eq('campaign_id', campaignId)
  .order('position', { ascending: true })

const gifts = giftsData ?? []
```

2. Update the tokens query to also select `gift_id`:
```typescript
const { data: tokens } = await service
  .from('gift_tokens')
  .select('id, employee_name, phone_number, department, sms_sent_at, redeemed, redeemed_at, redeemed_by, gift_id')
  .eq('campaign_id', campaignId)
  .order('redeemed', { ascending: true })
  .order('employee_name', { ascending: true })
```

3. Pass `gifts` to `EmployeeTable` in both the draft and running/closed branches:
```tsx
<EmployeeTable
  campaignId={campaign.id}
  initialRows={allTokens}
  isDraft={isDraft}
  gifts={gifts}
/>
```

- [ ] **Step 2: Update EmployeeTable to show Gift column**

In `src/components/admin/EmployeeTable.tsx`:

1. Update `TokenRow` type to include `gift_id`:
```typescript
type TokenRow = {
  id: string
  employee_name: string
  phone_number: string
  department: string | null
  sms_sent_at: string | null
  redeemed: boolean
  redeemed_at: string | null
  redeemed_by: string | null
  gift_id: string | null
}
```

2. Add `gifts` to component props:
```typescript
export function EmployeeTable({
  campaignId,
  initialRows,
  isDraft,
  gifts = [],
}: {
  campaignId: string
  initialRows: TokenRow[]
  isDraft: boolean
  gifts?: { id: string; name: string }[]
}) {
```

3. Add `GIFT_COLORS` and a lookup map inside the component:
```typescript
const GIFT_COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#14b8a6', '#f43f5e', '#f97316']
const giftMap = new Map(gifts.map((g, i) => [g.id, { name: g.name, color: GIFT_COLORS[i % GIFT_COLORS.length] }]))
const showGiftCol = gifts.length > 0
```

4. Add `Gift` column header after `Department` (only when `showGiftCol`):
```tsx
{showGiftCol && <th className="px-3 py-2 font-medium">Gift</th>}
```

5. Add gift cell in each row (both the grouped and flat row rendering) after the department cell:
```tsx
{showGiftCol && (
  <td className="px-3 py-2.5">
    {r.gift_id && giftMap.get(r.gift_id) ? (
      <span
        className="text-white text-xs font-medium px-2 py-0.5 rounded-full"
        style={{ backgroundColor: giftMap.get(r.gift_id)!.color }}
      >
        {giftMap.get(r.gift_id)!.name}
      </span>
    ) : r.redeemed ? (
      <span className="text-zinc-300 text-xs">—</span>
    ) : (
      <span className="text-zinc-200 text-xs">—</span>
    )}
  </td>
)}
```

The `colSpan={7}` on the empty state and group headers must become `colSpan={showGiftCol ? 8 : 7}`.

- [ ] **Step 3: TypeScript check**

```bash
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/campaigns/[id]/page.tsx src/components/admin/EmployeeTable.tsx
git commit -m "feat: fetch gifts in campaign detail, show Gift column in employee table"
```

---

### Task 7: GiftBreakdown component + wire into campaign detail

**Files:**
- Create: `src/components/admin/GiftBreakdown.tsx`
- Modify: `src/app/admin/campaigns/[id]/page.tsx`

- [ ] **Step 1: Create GiftBreakdown component**

Create `src/components/admin/GiftBreakdown.tsx`:

```tsx
import type { GiftOption } from '@/types'

const GIFT_COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#14b8a6', '#f43f5e', '#f97316']

type TokenSlice = { redeemed: boolean; gift_id: string | null }

type Props = {
  gifts: GiftOption[]
  tokens: TokenSlice[]
}

export function GiftBreakdown({ gifts, tokens }: Props) {
  if (gifts.length < 2) return null

  const redeemed = tokens.filter((t) => t.redeemed)
  if (redeemed.length === 0) return null

  const counts = new Map<string, number>()
  let uncategorised = 0

  for (const t of redeemed) {
    if (t.gift_id) {
      counts.set(t.gift_id, (counts.get(t.gift_id) ?? 0) + 1)
    } else {
      uncategorised++
    }
  }

  const total = redeemed.length

  return (
    <div className="mt-4 pt-4 border-t border-zinc-100">
      <p className="text-xs text-zinc-400 mb-2 font-medium">Gift breakdown</p>
      <div className="flex flex-wrap gap-2">
        {gifts.map((g, i) => {
          const count = counts.get(g.id) ?? 0
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <div key={g.id} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: GIFT_COLORS[i % GIFT_COLORS.length] }}
              />
              <span className="text-xs text-zinc-600 font-medium">{g.name}</span>
              <span className="text-xs text-zinc-400">{count} ({pct}%)</span>
            </div>
          )
        })}
        {uncategorised > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-zinc-300 flex-shrink-0" />
            <span className="text-xs text-zinc-400">No gift recorded {uncategorised}</span>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire GiftBreakdown into RedemptionProgress area**

`RedemptionProgress` is a client component with its own card. Rather than modifying it, render `GiftBreakdown` as a separate card directly below `RedemptionProgress` in the running/closed layout of `src/app/admin/campaigns/[id]/page.tsx`.

Add import:
```tsx
import { GiftBreakdown } from '@/components/admin/GiftBreakdown'
```

In the running/closed branch, wrap Progress + GiftBreakdown in a col-span-2 container:
```tsx
{/* Row 1 left: Progress + Gift breakdown stacked */}
<div className="lg:col-span-2 flex flex-col gap-4">
  <RedemptionProgress
    campaignId={campaign.id}
    initialClaimed={claimedCount}
    total={allTokens.length}
  />
  {gifts.length >= 2 && (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <GiftBreakdown gifts={gifts} tokens={allTokens} />
    </div>
  )}
</div>
```

- [ ] **Step 3: TypeScript check**

```bash
./node_modules/.bin/tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/GiftBreakdown.tsx src/app/admin/campaigns/[id]/page.tsx
git commit -m "feat: add GiftBreakdown card showing per-gift redemption distribution"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `campaign_gifts` table with RLS — Task 1
- ✅ `gift_id` on `gift_tokens` — Task 1
- ✅ Gift management API (GET, POST, DELETE, PUT) — Task 2
- ✅ `GiftOptionsEditor` in draft layout — Task 3
- ✅ Verify API: `needsGiftSelection` + auto-stamp single gift — Task 4
- ✅ Scan page gift picker (full-width tap targets) — Task 5
- ✅ Single-gift campaigns unaffected — Task 4 (0-1 gifts: no `needsGiftSelection`)
- ✅ Gift column in EmployeeTable — Task 6
- ✅ Gift breakdown stats — Task 7
- ✅ Gifts locked after launch (API enforces) — Task 2

**Type consistency check:**
- `GiftOption` defined in `src/types/index.ts` (Task 1), used in `GiftOptionsEditor` (Task 3), `GiftBreakdown` (Task 7), scan page (Task 5) ✅
- `gift_id` on `TokenRow` in EmployeeTable matches what the page selects ✅
- `GIFT_COLORS` defined independently in `GiftOptionsEditor`, scan page, and `GiftBreakdown` — consistent array ✅
- `gifts` prop on `EmployeeTable` defaults to `[]` so existing callers (ResendModal etc.) don't break ✅
