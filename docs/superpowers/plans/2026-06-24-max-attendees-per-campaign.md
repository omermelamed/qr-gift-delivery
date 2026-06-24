# Max Attendees Per Campaign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin set a per-campaign maximum headcount so an employee cannot RSVP for more people than allowed in Arrival Certificates mode.

**Architecture:** A nullable `max_attendee_count` column on `campaigns` (NULL = no limit). The RSVP API enforces the cap server-side; the RSVP form caps/validates as UX only. Admins set the value via the existing arrival-certificates toggle area on the campaign detail page (pre-send only), through a loosened campaigns PATCH route. The admin attendance-override route is intentionally left unbounded.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + service-role client), TypeScript, Vitest, Tailwind, custom `useT` i18n.

## Global Constraints

- The cap counts **total people including the employee** — `max_attendee_count = 5` ⇒ employee + up to 4 guests. Consistent with `attendee_count`.
- `max_attendee_count` is nullable; **`NULL` = no limit**. Existing campaigns must be unaffected.
- The cap applies to **employee self-RSVP only** (`POST /api/gift/[token]/rsvp`). The admin attendance override (`PATCH …/tokens/[tokenId]/attendance`) stays **unbounded** — do not touch it.
- Config is mutable **only while the campaign is unsent** (`sent_at IS NULL`) — the existing PATCH `409` guard must keep holding.
- Lowering the max is **not retroactive**: never modify rows that already RSVP'd above a newly-lowered max.
- Admin label copy must make clear the count **includes the employee**: `"Max people per invite (including the employee)"`, helper `"e.g. 5 = the person plus up to 4 guests."`
- `useT()` has **no interpolation** — for number-bearing strings, store the key with a literal `{n}` and substitute with `.replace('{n}', String(n))`.
- Validation rule for the max everywhere: an integer `>= 1`, or `null` to clear. Reject `0`, negatives, and non-integers.
- Never expose the service-role key client-side; all DB writes stay in API routes (already the case in the files touched).

---

### Task 1: Schema migration + campaign type

**Files:**
- Create: `supabase/migrations/20240624000030_campaign_max_attendees.sql`
- Modify: `src/types/index.ts:38` (add field to the campaign type)

**Interfaces:**
- Produces: `campaigns.max_attendee_count` (`INT`, nullable, `>= 1` when set); the campaign TS type gains `max_attendee_count: number | null`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20240624000030_campaign_max_attendees.sql`:

```sql
-- Per-campaign cap on RSVP headcount for Arrival Certificates mode.
-- NULL = no limit. Counts TOTAL people including the employee, matching
-- gift_tokens.attendee_count.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS max_attendee_count INT;

ALTER TABLE campaigns
  ADD CONSTRAINT max_attendee_count_positive
  CHECK (max_attendee_count IS NULL OR max_attendee_count >= 1);
```

- [ ] **Step 2: Add the field to the campaign type**

In `src/types/index.ts`, add to the campaign type after line 38 (`supports_arrival_certificates: boolean`):

```ts
  supports_arrival_certificates: boolean
  max_attendee_count: number | null
```

- [ ] **Step 3: Verify the type compiles**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/types/index.ts` (pre-existing unrelated errors, if any, are out of scope — note them but don't fix).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20240624000030_campaign_max_attendees.sql src/types/index.ts
git commit -m "feat(db): add campaigns.max_attendee_count column + type"
```

---

### Task 2: Enforce the cap in the RSVP API

**Files:**
- Modify: `src/app/api/gift/[token]/rsvp/route.ts`
- Test: `tests/api/gift-rsvp.test.ts`

**Interfaces:**
- Consumes: `campaigns.max_attendee_count` from Task 1 (selected via the join).
- Produces: `POST /api/gift/[token]/rsvp` returns `400 { ok: false, error: 'over_limit', max: <number> }` when `attending` and `attendeeCount > max_attendee_count` (and the max is non-null). All existing responses unchanged.

- [ ] **Step 1: Write the failing tests**

In `tests/api/gift-rsvp.test.ts`, the existing `supportedOpen` fixture (line 29) has no `max_attendee_count`; add per-test fixtures. Append these tests inside the `describe` block (before the closing `})` at line 139):

```ts
  it('400 over_limit when coming with more than the campaign max', async () => {
    mockTokenSingle.mockResolvedValue({
      data: { redeemed: false, campaigns: { supports_arrival_certificates: true, closed_at: null, max_attendee_count: 4 } },
    })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 5 }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('over_limit')
    expect(body.max).toBe(4)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('accepts a count exactly at the campaign max', async () => {
    mockTokenSingle.mockResolvedValue({
      data: { redeemed: false, campaigns: { supports_arrival_certificates: true, closed_at: null, max_attendee_count: 4 } },
    })
    mockUpdateSingle.mockResolvedValue({ data: { attending: true, attendee_count: 4 } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 4 }), { params: Promise.resolve({ token: 't' }) })
    expect(await res.json()).toEqual({ ok: true, attending: true, attendeeCount: 4 })
  })

  it('allows any count when the campaign max is null', async () => {
    mockTokenSingle.mockResolvedValue({
      data: { redeemed: false, campaigns: { supports_arrival_certificates: true, closed_at: null, max_attendee_count: null } },
    })
    mockUpdateSingle.mockResolvedValue({ data: { attending: true, attendee_count: 99 } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 99 }), { params: Promise.resolve({ token: 't' }) })
    expect(await res.json()).toEqual({ ok: true, attending: true, attendeeCount: 99 })
  })

  it('ignores the max when not coming', async () => {
    mockTokenSingle.mockResolvedValue({
      data: { redeemed: false, campaigns: { supports_arrival_certificates: true, closed_at: null, max_attendee_count: 1 } },
    })
    mockUpdateSingle.mockResolvedValue({ data: { attending: false, attendee_count: null } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: false, attendeeCount: 9 }), { params: Promise.resolve({ token: 't' }) })
    expect(await res.json()).toEqual({ ok: true, attending: false, attendeeCount: null })
  })
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run tests/api/gift-rsvp.test.ts -t over_limit`
Expected: FAIL — the route does not yet return `over_limit` (the over-limit body would currently save and return `ok: true`).

- [ ] **Step 3: Implement the cap check**

In `src/app/api/gift/[token]/rsvp/route.ts`:

Change the campaign select (line 20) to include the new column:

```ts
    .select('redeemed, campaigns(supports_arrival_certificates, closed_at, max_attendee_count)')
```

Widen the campaign cast (lines 28-29) to include the field:

```ts
  const campaign = tokenRow.campaigns as unknown as
    { supports_arrival_certificates: boolean; closed_at: string | null; max_attendee_count: number | null } | null
```

In the `if (attending) { ... }` block, after the existing `attendeeCount = raw` assignment (line 48) and before the block closes, add the cap check:

```ts
    attendeeCount = raw
    const max = campaign.max_attendee_count
    if (max !== null && raw > max) {
      return NextResponse.json({ ok: false, error: 'over_limit', max }, { status: 400 })
    }
```

- [ ] **Step 4: Run the full RSVP test file to verify pass**

Run: `npx vitest run tests/api/gift-rsvp.test.ts`
Expected: PASS — all new and existing tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/gift/[token]/rsvp/route.ts tests/api/gift-rsvp.test.ts
git commit -m "feat(rsvp): enforce per-campaign max attendee count"
```

---

### Task 3: Accept `maxAttendeeCount` in the campaigns PATCH route

**Files:**
- Modify: `src/app/api/campaigns/[id]/route.ts:78-115` (the PATCH body parsing + update + audit)
- Test: `tests/api/campaign-patch.test.ts`

**Interfaces:**
- Consumes: `campaigns.max_attendee_count` from Task 1.
- Produces: `PATCH /api/campaigns/[id]` accepts a **partial** body with `supportsArrivalCertificates?: boolean` and/or `maxAttendeeCount?: number | null`. Maps to `supports_arrival_certificates` / `max_attendee_count`. Returns `400 { error: 'invalid_max' }` for a bad max, `400` when neither field is present, and keeps the existing `401/403/404/409` behaviour. Success still returns `{ ok: true }`.

- [ ] **Step 1: Write the failing tests**

In `tests/api/campaign-patch.test.ts`, replace the existing `'returns 400 when the flag is not a boolean'` test (lines 54-58) with the broadened validation tests below, and add the max-update tests. Add these inside the `describe` block:

```ts
  it('returns 400 when the flag is present but not a boolean', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ supportsArrivalCertificates: 'yes' }), params)
    expect(res.status).toBe(400)
  })

  it('returns 400 when no recognized field is provided', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ foo: 1 }), params)
    expect(res.status).toBe(400)
  })

  it('returns 400 invalid_max for a non-integer max', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    for (const bad of [0, -1, 2.5, 'x']) {
      const res = await PATCH(makeRequest({ maxAttendeeCount: bad }), params)
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('invalid_max')
    }
  })

  it('updates only the max on a draft campaign', async () => {
    const update = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }))
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update,
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ maxAttendeeCount: 5 }), params)
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ max_attendee_count: 5 })
  })

  it('clears the max when maxAttendeeCount is null', async () => {
    const update = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }))
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update,
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ maxAttendeeCount: null }), params)
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ max_attendee_count: null })
  })
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run tests/api/campaign-patch.test.ts`
Expected: FAIL — the route currently requires `supportsArrivalCertificates` to be a boolean and rejects max-only bodies.

- [ ] **Step 3: Implement partial-update parsing**

In `src/app/api/campaigns/[id]/route.ts`, replace the body parsing + validation block (lines 78-82):

```ts
  const body = await request.json().catch(() => ({}))
  const { supportsArrivalCertificates } = body
  if (typeof supportsArrivalCertificates !== 'boolean') {
    return NextResponse.json({ error: 'supportsArrivalCertificates must be a boolean' }, { status: 400 })
  }
```

with:

```ts
  const body = await request.json().catch(() => ({}))
  const update: { supports_arrival_certificates?: boolean; max_attendee_count?: number | null } = {}

  if ('supportsArrivalCertificates' in body) {
    if (typeof body.supportsArrivalCertificates !== 'boolean') {
      return NextResponse.json({ error: 'supportsArrivalCertificates must be a boolean' }, { status: 400 })
    }
    update.supports_arrival_certificates = body.supportsArrivalCertificates
  }

  if ('maxAttendeeCount' in body) {
    const raw = body.maxAttendeeCount
    if (raw !== null && (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1)) {
      return NextResponse.json({ error: 'invalid_max' }, { status: 400 })
    }
    update.max_attendee_count = raw
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No recognized fields to update' }, { status: 400 })
  }
```

Replace the `.update({ supports_arrival_certificates: supportsArrivalCertificates })` call (line 100) with:

```ts
    .update(update)
```

Replace the audit metadata (line 114) `metadata: { supports_arrival_certificates: supportsArrivalCertificates },` with:

```ts
    metadata: update,
```

- [ ] **Step 4: Run the full PATCH test file to verify pass**

Run: `npx vitest run tests/api/campaign-patch.test.ts`
Expected: PASS — including the unchanged 401/403/404/409 and the original flag-update test (which now asserts `update` called with `{ supports_arrival_certificates: true }`).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/[id]/route.ts tests/api/campaign-patch.test.ts
git commit -m "feat(campaigns): accept maxAttendeeCount in PATCH (partial update)"
```

---

### Task 4: i18n strings

**Files:**
- Modify: `src/lib/i18n/translations.he.ts` (add to the arrival-certificates group near line 23-29)

**Interfaces:**
- Produces: Hebrew translations for the new admin label/helper and the RSVP over-limit copy. Keys are the exact English strings used as `t(...)` arguments in Tasks 5 and 6. Number-bearing keys use a literal `{n}` placeholder.

- [ ] **Step 1: Add the translations**

In `src/lib/i18n/translations.he.ts`, after the line `'Save response': 'שמירת תשובה',` (line 29), add:

```ts
  'Max people per invite (including the employee)': 'מקסימום אנשים להזמנה (כולל העובד)',
  'e.g. 5 = the person plus up to 4 guests.': 'לדוגמה: 5 = האדם בתוספת עד 4 אורחים.',
  'No limit': 'ללא הגבלה',
  'Up to {n} people': 'עד {n} אנשים',
  'You can bring up to {n} people.': 'ניתן להגיע עד {n} אנשים.',
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors (the file is a `Record<string, string>`; new entries are valid).

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n/translations.he.ts
git commit -m "i18n(he): max-attendees admin + rsvp strings"
```

---

### Task 5: Admin config UI in the toggle area

**Files:**
- Modify: `src/components/admin/ArrivalCertToggle.tsx`
- Modify: `src/app/admin/campaigns/[id]/page.tsx:50` (select) and `:167` (pass `initialMax`)

**Interfaces:**
- Consumes: PATCH `maxAttendeeCount` contract from Task 3; i18n keys from Task 4; `campaigns.max_attendee_count` from Task 1.
- Produces: `ArrivalCertToggle` gains an `initialMax: number | null` prop and, when enabled, a number input that PATCHes `{ maxAttendeeCount }`.

- [ ] **Step 1: Add `max_attendee_count` to the campaign select**

In `src/app/admin/campaigns/[id]/page.tsx`, change the campaign select (line 50) to include the column:

```ts
      .select('id, name, campaign_date, sent_at, closed_at, supports_arrival_certificates, max_attendee_count')
```

- [ ] **Step 2: Pass `initialMax` to the toggle**

In the same file, update the `ArrivalCertToggle` usage (line 167):

```tsx
              <ArrivalCertToggle
                campaignId={campaign.id}
                initial={campaign.supports_arrival_certificates}
                initialMax={campaign.max_attendee_count}
              />
```

- [ ] **Step 3: Add the max input to the toggle component**

Rewrite `src/components/admin/ArrivalCertToggle.tsx` to add the `initialMax` prop, local state, a `saveMax` handler, and a conditional number input shown when `enabled`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

export function ArrivalCertToggle({
  campaignId,
  initial,
  initialMax,
}: {
  campaignId: string
  initial: boolean
  initialMax: number | null
}) {
  const t = useT()
  const router = useRouter()
  const [enabled, setEnabled] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [maxValue, setMaxValue] = useState<string>(initialMax != null ? String(initialMax) : '')

  async function patch(payload: object, onError: () => void) {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) onError()
      else router.refresh()
    } catch {
      onError()
    }
  }

  async function toggle() {
    if (busy) return
    const next = !enabled
    setBusy(true)
    setEnabled(next)
    await patch({ supportsArrivalCertificates: next }, () => setEnabled(!next))
    setBusy(false)
  }

  async function saveMax() {
    // Empty = no limit (null). Otherwise an integer >= 1; bad input reverts.
    const trimmed = maxValue.trim()
    let payloadMax: number | null
    if (trimmed === '') {
      payloadMax = null
    } else {
      const n = Number(trimmed)
      if (!Number.isInteger(n) || n < 1) {
        setMaxValue(initialMax != null ? String(initialMax) : '')
        return
      }
      payloadMax = n
    }
    setBusy(true)
    await patch({ maxAttendeeCount: payloadMax }, () => {
      setMaxValue(initialMax != null ? String(initialMax) : '')
    })
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-3 bg-white rounded-2xl border border-zinc-200 shadow-sm p-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={toggle}
          className="mt-0.5 w-4 h-4 accent-indigo-500"
        />
        <span>
          <span className="block text-sm font-medium text-zinc-900">{t('Supports Arrival Certificates')}</span>
          <span className="block text-xs text-zinc-500">{t('Let people confirm attendance and how many are coming.')}</span>
        </span>
      </label>

      {enabled && (
        <div className="flex flex-col gap-1.5 ps-7">
          <label htmlFor="max-attendees" className="text-sm font-medium text-zinc-700">
            {t('Max people per invite (including the employee)')}
          </label>
          <input
            id="max-attendees"
            type="number"
            min={1}
            step={1}
            value={maxValue}
            disabled={busy}
            placeholder={t('No limit')}
            onChange={(e) => setMaxValue(e.target.value)}
            onBlur={saveMax}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            className="w-32 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <span className="text-xs text-zinc-500">{t('e.g. 5 = the person plus up to 4 guests.')}</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify it compiles and lints**

Run: `npx tsc --noEmit && npx eslint src/components/admin/ArrivalCertToggle.tsx src/app/admin/campaigns/[id]/page.tsx`
Expected: no new errors.

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev`, open an **unsent** arrival-certificates campaign, enable the toggle, type `5` in "Max people per invite", blur, and reload — the value persists. Clear it → reload → empty (no limit). (No automated UI test, consistent with the existing toggle/cells.)

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/ArrivalCertToggle.tsx "src/app/admin/campaigns/[id]/page.tsx"
git commit -m "feat(admin): set per-campaign max attendees in the arrival toggle"
```

---

### Task 6: Cap + validate in the employee RSVP form

**Files:**
- Modify: `src/components/gift/ArrivalRsvp.tsx`
- Modify: `src/components/gift/GiftRedemptionView.tsx` (thread `maxCount` prop)
- Modify: `src/app/gift/[token]/page.tsx` (select + pass `maxCount`)

**Interfaces:**
- Consumes: i18n keys from Task 4; the RSVP API `over_limit` response from Task 2; `campaigns.max_attendee_count` from Task 1.
- Produces: `ArrivalRsvp` gains `maxCount: number | null`; `GiftRedemptionView` gains `maxCount: number | null`; both gift-page render branches pass `maxCount`.

- [ ] **Step 1: Thread `max_attendee_count` through the gift page**

In `src/app/gift/[token]/page.tsx`:

Change the select (line 15) to include the column in the join:

```ts
    .select('employee_name, redeemed, qr_image_url, gift_id, campaign_id, attending, attendee_count, campaigns(name, supports_arrival_certificates, max_attendee_count)')
```

Widen the campaign cast (line 21):

```ts
  const campaign = tokenRow.campaigns as unknown as { name: string; supports_arrival_certificates: boolean; max_attendee_count: number | null } | null
```

Add a derived value after line 22 (`const supportsArrival = ...`):

```ts
  const maxCount = campaign?.max_attendee_count ?? null
```

Add `maxCount={maxCount}` to **both** `<GiftRedemptionView ...>` usages — in the redeemed branch (after line 37 `attendeeCount={tokenRow.attendee_count}`) and the main branch (after line 65):

```tsx
        attendeeCount={tokenRow.attendee_count}
        maxCount={maxCount}
```

- [ ] **Step 2: Thread `maxCount` through GiftRedemptionView**

In `src/components/gift/GiftRedemptionView.tsx`:

Add to `Props` (after line 21 `attendeeCount: number | null`):

```ts
  attendeeCount: number | null
  maxCount: number | null
```

Add to the destructured params (after line 35 `attendeeCount,`):

```ts
  attendeeCount,
  maxCount,
```

Pass it to `ArrivalRsvp` (in the `<ArrivalRsvp ...>` block around line 65, after `initialCount={attendeeCount}`):

```tsx
            initialCount={attendeeCount}
            maxCount={maxCount}
```

- [ ] **Step 3: Cap + validate in ArrivalRsvp**

In `src/components/gift/ArrivalRsvp.tsx`:

Add `maxCount` to `Props` (after line 11 `initialCount: number | null`):

```ts
  initialCount: number | null
  maxCount: number | null
```

Add it to the destructured params (line 14):

```ts
export function ArrivalRsvp({ token, initialAttending, initialCount, maxCount, onSubmitted }: Props) {
```

In `submit()`, inside the `if (attending) { ... }` block, after the existing `< 1` check that sets `attendeeCount = n` (lines 26-31), add the client-side cap check:

```ts
      attendeeCount = n
      if (maxCount !== null && n > maxCount) {
        setError(t('You can bring up to {n} people.').replace('{n}', String(maxCount)))
        return
      }
```

In the response-handling block, replace the generic-error branch (lines 42-46) so a server `over_limit` shows the specific message:

```ts
      const data = await res.json()
      if (!data.ok) {
        if (data.error === 'over_limit') {
          setError(t('You can bring up to {n} people.').replace('{n}', String(data.max)))
        } else {
          setError(t('Could not save your response. Please try again.'))
        }
        setBusy(false)
        return
      }
```

Add `max` to the number input and helper text. Replace the input element (lines 80-88) and add helper text below it:

```tsx
          <input
            id="attendee-count"
            type="number"
            min={1}
            max={maxCount ?? undefined}
            step={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {maxCount !== null && (
            <span className="text-xs text-zinc-500">
              {t('Up to {n} people').replace('{n}', String(maxCount))}
            </span>
          )}
```

- [ ] **Step 4: Verify it compiles and lints**

Run: `npx tsc --noEmit && npx eslint src/components/gift/ArrivalRsvp.tsx src/components/gift/GiftRedemptionView.tsx src/app/gift/[token]/page.tsx`
Expected: no new errors.

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev` (if not already running). Open a gift token for an arrival-certificates campaign whose max is `4`. The count field shows "Up to 4 people"; entering `5` and submitting shows "You can bring up to 4 people." and does not save; entering `4` saves and reveals the QR. For a campaign with no max, the field behaves as before.

- [ ] **Step 6: Commit**

```bash
git add src/components/gift/ArrivalRsvp.tsx src/components/gift/GiftRedemptionView.tsx "src/app/gift/[token]/page.tsx"
git commit -m "feat(rsvp): cap and validate attendee count in the RSVP form"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — all tests, including the extended `gift-rsvp` and `campaign-patch` files.

- [ ] **Step 2: Type + lint the whole project**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors introduced by this work.

- [ ] **Step 3: Confirm the migration applies cleanly**

Apply the migration against your local Supabase (e.g. `supabase db reset` or the project's migration command) and confirm `campaigns.max_attendee_count` exists and the `max_attendee_count_positive` constraint rejects `0`. If the local Supabase stack isn't available in this environment, note that and defer to the reviewer.

- [ ] **Step 4: Final commit (if anything was adjusted)**

```bash
git add -A
git commit -m "test: verify max-attendees feature end-to-end" || echo "nothing to commit"
```
