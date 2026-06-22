# Arrival Certificates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional per-campaign RSVP layer ("Arrival Certificates" / אישור הגעה) where attendees confirm coming/not-coming + a headcount, with admin reporting of approved-count and total-arriving — without changing campaigns that don't opt in.

**Architecture:** A default-`false` `campaigns.supports_arrival_certificates` flag gates all new behavior. RSVP state lives on `gift_tokens` (`attending`, `attendee_count`, `responded_at`). The attendee answers via a new unauthenticated `POST /api/gift/[token]/rsvp` route (idempotent overwrite, locked once redeemed). For opt-in campaigns the gift QR is gated behind a "coming" answer. Admin totals are **derived** by re-aggregating tokens on each read (a pure `summarizeArrival` helper), so updates need no counter reconciliation.

**Tech Stack:** Next.js App Router (see `node_modules/next/dist/docs/` before writing route/page code — this Next.js differs from training data), Supabase (Postgres + service-role client), TypeScript, Vitest, Tailwind, project i18n (`useT` / `translations.he.ts`).

## Global Constraints

- This is NOT standard Next.js — read the relevant guide in `node_modules/next/dist/docs/` before writing any route/page code.
- Supabase is the single source of truth for redemption AND attendance state; never derive/store totals outside Supabase (re-aggregate on read).
- Token redemption path (`/api/verify`, `/scan`) is deliberately untouched — do not modify it.
- Service-role key only in server-side routes; never in client components.
- Never log token values.
- Backward compatibility: `supports_arrival_certificates` defaults to `FALSE`; campaigns that don't opt in must behave exactly as today.
- Headcount (`attendee_count`) includes the person themselves: alone = `1`, with spouse = `2`.
- DB CHECK enforces validation: `attending = TRUE` ⇒ `attendee_count >= 1`; any other state ⇒ `attendee_count IS NULL`.
- UI strings go through `useT()`; add Hebrew to `src/lib/i18n/translations.he.ts`.
- Run tests with `npm test` (`vitest run`).

---

### Task 1: Schema migration + types

**Files:**
- Create: `supabase/migrations/20240622000029_arrival_certificates.sql`
- Modify: `src/types/index.ts:27-54` (Campaign and GiftToken types)

**Interfaces:**
- Produces: `Campaign.supports_arrival_certificates: boolean`; `GiftToken.attending: boolean | null`, `GiftToken.attendee_count: number | null`, `GiftToken.responded_at: string | null`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20240622000029_arrival_certificates.sql`:

```sql
-- Arrival Certificates (אישור הגעה): optional per-campaign RSVP layer.
-- Opt-in flag defaults FALSE so existing campaigns are unaffected.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS supports_arrival_certificates BOOLEAN NOT NULL DEFAULT FALSE;

-- Attendance response lives on the per-employee token row.
--   attending      NULL  = no response yet, TRUE = coming, FALSE = not coming
--   attendee_count headcount INCLUDING the person; required iff attending = TRUE
ALTER TABLE gift_tokens
  ADD COLUMN IF NOT EXISTS attending      BOOLEAN,
  ADD COLUMN IF NOT EXISTS attendee_count INT,
  ADD COLUMN IF NOT EXISTS responded_at   TIMESTAMPTZ;

ALTER TABLE gift_tokens
  ADD CONSTRAINT attendee_count_consistency CHECK (
    (attending = TRUE AND attendee_count IS NOT NULL AND attendee_count >= 1) OR
    (attending IS DISTINCT FROM TRUE AND attendee_count IS NULL)
  );
```

- [ ] **Step 2: Update the types**

In `src/types/index.ts`, add to `Campaign` (after `scheduled_confirmed_at`):

```ts
  scheduled_confirmed_at: string | null
  supports_arrival_certificates: boolean
}
```

Add to `GiftToken` (after `gift_chosen_at`):

```ts
  gift_chosen_at: string | null
  attending: boolean | null
  attendee_count: number | null
  responded_at: string | null
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20240622000029_arrival_certificates.sql src/types/index.ts
git commit -m "feat(arrival): schema + types for arrival certificates"
```

---

### Task 2: `summarizeArrival` totals helper (pure, TDD)

**Files:**
- Create: `src/lib/arrival.ts`
- Test: `tests/lib/arrival.test.ts`

**Interfaces:**
- Produces: `summarizeArrival(rows: { attending: boolean | null; attendee_count: number | null }[]): { approved: number; totalArriving: number; notComing: number; noResponse: number }`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/arrival.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { summarizeArrival } from '@/lib/arrival'

describe('summarizeArrival', () => {
  it('counts approved people and sums attendee counts (1, 2, 4 => 3 / 7)', () => {
    const rows = [
      { attending: true, attendee_count: 1 },
      { attending: true, attendee_count: 2 },
      { attending: true, attendee_count: 4 },
    ]
    expect(summarizeArrival(rows)).toEqual({ approved: 3, totalArriving: 7, notComing: 0, noResponse: 0 })
  })

  it('separates not-coming and no-response, ignoring their counts', () => {
    const rows = [
      { attending: true, attendee_count: 2 },
      { attending: false, attendee_count: null },
      { attending: null, attendee_count: null },
    ]
    expect(summarizeArrival(rows)).toEqual({ approved: 1, totalArriving: 2, notComing: 1, noResponse: 1 })
  })

  it('reflects an updated answer (not-coming -> coming with 2) in the totals', () => {
    // Same person after update: row now coming with 2.
    const afterUpdate = [{ attending: true, attendee_count: 2 }]
    expect(summarizeArrival(afterUpdate)).toEqual({ approved: 1, totalArriving: 2, notComing: 0, noResponse: 0 })
  })

  it('returns zeros for an empty campaign', () => {
    expect(summarizeArrival([])).toEqual({ approved: 0, totalArriving: 0, notComing: 0, noResponse: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/arrival.test.ts`
Expected: FAIL — cannot find module `@/lib/arrival`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/arrival.ts`:

```ts
type ArrivalRow = { attending: boolean | null; attendee_count: number | null }

export type ArrivalSummary = {
  approved: number
  totalArriving: number
  notComing: number
  noResponse: number
}

export function summarizeArrival(rows: ArrivalRow[]): ArrivalSummary {
  let approved = 0
  let totalArriving = 0
  let notComing = 0
  let noResponse = 0
  for (const r of rows) {
    if (r.attending === true) {
      approved++
      totalArriving += r.attendee_count ?? 0
    } else if (r.attending === false) {
      notComing++
    } else {
      noResponse++
    }
  }
  return { approved, totalArriving, notComing, noResponse }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/arrival.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/arrival.ts tests/lib/arrival.test.ts
git commit -m "feat(arrival): summarizeArrival totals helper"
```

---

### Task 3: RSVP API route (TDD)

**Files:**
- Create: `src/app/api/gift/[token]/rsvp/route.ts`
- Test: `tests/api/gift-rsvp.test.ts`

**Interfaces:**
- Consumes: `createServiceClient` from `@/lib/supabase/server`.
- Produces: `POST(request, { params: Promise<{ token: string }> })`. Request body `{ attending: boolean, attendeeCount?: number }`. Responses: success `{ ok: true, attending, attendeeCount }`; errors `{ ok: false, error }` with statuses — `invalid` 400/404, `not_supported` 400, `campaign_closed` 409, `invalid_count` 400, `locked` 409.

- [ ] **Step 1: Write the failing test**

Create `tests/api/gift-rsvp.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockTokenSingle = vi.fn()
const mockUpdateSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: mockTokenSingle }) }),
      update: () => ({
        eq: () => ({
          eq: () => ({ select: () => ({ single: mockUpdateSingle }) }),
        }),
      }),
    }),
  }),
}))

function makeRequest(token: string, body: unknown) {
  return new NextRequest(`http://localhost/api/gift/${token}/rsvp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const supportedOpen = { redeemed: false, campaigns: { supports_arrival_certificates: true, closed_at: null } }

describe('POST /api/gift/[token]/rsvp', () => {
  beforeEach(() => vi.clearAllMocks())

  it('400 when attending is not a boolean', async () => {
    mockTokenSingle.mockResolvedValue({ data: supportedOpen })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: 'yes' }), { params: Promise.resolve({ token: 't' }) })
    expect(res.status).toBe(400)
  })

  it('404 when token does not exist', async () => {
    mockTokenSingle.mockResolvedValue({ data: null })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 1 }), { params: Promise.resolve({ token: 't' }) })
    expect(res.status).toBe(404)
  })

  it('400 not_supported when campaign has arrival certificates disabled', async () => {
    mockTokenSingle.mockResolvedValue({ data: { redeemed: false, campaigns: { supports_arrival_certificates: false, closed_at: null } } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 1 }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('not_supported')
  })

  it('409 campaign_closed when the campaign is closed', async () => {
    mockTokenSingle.mockResolvedValue({ data: { redeemed: false, campaigns: { supports_arrival_certificates: true, closed_at: '2026-06-01T00:00:00Z' } } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: false }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.error).toBe('campaign_closed')
  })

  it('409 locked when the token is already redeemed', async () => {
    mockTokenSingle.mockResolvedValue({ data: { redeemed: true, campaigns: { supports_arrival_certificates: true, closed_at: null } } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 2 }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.error).toBe('locked')
  })

  it('400 invalid_count when coming without a count', async () => {
    mockTokenSingle.mockResolvedValue({ data: supportedOpen })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('invalid_count')
  })

  it('400 invalid_count when count is below 1', async () => {
    mockTokenSingle.mockResolvedValue({ data: supportedOpen })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 0 }), { params: Promise.resolve({ token: 't' }) })
    expect((await res.json()).error).toBe('invalid_count')
  })

  it('saves a coming response with the attendee count', async () => {
    mockTokenSingle.mockResolvedValue({ data: supportedOpen })
    mockUpdateSingle.mockResolvedValue({ data: { attending: true, attendee_count: 2 } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 2 }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body).toEqual({ ok: true, attending: true, attendeeCount: 2 })
  })

  it('saves a not-coming response with a null count', async () => {
    mockTokenSingle.mockResolvedValue({ data: supportedOpen })
    mockUpdateSingle.mockResolvedValue({ data: { attending: false, attendee_count: null } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: false, attendeeCount: 5 }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body).toEqual({ ok: true, attending: false, attendeeCount: null })
  })

  it('updates not-coming -> coming with a count', async () => {
    mockTokenSingle.mockResolvedValue({ data: supportedOpen })
    mockUpdateSingle.mockResolvedValue({ data: { attending: true, attendee_count: 2 } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: true, attendeeCount: 2 }), { params: Promise.resolve({ token: 't' }) })
    expect((await res.json())).toEqual({ ok: true, attending: true, attendeeCount: 2 })
  })

  it('updates coming -> not-coming, clearing the count', async () => {
    mockTokenSingle.mockResolvedValue({ data: supportedOpen })
    mockUpdateSingle.mockResolvedValue({ data: { attending: false, attendee_count: null } })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: false }), { params: Promise.resolve({ token: 't' }) })
    expect((await res.json())).toEqual({ ok: true, attending: false, attendeeCount: null })
  })

  it('409 locked when the write loses the redeemed race (0 rows)', async () => {
    mockTokenSingle.mockResolvedValue({ data: supportedOpen })
    mockUpdateSingle.mockResolvedValue({ data: null })
    const { POST } = await import('@/app/api/gift/[token]/rsvp/route')
    const res = await POST(makeRequest('t', { attending: false }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(res.status).toBe(409)
    expect(body.error).toBe('locked')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/api/gift-rsvp.test.ts`
Expected: FAIL — cannot find module `@/app/api/gift/[token]/rsvp/route`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/api/gift/[token]/rsvp/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = await request.json().catch(() => ({}))
  const attending: unknown = body.attending

  if (typeof attending !== 'boolean') {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: tokenRow } = await service
    .from('gift_tokens')
    .select('redeemed, campaigns(supports_arrival_certificates, closed_at)')
    .eq('token', token)
    .single()

  if (!tokenRow) {
    return NextResponse.json({ ok: false, error: 'invalid' }, { status: 404 })
  }

  const campaign = tokenRow.campaigns as unknown as
    { supports_arrival_certificates: boolean; closed_at: string | null } | null

  if (!campaign?.supports_arrival_certificates) {
    return NextResponse.json({ ok: false, error: 'not_supported' }, { status: 400 })
  }
  if (campaign.closed_at) {
    return NextResponse.json({ ok: false, error: 'campaign_closed' }, { status: 409 })
  }
  if (tokenRow.redeemed) {
    return NextResponse.json({ ok: false, error: 'locked' }, { status: 409 })
  }

  // Count is required and positive only when coming; cleared otherwise.
  let attendeeCount: number | null = null
  if (attending) {
    const raw = body.attendeeCount
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
      return NextResponse.json({ ok: false, error: 'invalid_count' }, { status: 400 })
    }
    attendeeCount = raw
  }

  // Idempotent overwrite: latest answer replaces the previous one.
  // WHERE redeemed = false keeps the lock-once-redeemed guarantee atomic.
  const { data: updated } = await service
    .from('gift_tokens')
    .update({
      attending,
      attendee_count: attendeeCount,
      responded_at: new Date().toISOString(),
    })
    .eq('token', token)
    .eq('redeemed', false)
    .select('attending, attendee_count')
    .single()

  if (!updated) {
    // Redeemed between the read above and this write.
    return NextResponse.json({ ok: false, error: 'locked' }, { status: 409 })
  }

  return NextResponse.json({
    ok: true,
    attending: updated.attending,
    attendeeCount: updated.attendee_count,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/api/gift-rsvp.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/gift/[token]/rsvp/route.ts tests/api/gift-rsvp.test.ts
git commit -m "feat(arrival): RSVP API route with validation and redeemed lock"
```

---

### Task 4: Campaign config API — extend POST, add PATCH (TDD)

**Files:**
- Modify: `src/app/api/campaigns/route.ts:86-110` (POST: accept and persist the flag)
- Modify: `src/app/api/campaigns/[id]/route.ts` (add PATCH)
- Test: `tests/api/campaigns.test.ts` (add POST flag case), `tests/api/campaign-patch.test.ts` (new)

**Interfaces:**
- Consumes: `createClient`, `createServiceClient`, `fetchPermissions`, `hasPermission`, `resolveCompanyId`, `logAuditEvent`, `JwtAppMetadata` (already imported in those files).
- Produces: `POST /api/campaigns` accepts `supportsArrivalCertificates?: boolean`; `PATCH /api/campaigns/[id]` with body `{ supportsArrivalCertificates: boolean }` → `{ ok: true }`, errors `400/401/403/404/409`.

- [ ] **Step 1: Write the failing PATCH test**

Create `tests/api/campaign-patch.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({ from: mockFromService }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['campaigns:launch']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/campaigns/c-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = { params: Promise.resolve({ id: 'c-1' }) }

describe('PATCH /api/campaigns/[id]', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', app_metadata: { company_id: 'company-1', role_id: 'role-1', role_name: 'company_admin' } } },
    })
  })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ supportsArrivalCertificates: true }), params)
    expect(res.status).toBe(401)
  })

  it('returns 403 when missing permission', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ supportsArrivalCertificates: true }), params)
    expect(res.status).toBe(403)
  })

  it('returns 400 when the flag is not a boolean', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ supportsArrivalCertificates: 'yes' }), params)
    expect(res.status).toBe(400)
  })

  it('returns 409 when the campaign was already sent', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: '2026-06-01T00:00:00Z' } }) }) }) }),
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ supportsArrivalCertificates: true }), params)
    expect(res.status).toBe(409)
  })

  it('updates the flag on a draft campaign', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ supportsArrivalCertificates: true }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/api/campaign-patch.test.ts`
Expected: FAIL — `PATCH` is not exported from the route.

- [ ] **Step 3: Add the PATCH handler**

In `src/app/api/campaigns/[id]/route.ts`, append a `PATCH` export (the imports `createClient, createServiceClient`, `fetchPermissions, hasPermission`, `logAuditEvent`, `JwtAppMetadata`, `resolveCompanyId` already exist at the top of the file):

```ts
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

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
  const { supportsArrivalCertificates } = body
  if (typeof supportsArrivalCertificates !== 'boolean') {
    return NextResponse.json({ error: 'supportsArrivalCertificates must be a boolean' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, sent_at')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.sent_at) {
    return NextResponse.json({ error: 'Cannot change settings on a campaign that has already been sent' }, { status: 409 })
  }

  const { error: updateError } = await service
    .from('campaigns')
    .update({ supports_arrival_certificates: supportsArrivalCertificates })
    .eq('id', campaignId)
    .eq('company_id', companyId)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
  }

  logAuditEvent({
    companyId: companyId,
    actorId: user.id,
    action: 'campaign.updated',
    resourceType: 'campaign',
    resourceId: campaignId,
    metadata: { supports_arrival_certificates: supportsArrivalCertificates },
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Extend POST /api/campaigns to persist the flag**

In `src/app/api/campaigns/route.ts`, change the body destructure (line ~87) and the insert (line ~102):

```ts
  const body = await request.json().catch(() => ({}))
  const { name, campaignDate, supportsArrivalCertificates } = body
```

```ts
  const { data, error } = await service
    .from('campaigns')
    .insert({
      name: name.trim(),
      campaign_date: campaignDate,
      company_id: companyId,
      created_by: user.id,
      supports_arrival_certificates: supportsArrivalCertificates === true,
    })
    .select('id')
    .single()
```

- [ ] **Step 5: Add a POST flag assertion**

In `tests/api/campaigns.test.ts`, inside `describe('POST /api/campaigns')`, add:

```ts
  it('persists supportsArrivalCertificates on create', async () => {
    const insert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'campaign-new' }, error: null }) }) }))
    mockFromService.mockReturnValue({ insert })
    const { POST } = await import('@/app/api/campaigns/route')
    const res = await POST(makeRequest({ name: 'Gala 2026', campaignDate: '2026-04-30', supportsArrivalCertificates: true }))
    expect(res.status).toBe(201)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ supports_arrival_certificates: true }))
  })
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/api/campaign-patch.test.ts tests/api/campaigns.test.ts`
Expected: PASS (existing campaign tests + new PATCH and flag tests).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/campaigns/route.ts src/app/api/campaigns/[id]/route.ts tests/api/campaign-patch.test.ts tests/api/campaigns.test.ts
git commit -m "feat(arrival): campaign flag on create + draft-only PATCH"
```

---

### Task 5: Campaign config UI — create checkbox + draft toggle

**Files:**
- Modify: `src/app/admin/campaigns/new/page.tsx` (add checkbox + send flag)
- Create: `src/components/admin/ArrivalCertToggle.tsx`
- Modify: `src/app/admin/campaigns/[id]/page.tsx` (select flag; render toggle in draft view)

**Interfaces:**
- Consumes: `PATCH /api/campaigns/[id]` (from Task 4), `POST /api/campaigns` flag (Task 4), `Campaign.supports_arrival_certificates` (Task 1).
- Produces: `<ArrivalCertToggle campaignId initial />` client component.

- [ ] **Step 1: Add the checkbox to the new-campaign form**

In `src/app/admin/campaigns/new/page.tsx`, add state after `const [campaignDate, setCampaignDate] = useState('')`:

```tsx
  const [supportsArrival, setSupportsArrival] = useState(false)
```

Include it in the POST body (inside `handleSubmit`):

```tsx
        body: JSON.stringify({
          name,
          campaignDate,
          supportsArrivalCertificates: supportsArrival,
        }),
```

Add the checkbox to the form, after the date field's closing `</div>` (before the submit button):

```tsx
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={supportsArrival}
            onChange={(e) => setSupportsArrival(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-indigo-500"
          />
          <span>
            <span className="block text-sm font-medium text-zinc-700">{t('Supports Arrival Certificates')}</span>
            <span className="block text-xs text-zinc-500">{t('Let people confirm attendance and how many are coming.')}</span>
          </span>
        </label>
```

- [ ] **Step 2: Create the draft toggle component**

Create `src/components/admin/ArrivalCertToggle.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

export function ArrivalCertToggle({ campaignId, initial }: { campaignId: string; initial: boolean }) {
  const t = useT()
  const router = useRouter()
  const [enabled, setEnabled] = useState(initial)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    if (busy) return
    const next = !enabled
    setBusy(true)
    setEnabled(next)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supportsArrivalCertificates: next }),
      })
      if (!res.ok) setEnabled(!next)
      else router.refresh()
    } catch {
      setEnabled(!next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <label className="flex items-start gap-3 bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 cursor-pointer">
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
  )
}
```

- [ ] **Step 3: Wire flag selection + toggle into the campaign detail page**

In `src/app/admin/campaigns/[id]/page.tsx`:

Add the import near the other admin imports:

```tsx
import { ArrivalCertToggle } from '@/components/admin/ArrivalCertToggle'
```

Add `supports_arrival_certificates` to the campaign select (line ~47):

```tsx
      .select('id, name, campaign_date, sent_at, closed_at, supports_arrival_certificates')
```

In the **draft** branch, add the toggle to the right-hand column, just below `<GiftOptionsEditor campaignId={campaign.id} />`:

```tsx
            <div className="flex flex-col gap-4">
              <DistributorAssignment campaignId={campaign.id} />
              <GiftOptionsEditor campaignId={campaign.id} />
              <ArrivalCertToggle campaignId={campaign.id} initial={campaign.supports_arrival_certificates} />
            </div>
```

- [ ] **Step 4: Verify it builds/type-checks**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/campaigns/new/page.tsx src/components/admin/ArrivalCertToggle.tsx src/app/admin/campaigns/[id]/page.tsx
git commit -m "feat(arrival): campaign config UI (create checkbox + draft toggle)"
```

---

### Task 6: Employee response flow — ArrivalRsvp + gift page gating

**Files:**
- Create: `src/components/gift/ArrivalRsvp.tsx`
- Modify: `src/app/gift/[token]/page.tsx` (select flag + attendance; pass to view)
- Modify: `src/components/gift/GiftRedemptionView.tsx` (gate QR behind RSVP)

**Interfaces:**
- Consumes: `POST /api/gift/[token]/rsvp` (Task 3).
- Produces: `<ArrivalRsvp token initialAttending initialCount onSubmitted? />`; `GiftRedemptionView` gains props `supportsArrival: boolean`, `attending: boolean | null`, `attendeeCount: number | null`.

- [ ] **Step 1: Create the ArrivalRsvp component**

Create `src/components/gift/ArrivalRsvp.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

type Props = {
  token: string
  initialAttending: boolean | null
  initialCount: number | null
  onSubmitted?: () => void
}

export function ArrivalRsvp({ token, initialAttending, initialCount, onSubmitted }: Props) {
  const router = useRouter()
  const t = useT()
  const [attending, setAttending] = useState<boolean | null>(initialAttending)
  const [count, setCount] = useState<string>(initialCount ? String(initialCount) : '1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (busy || attending === null) return
    let attendeeCount: number | undefined
    if (attending) {
      const n = Number(count)
      if (!Number.isInteger(n) || n < 1) {
        setError(t('Please enter how many people are coming (1 or more).'))
        return
      }
      attendeeCount = n
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/gift/${token}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attending, attendeeCount }),
      })
      const data = await res.json()
      if (!data.ok) {
        setError(t('Could not save your response. Please try again.'))
        setBusy(false)
        return
      }
      onSubmitted?.()
      router.refresh()
    } catch {
      setError(t('Could not save your response. Please try again.'))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-500">{t('Are you coming?')}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setAttending(true)}
          className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors ${attending === true ? 'bg-indigo-500 text-white border-indigo-500' : 'border-zinc-200 text-zinc-700'}`}
        >
          {t("I'm coming")}
        </button>
        <button
          type="button"
          onClick={() => setAttending(false)}
          className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors ${attending === false ? 'bg-zinc-700 text-white border-zinc-700' : 'border-zinc-200 text-zinc-700'}`}
        >
          {t("I'm not coming")}
        </button>
      </div>

      {attending === true && (
        <div className="flex flex-col gap-1.5 text-start">
          <label htmlFor="attendee-count" className="text-sm font-medium text-zinc-700">
            {t('How many people are coming? (including you)')}
          </label>
          <input
            id="attendee-count"
            type="number"
            min={1}
            step={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      )}

      {attending !== null && (
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? t('Saving…') : t('Save response')}
        </button>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Pass flag + attendance from the gift page**

In `src/app/gift/[token]/page.tsx`, update the token select (line ~15) to include attendance and the campaign flag:

```tsx
  const { data: tokenRow } = await service
    .from('gift_tokens')
    .select('employee_name, redeemed, qr_image_url, gift_id, campaign_id, attending, attendee_count, campaigns(name, supports_arrival_certificates)')
    .eq('token', token)
    .single()
```

Update the campaign cast (line ~21):

```tsx
  const campaign = tokenRow.campaigns as unknown as { name: string; supports_arrival_certificates: boolean } | null
  const supportsArrival = campaign?.supports_arrival_certificates ?? false
```

Pass the new props in BOTH `<GiftRedemptionView>` returns. In the redeemed-early-return block add:

```tsx
        supportsArrival={supportsArrival}
        attending={tokenRow.attending}
        attendeeCount={tokenRow.attendee_count}
```

And in the final return add the same three props:

```tsx
      supportsArrival={supportsArrival}
      attending={tokenRow.attending}
      attendeeCount={tokenRow.attendee_count}
```

- [ ] **Step 3: Gate the QR behind the RSVP in GiftRedemptionView**

Replace the entire contents of `src/components/gift/GiftRedemptionView.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/useT'
import { GiftPicker } from '@/components/gift/GiftPicker'
import { ArrivalRsvp } from '@/components/gift/ArrivalRsvp'

type Gift = { id: string; name: string }

type Props = {
  token: string
  employeeName: string
  campaignName: string | null
  redeemed: boolean
  qrImageUrl: string | null
  gifts: Gift[]
  needsChoice: boolean
  chosenGiftName: string | null
  supportsArrival: boolean
  attending: boolean | null
  attendeeCount: number | null
}

export function GiftRedemptionView({
  token,
  employeeName,
  campaignName,
  redeemed,
  qrImageUrl,
  gifts,
  needsChoice,
  chosenGiftName,
  supportsArrival,
  attending,
  attendeeCount,
}: Props) {
  const t = useT()
  const [editing, setEditing] = useState(false)

  if (redeemed) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-zinc-100 px-6">
        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">&#10005;</span>
          </div>
          <h1 className="text-xl font-bold text-zinc-900 mb-1">{t('Already Claimed')}</h1>
          <p className="text-sm text-zinc-500">{t('This gift has already been redeemed.')}</p>
        </div>
      </main>
    )
  }

  // For arrival-certificate campaigns, the RSVP gates the gift QR.
  const showRsvpForm = supportsArrival && (attending === null || editing)
  const showNotComing = supportsArrival && attending === false && !editing

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 to-violet-50 px-6">
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 max-w-sm w-full text-center">
        <h1 className="text-2xl font-bold text-zinc-900 mb-1">{employeeName}</h1>
        {campaignName && <p className="text-sm text-zinc-500 mb-6">{campaignName}</p>}

        {showRsvpForm ? (
          <ArrivalRsvp
            token={token}
            initialAttending={attending}
            initialCount={attendeeCount}
            onSubmitted={() => setEditing(false)}
          />
        ) : showNotComing ? (
          <>
            <p className="text-sm font-medium text-zinc-700 mb-2">{t("You marked that you're not coming.")}</p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              {t('Change my answer')}
            </button>
          </>
        ) : needsChoice ? (
          <GiftPicker token={token} gifts={gifts} />
        ) : (
          <>
            {chosenGiftName && (
              <p className="text-sm font-medium text-indigo-600 mb-4">
                {t('Your gift')}: {chosenGiftName}
              </p>
            )}
            {qrImageUrl ? (
              <img
                src={qrImageUrl}
                alt="Gift QR code"
                width={280}
                height={280}
                className="mx-auto rounded-lg"
              />
            ) : (
              <div className="w-[280px] h-[280px] bg-zinc-100 rounded-lg flex items-center justify-center mx-auto">
                <p className="text-zinc-400 text-sm">{t('QR code not available')}</p>
              </div>
            )}
            <p className="text-sm text-zinc-500 mt-6">
              {t('Show this QR code to a distributor to collect your gift.')}
            </p>
            {supportsArrival && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-4 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                {t('Change my answer')}
              </button>
            )}
          </>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/gift/ArrivalRsvp.tsx src/app/gift/[token]/page.tsx src/components/gift/GiftRedemptionView.tsx
git commit -m "feat(arrival): employee RSVP flow gating the gift QR"
```

---

### Task 7: Admin reporting — ArrivalSummary card

**Files:**
- Create: `src/components/admin/ArrivalSummary.tsx`
- Modify: `src/app/admin/campaigns/[id]/page.tsx` (select attendance columns; render summary)

**Interfaces:**
- Consumes: `summarizeArrival` from `@/lib/arrival` (Task 2), `Campaign.supports_arrival_certificates` (Task 1).
- Produces: `<ArrivalSummary tokens={{ attending, attendee_count }[]} />`.

- [ ] **Step 1: Create the ArrivalSummary component**

Create `src/components/admin/ArrivalSummary.tsx`:

```tsx
'use client'

import { useT } from '@/lib/i18n/useT'
import { summarizeArrival } from '@/lib/arrival'

type Row = { attending: boolean | null; attendee_count: number | null }

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-bold text-zinc-900">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  )
}

export function ArrivalSummary({ tokens }: { tokens: Row[] }) {
  const t = useT()
  const { approved, totalArriving, notComing, noResponse } = summarizeArrival(tokens)

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-zinc-900 mb-4">{t('Arrival Certificates')}</h3>
      <div className="grid grid-cols-2 gap-4">
        <Stat label={t('Approved people')} value={approved} />
        <Stat label={t('Total arriving people')} value={totalArriving} />
        <Stat label={t('Not coming')} value={notComing} />
        <Stat label={t('No response')} value={noResponse} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Select attendance columns + carry them on mapped tokens**

In `src/app/admin/campaigns/[id]/page.tsx`, add `attending, attendee_count` to the `gift_tokens` select (line ~67):

```tsx
      .select('id, employee_name, phone_number, department, sms_sent_at, redeemed, redeemed_at, redeemed_by, gift_id, token, qr_image_url, attending, attendee_count')
```

In the `allTokens` map (line ~81-96), add the two fields to the returned object:

```tsx
      gift_id: t.gift_id,
      token: t.token,
      qr_image_url: t.qr_image_url,
      attending: t.attending,
      attendee_count: t.attendee_count,
    }
```

- [ ] **Step 3: Render the summary when the flag is on**

Add the import:

```tsx
import { ArrivalSummary } from '@/components/admin/ArrivalSummary'
```

In the **sent** (non-draft) branch, add the summary as the first item in the left column, just above `<RedemptionProgress …>`:

```tsx
            <div className="lg:col-span-2 flex flex-col gap-4">
              {campaign.supports_arrival_certificates && (
                <ArrivalSummary tokens={allTokens} />
              )}
              <RedemptionProgress
                campaignId={campaign.id}
                initialClaimed={claimedCount}
                total={allTokens.length}
              />
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: PASS. (`allTokens` now carries `attending`/`attendee_count`, matching `ArrivalSummary`'s `Row`.)

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/ArrivalSummary.tsx src/app/admin/campaigns/[id]/page.tsx
git commit -m "feat(arrival): admin summary card for approved + total arriving"
```

---

### Task 8: Hebrew translations

**Files:**
- Modify: `src/lib/i18n/translations.he.ts`
- Test: `tests/lib/i18n.test.ts` (existing — confirm it still passes)

**Interfaces:**
- Consumes: the literal English keys used by `useT()` in Tasks 5–7.

- [ ] **Step 1: Add the Hebrew strings**

In `src/lib/i18n/translations.he.ts`, add a new block (inside the `he` object, e.g. after the gift redemption block):

```ts
  // Arrival certificates (אישור הגעה)
  'Supports Arrival Certificates': 'תומך באישורי הגעה',
  'Let people confirm attendance and how many are coming.': 'אפשר למוזמנים לאשר הגעה ולציין כמה אנשים מגיעים.',
  'Are you coming?': 'האם אתם מגיעים?',
  "I'm coming": 'אני מגיע/ה',
  "I'm not coming": 'אני לא מגיע/ה',
  'How many people are coming? (including you)': 'כמה אנשים מגיעים? (כולל אותך)',
  'Please enter how many people are coming (1 or more).': 'נא להזין כמה אנשים מגיעים (1 או יותר).',
  'Save response': 'שמירת תשובה',
  'Saving…': 'שומר…',
  'Could not save your response. Please try again.': 'לא ניתן לשמור את התשובה. נסו שוב.',
  "You marked that you're not coming.": 'סימנתם שאינכם מגיעים.',
  'Change my answer': 'שינוי התשובה',
  'Arrival Certificates': 'אישורי הגעה',
  'Approved people': 'אישרו הגעה',
  'Total arriving people': 'סך כל המגיעים',
  'Not coming': 'לא מגיעים',
  'No response': 'ללא תשובה',
```

- [ ] **Step 2: Verify the i18n test still passes**

Run: `npm test -- tests/lib/i18n.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n/translations.he.ts
git commit -m "feat(arrival): Hebrew translations for arrival certificates"
```

---

### Task 9: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — including `tests/lib/arrival.test.ts`, `tests/api/gift-rsvp.test.ts`, `tests/api/campaign-patch.test.ts`, and the extended `tests/api/campaigns.test.ts`.

- [ ] **Step 2: Type-check the project**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS (no new errors).

- [ ] **Step 4: Confirm backward compatibility by inspection**

Verify: for a campaign with `supports_arrival_certificates = false`, `GiftRedemptionView` takes neither `showRsvpForm` nor `showNotComing` branch (both require `supportsArrival`), so the gift/QR flow is unchanged; the admin page renders no `ArrivalSummary`; and the RSVP route returns `not_supported`. No further action — this step is a reasoning checkpoint.

---

## Notes for the implementer

- **Migration application:** This repo applies migrations via `.github/workflows/migrate.yml` / Supabase tooling, not the test suite (tests mock the Supabase client). After merge, ensure the new migration is applied to each environment before enabling the feature.
- **Do not touch** the verify/scan redemption path; the QR redemption behavior must stay identical.
- **Read** `node_modules/next/dist/docs/` for the route-handler and page conventions before editing route/page files — this Next.js version differs from training data.
