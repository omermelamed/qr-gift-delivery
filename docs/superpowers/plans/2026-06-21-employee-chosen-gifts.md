# Employee-Chosen Gifts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let employees pick their own gift from the SMS link page (`/gift/[token]`) before scanning; the choice locks (admin-only override, anytime); HR sees the distribution before any scan; the distributor sees the chosen gift at scan time.

**Architecture:** The single underlying change is decoupling the gift choice from redemption. Today `gift_tokens.gift_id` is written only at redemption; this plan writes it earlier (when the employee picks) and persists it while `redeemed = false`. A new public route locks the employee's choice atomically. The verify route keys off the stored `gift_id`. Admin override and the pre-scan distribution view read the same column.

**Tech Stack:** Next.js App Router (see `node_modules/next/dist/docs/` — APIs differ from training data), Supabase (Postgres + RLS, service role in server routes), TypeScript, Vitest, Tailwind.

## Global Constraints

- **This is NOT stock Next.js** — read the relevant guide in `node_modules/next/dist/docs/` before writing route/page code. Route handlers receive `{ params: Promise<...> }` — always `await params`.
- **Supabase is the single source of truth for redemption AND choice state.** Never derive either outside Postgres.
- **Token writes must be atomic** — single UPDATE with a WHERE guard, never read-then-write. A double redemption or a changed-after-lock choice is a correctness failure.
- **Service-role key only in server routes.** Never import `createServiceClient` into a client component.
- **Never log token values.**
- **The `/gift/[token]` and `/api/gift/[token]/choose` routes are intentionally public** — the token is a UUID v4. They must never reveal redemption state beyond the existing "Already Claimed" screen.
- **Scope:** multi-gift = 2+ options. Single-gift (1 option) and no-gift (0) campaigns keep their exact current behavior.
- Migration filenames follow the `2024MMDD0000NN_` sequence; next free is `20240621000028`.
- Audit actions use `logAuditEvent` from `@/lib/audit`.

## Pre-existing Test Baseline (READ BEFORE STARTING)

The suite is **already partly red** before any work here: 13 API test files fail (32 tests), because routes gained auth/multi-gift since those tests were written. Failing files include `verify.test.ts`, `send.test.ts`, `resend.test.ts`, `tokens.test.ts`, `campaigns.test.ts`, and others. **Do not try to fix all of them** — out of scope. This plan only rewrites `verify.test.ts` (which it touches) and adds new test files. When you run the full suite, expect the unrelated pre-existing failures to remain; only verify that *your* new/edited tests pass.

Baseline command (capture the failing count before you start):
```bash
npx vitest run 2>&1 | tail -3
```

---

## File Structure

- `supabase/migrations/20240621000028_gift_chosen_at.sql` — new column (create)
- `.github/workflows/migrate.yml` — idempotent patch line (modify)
- `src/types/index.ts` — `GiftToken.gift_chosen_at`, `TokenVerifyResult.giftName` (modify)
- `src/app/api/gift/[token]/choose/route.ts` — public atomic choice lock (create)
- `tests/api/gift-choose.test.ts` — choose route tests (create)
- `src/app/gift/[token]/page.tsx` — branch into picker vs QR (modify)
- `src/components/gift/GiftPicker.tsx` — client picker (create)
- `src/app/api/verify/[token]/route.ts` — key off stored gift_id, return giftName (modify)
- `tests/api/verify.test.ts` — full rewrite for current route shape (modify)
- `src/app/scan/page.tsx` — show gift name on success (modify)
- `src/app/api/campaigns/[id]/tokens/[tokenId]/gift/route.ts` — admin override (create)
- `tests/api/token-gift.test.ts` — admin override tests (create)
- `src/lib/gift-distribution.ts` — pure distribution helper (create)
- `tests/lib/gift-distribution.test.ts` — helper tests (create)
- `src/components/admin/GiftBreakdown.tsx` — count choices not redemptions (modify)
- `src/components/admin/EmployeeTable.tsx` — admin-editable gift cell (modify)
- `src/app/admin/campaigns/[id]/page.tsx` — pass `canEditGift` (modify)

---

## Task 1: Schema — `gift_chosen_at` column

**Files:**
- Create: `supabase/migrations/20240621000028_gift_chosen_at.sql`
- Modify: `.github/workflows/migrate.yml` (idempotent patch block, after line 91)

Migrations are not unit-tested in this repo. Verification is: the SQL is valid and the column is additive/idempotent.

- [ ] **Step 1: Create the migration file**

`supabase/migrations/20240621000028_gift_chosen_at.sql`:
```sql
-- Decouple gift choice from redemption: timestamp set when the employee
-- (or an admin) picks a gift, independent of whether it has been redeemed.
ALTER TABLE gift_tokens
  ADD COLUMN IF NOT EXISTS gift_chosen_at TIMESTAMPTZ;
```

- [ ] **Step 2: Add the matching idempotent patch line to the workflow**

In `.github/workflows/migrate.yml`, inside the `Apply idempotent schema patches` heredoc, immediately after the existing line:
```sql
ALTER TABLE gift_tokens ADD COLUMN IF NOT EXISTS gift_id UUID REFERENCES campaign_gifts(id) ON DELETE SET NULL;
```
add:
```sql
ALTER TABLE gift_tokens ADD COLUMN IF NOT EXISTS gift_chosen_at TIMESTAMPTZ;
```

- [ ] **Step 3: Sanity-check no syntax typos**

Run: `grep -n "gift_chosen_at" supabase/migrations/20240621000028_gift_chosen_at.sql .github/workflows/migrate.yml`
Expected: three matches (1 in migration, 2 — comment+SQL — in workflow; at minimum the migration line and the workflow line).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20240621000028_gift_chosen_at.sql .github/workflows/migrate.yml
git commit -m "feat(db): add gift_tokens.gift_chosen_at for pre-scan gift choice"
```

---

## Task 2: Type updates

**Files:**
- Modify: `src/types/index.ts:40-67`

**Interfaces:**
- Produces: `GiftToken.gift_chosen_at: string | null`; `TokenVerifyResult` success variants gain `giftName?: string | null`.

- [ ] **Step 1: Add `gift_chosen_at` to `GiftToken`**

In `src/types/index.ts`, in the `GiftToken` type, after the `gift_id: string | null` line add:
```typescript
  gift_chosen_at: string | null
```

- [ ] **Step 2: Add `giftName` to the success variants of `TokenVerifyResult`**

Replace the two `valid: true` lines so they read:
```typescript
export type TokenVerifyResult =
  | { valid: true; employeeName: string; needsGiftSelection?: false; giftName?: string | null }
  | { valid: true; employeeName: string; needsGiftSelection: true; gifts: GiftOption[] }
  | { valid: false; reason: 'already_used'; employeeName: string }
  | { valid: false; reason: 'invalid' }
  | { valid: false; reason: 'campaign_closed' }
  | { valid: false; reason: 'not_authorized' }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `src/types/index.ts`. (Pre-existing errors elsewhere, if any, are out of scope — confirm none are in files this task touched.)

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): gift_chosen_at and verify giftName"
```

---

## Task 3: Public choice route — `POST /api/gift/[token]/choose`

**Files:**
- Create: `src/app/api/gift/[token]/choose/route.ts`
- Test: `tests/api/gift-choose.test.ts`

**Interfaces:**
- Consumes: `createServiceClient` from `@/lib/supabase/server`.
- Produces: `POST` handler. Request body `{ giftId: string }`. Responses: `{ ok: true, locked: boolean, gift: { id, name } }`, or `{ ok: false, error }` with status 400/404.

- [ ] **Step 1: Write the failing test**

`tests/api/gift-choose.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockTokenSingle = vi.fn()
const mockGiftSingle = vi.fn()
const mockLockSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'campaign_gifts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ single: mockGiftSingle }),
              single: mockGiftSingle,
            }),
          }),
        }
      }
      // gift_tokens
      return {
        select: () => ({ eq: () => ({ single: mockTokenSingle }) }),
        update: () => ({
          eq: () => ({
            is: () => ({
              eq: () => ({ select: () => ({ single: mockLockSingle }) }),
            }),
          }),
        }),
      }
    },
  }),
}))

function makeRequest(token: string, giftId: unknown) {
  return new NextRequest(`http://localhost/api/gift/${token}/choose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ giftId }),
  })
}

describe('POST /api/gift/[token]/choose', () => {
  beforeEach(() => vi.clearAllMocks())

  it('400 when giftId missing', async () => {
    const { POST } = await import('@/app/api/gift/[token]/choose/route')
    const res = await POST(makeRequest('t', undefined), { params: Promise.resolve({ token: 't' }) })
    expect(res.status).toBe(400)
  })

  it('404 when token does not exist', async () => {
    mockTokenSingle.mockResolvedValue({ data: null })
    const { POST } = await import('@/app/api/gift/[token]/choose/route')
    const res = await POST(makeRequest('t', 'g-1'), { params: Promise.resolve({ token: 't' }) })
    expect(res.status).toBe(404)
  })

  it('400 when gift does not belong to campaign', async () => {
    mockTokenSingle.mockResolvedValue({ data: { campaign_id: 'c-1', gift_id: null, redeemed: false } })
    mockGiftSingle.mockResolvedValue({ data: null })
    const { POST } = await import('@/app/api/gift/[token]/choose/route')
    const res = await POST(makeRequest('t', 'g-x'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('invalid_gift')
  })

  it('locks the choice on first pick', async () => {
    mockTokenSingle.mockResolvedValue({ data: { campaign_id: 'c-1', gift_id: null, redeemed: false } })
    mockGiftSingle.mockResolvedValue({ data: { id: 'g-1', name: 'Headphones' } })
    mockLockSingle.mockResolvedValue({ data: { gift_id: 'g-1' } })
    const { POST } = await import('@/app/api/gift/[token]/choose/route')
    const res = await POST(makeRequest('t', 'g-1'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.locked).toBe(false)
    expect(body.gift).toEqual({ id: 'g-1', name: 'Headphones' })
  })

  it('returns locked:true when a choice already exists (no change allowed)', async () => {
    mockTokenSingle.mockResolvedValue({ data: { campaign_id: 'c-1', gift_id: 'g-2', redeemed: false } })
    mockGiftSingle.mockResolvedValue({ data: { id: 'g-2', name: 'Mug' } })
    const { POST } = await import('@/app/api/gift/[token]/choose/route')
    const res = await POST(makeRequest('t', 'g-1'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.locked).toBe(true)
    expect(body.gift).toEqual({ id: 'g-2', name: 'Mug' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/api/gift-choose.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/gift/[token]/choose/route'`.

- [ ] **Step 3: Write the route**

`src/app/api/gift/[token]/choose/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = await request.json().catch(() => ({}))
  const giftId: string | null = body.giftId ?? null
  if (!giftId) {
    return NextResponse.json({ ok: false, error: 'giftId required' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: tokenRow } = await service
    .from('gift_tokens')
    .select('campaign_id, gift_id, redeemed')
    .eq('token', token)
    .single()

  if (!tokenRow) {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 404 })
  }

  // Validate the chosen gift belongs to this token's campaign
  const { data: gift } = await service
    .from('campaign_gifts')
    .select('id, name')
    .eq('id', giftId)
    .eq('campaign_id', tokenRow.campaign_id)
    .single()

  if (!gift) {
    return NextResponse.json({ ok: false, error: 'invalid_gift' }, { status: 400 })
  }

  // Already chosen or already redeemed -> locked. Return the effective choice.
  if (tokenRow.gift_id || tokenRow.redeemed) {
    const effectiveId = tokenRow.gift_id ?? giftId
    const { data: current } = await service
      .from('campaign_gifts')
      .select('id, name')
      .eq('id', effectiveId)
      .single()
    return NextResponse.json({ ok: true, locked: true, gift: current ?? gift })
  }

  // Atomic lock: first writer wins
  const { data: locked } = await service
    .from('gift_tokens')
    .update({ gift_id: giftId, gift_chosen_at: new Date().toISOString() })
    .eq('token', token)
    .is('gift_id', null)
    .eq('redeemed', false)
    .select('gift_id')
    .single()

  if (!locked) {
    // Race: another request locked it first -> re-read and return that choice
    const { data: row } = await service
      .from('gift_tokens')
      .select('gift_id')
      .eq('token', token)
      .single()
    const chosenId = row?.gift_id ?? giftId
    const { data: g } = await service
      .from('campaign_gifts')
      .select('id, name')
      .eq('id', chosenId)
      .single()
    return NextResponse.json({ ok: true, locked: true, gift: g ?? gift })
  }

  return NextResponse.json({ ok: true, locked: false, gift })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/api/gift-choose.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/gift/[token]/choose/route.ts tests/api/gift-choose.test.ts
git commit -m "feat(gift): public atomic gift-choice lock route"
```

---

## Task 4: Employee gift page — picker then QR

**Files:**
- Modify: `src/app/gift/[token]/page.tsx`
- Create: `src/components/gift/GiftPicker.tsx`

**Interfaces:**
- Consumes: `POST /api/gift/[token]/choose` (Task 3) → `{ ok, locked, gift: { id, name } }`.
- Produces: page renders picker for unchosen multi-gift tokens; QR otherwise.

This is UI; verification is build + lint + manual. No new unit test (no component-test harness in this repo).

- [ ] **Step 1: Create the client picker component**

`src/components/gift/GiftPicker.tsx`:
```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const GIFT_COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#14b8a6', '#f43f5e', '#f97316']

type Gift = { id: string; name: string }

export function GiftPicker({ token, gifts }: { token: string; gifts: Gift[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choose(giftId: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/gift/${token}/choose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftId }),
      })
      const data = await res.json()
      if (!data.ok) {
        setError('Could not save your choice. Please try again.')
        setBusy(false)
        return
      }
      // Re-render the server page, which now shows the locked choice + QR.
      router.refresh()
    } catch {
      setError('Could not save your choice. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-500 mb-2">Choose your gift</p>
      {gifts.map((gift, i) => (
        <button
          key={gift.id}
          onClick={() => choose(gift.id)}
          disabled={busy}
          className="w-full py-4 rounded-2xl text-white text-lg font-semibold disabled:opacity-50 active:scale-95 transition-transform"
          style={{ backgroundColor: GIFT_COLORS[i % GIFT_COLORS.length] }}
        >
          {gift.name}
        </button>
      ))}
      {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Rewire the page to fetch gifts + branch**

Replace the body of `src/app/gift/[token]/page.tsx` with:
```typescript
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { GiftPicker } from '@/components/gift/GiftPicker'

export default async function GiftQrPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const service = createServiceClient()

  const { data: tokenRow } = await service
    .from('gift_tokens')
    .select('employee_name, redeemed, qr_image_url, gift_id, campaign_id, campaigns(name)')
    .eq('token', token)
    .single()

  if (!tokenRow) return notFound()

  const campaign = tokenRow.campaigns as unknown as { name: string } | null

  if (tokenRow.redeemed) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-zinc-100 px-6">
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">&#10005;</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-900 mb-1">Already Claimed</h1>
          <p className="text-sm text-zinc-500">This gift has already been redeemed.</p>
        </div>
      </main>
    )
  }

  const { data: giftRows } = await service
    .from('campaign_gifts')
    .select('id, name, position')
    .eq('campaign_id', tokenRow.campaign_id)
    .order('position', { ascending: true })

  const gifts = giftRows ?? []
  const isMultiGift = gifts.length >= 2
  const needsChoice = isMultiGift && !tokenRow.gift_id
  const chosenGift = tokenRow.gift_id ? gifts.find((g) => g.id === tokenRow.gift_id) ?? null : null

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 to-violet-50 px-6">
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 max-w-sm w-full text-center">
        <h1 className="text-2xl font-bold text-zinc-900 mb-1">{tokenRow.employee_name}</h1>
        {campaign && <p className="text-sm text-zinc-500 mb-6">{campaign.name}</p>}

        {needsChoice ? (
          <GiftPicker token={token} gifts={gifts.map((g) => ({ id: g.id, name: g.name }))} />
        ) : (
          <>
            {chosenGift && (
              <p className="text-sm font-medium text-indigo-600 mb-4">
                Your gift: {chosenGift.name}
              </p>
            )}
            {tokenRow.qr_image_url ? (
              <img
                src={tokenRow.qr_image_url}
                alt="Gift QR code"
                width={280}
                height={280}
                className="mx-auto rounded-lg"
              />
            ) : (
              <div className="w-[280px] h-[280px] bg-zinc-100 rounded-lg flex items-center justify-center mx-auto">
                <p className="text-zinc-400 text-sm">QR code not available</p>
              </div>
            )}
            <p className="text-sm text-zinc-500 mt-6">
              Show this QR code to a distributor to collect your gift.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Build + lint**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors in `src/app/gift/[token]/page.tsx` or `src/components/gift/GiftPicker.tsx`.

- [ ] **Step 4: Manual verification**

Start the app (`npm run dev`). For a token in a 2+ gift campaign that hasn't chosen: opening `/gift/<token>` shows the picker and no QR. Tap a gift → page refreshes to "Your gift: X" + QR. Reload → still shows the locked choice + QR (no picker). For a single-gift/no-gift campaign token → QR shown immediately. Confirm, then proceed.

- [ ] **Step 5: Commit**

```bash
git add src/app/gift/[token]/page.tsx src/components/gift/GiftPicker.tsx
git commit -m "feat(gift): employee picks gift on link page before QR is shown"
```

---

## Task 5: Verify route — key off stored gift_id, return gift name

**Files:**
- Modify: `src/app/api/verify/[token]/route.ts`
- Modify (full rewrite): `tests/api/verify.test.ts`

**Interfaces:**
- Consumes: `TokenVerifyResult.giftName` (Task 2).
- Produces: success response `{ valid: true, employeeName, giftName }`. `needsGiftSelection` now only when `gifts.length >= 2` AND token has no stored `gift_id` AND no `giftId` supplied.

- [ ] **Step 1: Rewrite the test for the current route shape**

Replace the entire contents of `tests/api/verify.test.ts` with:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockTokenSelectSingle = vi.fn()
const mockDistributorSelect = vi.fn()
const mockGiftsOrder = vi.fn()
const mockUpdateSingle = vi.fn()

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'campaign_distributors') {
        return { select: () => ({ eq: mockDistributorSelect }) }
      }
      if (table === 'campaign_gifts') {
        return { select: () => ({ eq: () => ({ order: mockGiftsOrder }) }) }
      }
      // gift_tokens
      return {
        select: () => ({ eq: () => ({ single: mockTokenSelectSingle }) }),
        update: () => ({
          eq: () => ({ eq: () => ({ select: () => ({ single: mockUpdateSingle }) }) }),
        }),
      }
    },
  }),
}))

function makeRequest(token: string, body: Record<string, unknown> = {}) {
  return new NextRequest(`http://localhost/api/verify/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const openToken = {
  id: 't-1',
  employee_name: 'Omer',
  redeemed: false,
  campaign_id: 'c-1',
  gift_id: null,
  campaigns: { closed_at: null, company_id: 'co-1', name: 'Hanukkah' },
}

describe('POST /api/verify/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'dist-1', app_metadata: { role_name: 'company_admin' } } } })
    mockDistributorSelect.mockResolvedValue({ data: [], error: null })
    mockGiftsOrder.mockResolvedValue({ data: [], error: null })
  })

  it('not_authorized when no authenticated user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('not_authorized')
  })

  it('invalid when token does not exist', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('x'), { params: Promise.resolve({ token: 'x' }) })
    const body = await res.json()
    expect(body.reason).toBe('invalid')
  })

  it('campaign_closed when campaign is closed', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: { ...openToken, campaigns: { ...openToken.campaigns, closed_at: '2026-04-10' } } })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.reason).toBe('campaign_closed')
  })

  it('already_used when token already redeemed', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: { ...openToken, redeemed: true, employee_name: 'Dana' } })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.reason).toBe('already_used')
    expect(body.employeeName).toBe('Dana')
  })

  it('needsGiftSelection when 2+ gifts and none chosen', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: openToken })
    mockGiftsOrder.mockResolvedValue({ data: [
      { id: 'g-1', name: 'Headphones', position: 0 },
      { id: 'g-2', name: 'Mug', position: 1 },
    ], error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.needsGiftSelection).toBe(true)
    expect(body.gifts).toHaveLength(2)
  })

  it('redeems with stored gift and returns giftName', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: { ...openToken, gift_id: 'g-1' } })
    mockGiftsOrder.mockResolvedValue({ data: [
      { id: 'g-1', name: 'Headphones', position: 0 },
      { id: 'g-2', name: 'Mug', position: 1 },
    ], error: null })
    mockUpdateSingle.mockResolvedValue({ data: { employee_name: 'Omer' } })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.needsGiftSelection).toBeFalsy()
    expect(body.giftName).toBe('Headphones')
  })

  it('auto-stamps the single gift when exactly one option', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: openToken })
    mockGiftsOrder.mockResolvedValue({ data: [{ id: 'g-1', name: 'Mug', position: 0 }], error: null })
    mockUpdateSingle.mockResolvedValue({ data: { employee_name: 'Omer' } })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.giftName).toBe('Mug')
  })

  it('redeems a no-gift campaign with null giftName', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: openToken })
    mockUpdateSingle.mockResolvedValue({ data: { employee_name: 'Omer' } })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.giftName ?? null).toBeNull()
  })

  it('already_used on race (atomic update returns no row)', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: openToken })
    mockUpdateSingle.mockResolvedValue({ data: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.reason).toBe('already_used')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/api/verify.test.ts`
Expected: FAIL — the route does not yet add `gift_id` to its select nor return `giftName`; e.g. `redeems with stored gift` and `auto-stamps` assertions on `giftName` fail.

- [ ] **Step 3: Modify the route**

In `src/app/api/verify/[token]/route.ts`:

(a) Add `gift_id` to the initial token select (line ~29):
```typescript
    .select('id, employee_name, redeemed, campaign_id, gift_id, campaigns(closed_at, company_id, name)')
```

(b) Replace the block from the gift-options fetch through the success return (currently lines ~84-134) with:
```typescript
  // Fetch gift options for this campaign (also gives us names for the response)
  const { data: campaignGifts } = await supabase
    .from('campaign_gifts')
    .select('id, name, position')
    .eq('campaign_id', tokenRow.campaign_id)
    .order('position', { ascending: true })

  const gifts = campaignGifts ?? []
  const storedGiftId = (tokenRow as { gift_id: string | null }).gift_id

  // Multi-gift with no employee choice and no scanner pick -> fall back to scanner selection
  if (gifts.length >= 2 && !storedGiftId && !giftId) {
    return NextResponse.json({
      valid: true,
      needsGiftSelection: true,
      employeeName: tokenRow.employee_name,
      gifts: gifts.map((g) => ({ id: g.id, name: g.name, position: g.position })),
    })
  }

  // Resolution order: employee's stored choice > scanner pick > single auto-stamp > none
  const resolvedGiftId = storedGiftId ?? giftId ?? (gifts.length === 1 ? gifts[0].id : null)

  const updatePayload: {
    redeemed: true
    redeemed_at: string
    redeemed_by: string
    gift_id: string | null
    gift_chosen_at?: string
  } = {
    redeemed: true,
    redeemed_at: new Date().toISOString(),
    redeemed_by: distributorId,
    gift_id: resolvedGiftId,
  }
  // Stamp choice time only when we are recording a gift the employee hadn't pre-chosen
  if (!storedGiftId && resolvedGiftId) {
    updatePayload.gift_chosen_at = new Date().toISOString()
  }

  // Atomic write: first writer wins
  const { data: redeemed } = await supabase
    .from('gift_tokens')
    .update(updatePayload)
    .eq('token', token)
    .eq('redeemed', false)
    .select('employee_name')
    .single()

  if (redeemed) {
    const giftName = resolvedGiftId
      ? gifts.find((g) => g.id === resolvedGiftId)?.name ?? null
      : null
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
    return NextResponse.json({ valid: true, employeeName: redeemed.employee_name, giftName })
  }

  // Race condition: another request redeemed it between our read and write
  return NextResponse.json({
    valid: false,
    reason: 'already_used',
    employeeName: tokenRow.employee_name,
  })
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/api/verify.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/verify/[token]/route.ts tests/api/verify.test.ts
git commit -m "feat(verify): redeem with employee-chosen gift, return gift name"
```

---

## Task 6: Scan screen — show the gift name on success

**Files:**
- Modify: `src/app/scan/page.tsx:413-417` (the success branch of the result takeover)

UI change; verification is build + lint + manual.

- [ ] **Step 1: Show the gift name as primary text**

In `src/app/scan/page.tsx`, replace the success block:
```tsx
                {result.valid ? (
                  <>
                    <p className="text-white text-4xl font-bold text-center px-8">{result.employeeName}</p>
                    <p className="text-white/80 text-lg">{t('Gift collected')}</p>
                  </>
                ) : result.reason === 'campaign_closed' ? (
```
with:
```tsx
                {result.valid ? (
                  <>
                    {result.giftName ? (
                      <>
                        <p className="text-white text-4xl font-bold text-center px-8">{result.giftName}</p>
                        <p className="text-white/80 text-lg">{result.employeeName}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-white text-4xl font-bold text-center px-8">{result.employeeName}</p>
                        <p className="text-white/80 text-lg">{t('Gift collected')}</p>
                      </>
                    )}
                  </>
                ) : result.reason === 'campaign_closed' ? (
```

- [ ] **Step 2: Build + lint**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors in `src/app/scan/page.tsx`. (`result.giftName` is valid per the Task 2 type.)

- [ ] **Step 3: Manual verification**

In a multi-gift campaign where an employee has chosen, scanning their QR shows the **gift name** large with the employee name beneath, and the token is redeemed. For a no-gift campaign, the success screen still shows the employee name + "Gift collected".

- [ ] **Step 4: Commit**

```bash
git add src/app/scan/page.tsx
git commit -m "feat(scan): show chosen gift name to distributor on redeem"
```

---

## Task 7: Admin override route

**Files:**
- Create: `src/app/api/campaigns/[id]/tokens/[tokenId]/gift/route.ts`
- Test: `tests/api/token-gift.test.ts`

**Interfaces:**
- Consumes: `createClient`, `createServiceClient`, `fetchPermissions`, `hasPermission`, `resolveCompanyId`, `logAuditEvent`.
- Produces: `PATCH` handler. Body `{ giftId: string | null }`. Response `{ ok: true, gift_id }` or error with 401/403/404/400.

- [ ] **Step 1: Write the failing test**

`tests/api/token-gift.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockCampaignSingle = vi.fn()
const mockGiftSingle = vi.fn()
const mockUpdateSingle = vi.fn()

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }))
vi.mock('@/lib/platform-auth', () => ({ resolveCompanyId: vi.fn(async () => 'co-1') }))
vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn(async () => ['campaigns:launch']),
  hasPermission: (perms: string[], p: string) => perms.includes(p),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'campaigns') {
        return { select: () => ({ eq: () => ({ eq: () => ({ single: mockCampaignSingle }) }) }) }
      }
      if (table === 'campaign_gifts') {
        return { select: () => ({ eq: () => ({ eq: () => ({ single: mockGiftSingle }) }) }) }
      }
      // gift_tokens
      return {
        update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ single: mockUpdateSingle }) }) }) }),
      }
    },
  }),
}))

function makeRequest(giftId: unknown) {
  return new NextRequest('http://localhost/api/campaigns/c-1/tokens/t-1/gift', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ giftId }),
  })
}
const ctx = { params: Promise.resolve({ id: 'c-1', tokenId: 't-1' }) }

describe('PATCH /api/campaigns/[id]/tokens/[tokenId]/gift', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1', app_metadata: { role_id: 'r-1', role_name: 'company_admin' } } } })
    mockCampaignSingle.mockResolvedValue({ data: { id: 'c-1' } })
    mockGiftSingle.mockResolvedValue({ data: { id: 'g-1' } })
    mockUpdateSingle.mockResolvedValue({ data: { id: 't-1', gift_id: 'g-1' } })
  })

  it('401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/gift/route')
    const res = await PATCH(makeRequest('g-1'), ctx)
    expect(res.status).toBe(401)
  })

  it('404 when campaign not in caller company', async () => {
    mockCampaignSingle.mockResolvedValue({ data: null })
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/gift/route')
    const res = await PATCH(makeRequest('g-1'), ctx)
    expect(res.status).toBe(404)
  })

  it('400 when gift not in campaign', async () => {
    mockGiftSingle.mockResolvedValue({ data: null })
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/gift/route')
    const res = await PATCH(makeRequest('g-x'), ctx)
    expect(res.status).toBe(400)
  })

  it('sets the gift and returns gift_id', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/gift/route')
    const res = await PATCH(makeRequest('g-1'), ctx)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.gift_id).toBe('g-1')
  })

  it('clears the gift when giftId is null', async () => {
    mockUpdateSingle.mockResolvedValue({ data: { id: 't-1', gift_id: null } })
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/gift/route')
    const res = await PATCH(makeRequest(null), ctx)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.gift_id).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/api/token-gift.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the route**

`src/app/api/campaigns/[id]/tokens/[tokenId]/gift/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { resolveCompanyId } from '@/lib/platform-auth'
import { logAuditEvent } from '@/lib/audit'
import type { JwtAppMetadata } from '@/types'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tokenId: string }> }
) {
  const { id: campaignId, tokenId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)
  if (!hasPermission(permissions, 'campaigns:launch')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const giftId: string | null = body.giftId ?? null

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (giftId) {
    const { data: gift } = await service
      .from('campaign_gifts')
      .select('id')
      .eq('id', giftId)
      .eq('campaign_id', campaignId)
      .single()
    if (!gift) return NextResponse.json({ error: 'invalid_gift' }, { status: 400 })
  }

  // Admin override is allowed anytime, including after redemption.
  const { data: updated } = await service
    .from('gift_tokens')
    .update({ gift_id: giftId, gift_chosen_at: new Date().toISOString() })
    .eq('id', tokenId)
    .eq('campaign_id', campaignId)
    .select('id, gift_id')
    .single()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  logAuditEvent({
    companyId,
    actorId: user.id,
    action: 'token.gift_changed',
    resourceType: 'gift_token',
    resourceId: tokenId,
    metadata: { gift_id: giftId },
  })

  return NextResponse.json({ ok: true, gift_id: updated.gift_id })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/api/token-gift.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/campaigns/[id]/tokens/[tokenId]/gift/route.ts" tests/api/token-gift.test.ts
git commit -m "feat(admin): PATCH route to override a token's gift anytime"
```

---

## Task 8: Admin-editable gift cell in the employee table

**Files:**
- Modify: `src/app/admin/campaigns/[id]/page.tsx` (compute + pass `canEditGift`)
- Modify: `src/components/admin/EmployeeTable.tsx` (render dropdown when editable)

UI change; verification is build + lint + manual.

**Interfaces:**
- Consumes: `PATCH /api/campaigns/[id]/tokens/[tokenId]/gift` (Task 7).
- Produces: `EmployeeTable` accepts `canEditGift?: boolean`.

- [ ] **Step 1: Compute and pass `canEditGift` from the page**

In `src/app/admin/campaigns/[id]/page.tsx`, add imports near the top:
```typescript
import { fetchPermissions, hasPermission } from '@/lib/permissions'
```
After `const appMeta = user.app_metadata as JwtAppMetadata`, add:
```typescript
  const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)
  const canEditGift = hasPermission(permissions, 'campaigns:launch')
```
Then add `canEditGift={canEditGift}` to **both** `<EmployeeTable ... />` usages (the draft render ~line 164 and the sent render ~line 197).

- [ ] **Step 2: Accept the prop and render an editable cell**

In `src/components/admin/EmployeeTable.tsx`:

(a) Add `canEditGift = false` to the destructured props and its type (near the existing `gifts = []` at line ~99 and the type at line ~104):
```typescript
  canEditGift = false,
```
```typescript
  canEditGift?: boolean
```

(b) Add a handler inside the component (after `giftMap` at line ~116):
```typescript
  async function changeGift(tokenId: string, giftId: string) {
    await fetch(`/api/campaigns/${campaignId}/tokens/${tokenId}/gift`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ giftId: giftId || null }),
    })
    // Realtime UPDATE subscription already refreshes the table rows.
  }
```

(c) Create a small cell renderer near the top of the file (module scope, below `GIFT_COLORS`):
```typescript
function GiftCell({
  giftId,
  gifts,
  giftMap,
  editable,
  onChange,
}: {
  giftId: string | null
  gifts: { id: string; name: string }[]
  giftMap: Map<string, { name: string; color: string }>
  editable: boolean
  onChange: (giftId: string) => void
}) {
  if (editable) {
    return (
      <select
        value={giftId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs border border-zinc-200 rounded-md px-1.5 py-1 bg-white max-w-[10rem]"
      >
        <option value="">—</option>
        {gifts.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
    )
  }
  if (giftId && giftMap.get(giftId)) {
    return (
      <span
        className="inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white"
        style={{ backgroundColor: giftMap.get(giftId)!.color }}
      >
        {giftMap.get(giftId)!.name}
      </span>
    )
  }
  return <span className="text-zinc-300">—</span>
}
```

(d) Replace the two inline gift-badge `<td>` bodies (grouped path ~lines 308-316 and flat path ~lines 377-385) so each renders:
```tsx
                          <td className="px-3 py-1.5">
                            <GiftCell
                              giftId={row.gift_id}
                              gifts={gifts}
                              giftMap={giftMap}
                              editable={canEditGift}
                              onChange={(giftId) => changeGift(row.id, giftId)}
                            />
                          </td>
```
(use `r` instead of `row` in the flat path to match that block's variable name).

- [ ] **Step 3: Build + lint**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors in `EmployeeTable.tsx` or the campaign page.

- [ ] **Step 4: Manual verification**

As a company admin, open a multi-gift campaign detail page. The Gift column shows a dropdown per row. Changing it calls the PATCH route; the badge/value updates (via realtime) and persists on reload — including for already-redeemed rows. As a scanner (no `campaigns:launch`), the column shows read-only badges.

- [ ] **Step 5: Commit**

```bash
git add "src/app/admin/campaigns/[id]/page.tsx" src/components/admin/EmployeeTable.tsx
git commit -m "feat(admin): editable gift cell with anytime override"
```

---

## Task 9: Pre-scan distribution — count choices, not just redemptions

**Files:**
- Create: `src/lib/gift-distribution.ts`
- Test: `tests/lib/gift-distribution.test.ts`
- Modify: `src/components/admin/GiftBreakdown.tsx`

**Interfaces:**
- Produces: `giftDistribution(gifts, tokens)` → `{ rows: { id, name, count, pct }[], unchosen: number, total: number }`.

Currently `GiftBreakdown` counts only `redeemed` tokens and hides when none are redeemed — so HR can't see distribution before scanning. This task switches it to count tokens that have a `gift_id` (the employee's choice), via a pure, tested helper.

- [ ] **Step 1: Write the failing helper test**

`tests/lib/gift-distribution.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { giftDistribution } from '@/lib/gift-distribution'

const gifts = [
  { id: 'g-1', name: 'Headphones', position: 0 },
  { id: 'g-2', name: 'Mug', position: 1 },
]

describe('giftDistribution', () => {
  it('counts chosen gifts regardless of redemption', () => {
    const tokens = [
      { gift_id: 'g-1' },
      { gift_id: 'g-1' },
      { gift_id: 'g-2' },
      { gift_id: null },
    ]
    const { rows, unchosen, total } = giftDistribution(gifts, tokens)
    expect(total).toBe(4)
    expect(unchosen).toBe(1)
    expect(rows.find((r) => r.id === 'g-1')!.count).toBe(2)
    expect(rows.find((r) => r.id === 'g-2')!.count).toBe(1)
    expect(rows.find((r) => r.id === 'g-1')!.pct).toBe(50)
  })

  it('handles an empty token list', () => {
    const { rows, unchosen, total } = giftDistribution(gifts, [])
    expect(total).toBe(0)
    expect(unchosen).toBe(0)
    expect(rows.every((r) => r.count === 0 && r.pct === 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/lib/gift-distribution.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the helper**

`src/lib/gift-distribution.ts`:
```typescript
import type { GiftOption } from '@/types'

export type GiftDistToken = { gift_id: string | null }
export type GiftDistRow = { id: string; name: string; count: number; pct: number }

export function giftDistribution(
  gifts: GiftOption[],
  tokens: GiftDistToken[]
): { rows: GiftDistRow[]; unchosen: number; total: number } {
  const total = tokens.length
  const counts = new Map<string, number>()
  let unchosen = 0
  for (const t of tokens) {
    if (t.gift_id) counts.set(t.gift_id, (counts.get(t.gift_id) ?? 0) + 1)
    else unchosen++
  }
  const rows = gifts.map((g) => {
    const count = counts.get(g.id) ?? 0
    return { id: g.id, name: g.name, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }
  })
  return { rows, unchosen, total }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/lib/gift-distribution.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Rewrite `GiftBreakdown` to use the helper**

Replace `src/components/admin/GiftBreakdown.tsx` with:
```tsx
'use client'

import { useT } from '@/lib/i18n/useT'
import type { GiftOption } from '@/types'
import { giftDistribution } from '@/lib/gift-distribution'

const GIFT_COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#14b8a6', '#f43f5e', '#f97316']

type TokenSlice = { redeemed: boolean; gift_id: string | null }

type Props = {
  gifts: GiftOption[]
  tokens: TokenSlice[]
}

export function GiftBreakdown({ gifts, tokens }: Props) {
  const t = useT()
  if (gifts.length < 2 || tokens.length === 0) return null

  const { rows, unchosen, total } = giftDistribution(gifts, tokens)

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h2 className="font-semibold text-zinc-900 mb-3">{t('Gift Breakdown')}</h2>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={row.id} className="flex items-center gap-3">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: GIFT_COLORS[i % GIFT_COLORS.length] }}
            />
            <span className="flex-1 text-sm text-zinc-700 truncate">{row.name}</span>
            <span className="text-sm font-medium text-zinc-900 tabular-nums">{row.count}</span>
            <span className="text-xs text-zinc-400 w-10 text-right tabular-nums">{row.pct}%</span>
          </div>
        ))}
        {unchosen > 0 && (
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-300 flex-shrink-0" />
            <span className="flex-1 text-sm text-zinc-400">{t('Not chosen yet')}</span>
            <span className="text-sm font-medium text-zinc-400 tabular-nums">{unchosen}</span>
            <span className="text-xs text-zinc-300 w-10 text-right tabular-nums">
              {total > 0 ? Math.round((unchosen / total) * 100) : 0}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Build + lint + run the new tests**

Run: `npm run lint && npx tsc --noEmit && npx vitest run tests/lib/gift-distribution.test.ts`
Expected: no errors; 2 tests pass.

- [ ] **Step 7: Manual verification**

In a multi-gift campaign where some employees have chosen but **nobody has scanned yet**, the campaign detail page's Gift Breakdown shows per-gift counts plus a "Not chosen yet" row. Confirm the totals update as employees pick.

- [ ] **Step 8: Commit**

```bash
git add src/lib/gift-distribution.ts tests/lib/gift-distribution.test.ts src/components/admin/GiftBreakdown.tsx
git commit -m "feat(admin): gift breakdown counts choices, visible pre-scan"
```

---

## Final verification

- [ ] **Run the touched tests together:**

Run: `npx vitest run tests/api/gift-choose.test.ts tests/api/verify.test.ts tests/api/token-gift.test.ts tests/lib/gift-distribution.test.ts`
Expected: all pass.

- [ ] **Full typecheck + lint:**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors in any file this plan created or modified.

- [ ] **Confirm the pre-existing failures are unchanged:**

Run: `npx vitest run 2>&1 | tail -3`
Expected: the only newly-green files are the four above; the unrelated pre-existing failures (Baseline section) remain — this plan does not address them.

---

## Spec coverage check

- Employee picks gift on `/gift/[token]` before QR → Tasks 3, 4.
- Choice locks; employee can't change → Task 3 (atomic `is('gift_id', null)` guard + idempotent locked response).
- Admin can change anytime, even post-redemption → Tasks 7, 8 (unconditional UPDATE).
- Campaign page shows who chose what → Task 8 (editable/visible Gift column; column already existed).
- Distribution visible before scanning → Task 9 (count choices, not redemptions).
- Distributor sees chosen gift at scan; fallback when unchosen → Tasks 5, 6.
- Single/no-gift campaigns unaffected → Tasks 4, 5 gated on `gifts.length >= 2`.
- `gift_chosen_at` column → Tasks 1, 2.
