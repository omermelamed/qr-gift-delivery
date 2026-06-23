# Editable Attendee-Count Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "מגיעים" (arriving) column to the campaign `EmployeeTable` for arrival-certificate campaigns, with inline admin editing of each person's attendee count.

**Architecture:** A new admin-only `PATCH /api/campaigns/[id]/tokens/[tokenId]/attendance` route (mirroring the existing gift-edit route) writes `attending`/`attendee_count` on `gift_tokens`. The table gains a conditional column with an inline editable cell; edits PATCH the route then `router.refresh()` so the server-rendered `ArrivalSummary` totals re-compute (the row also updates live via the existing Realtime subscription). No schema change — the columns already exist.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before route/page code — this Next.js differs from training data), Supabase service client, TypeScript, Vitest, Tailwind, project i18n (`useT`).

## Global Constraints

- This is NOT standard Next.js — mirror the existing sibling route `src/app/api/campaigns/[id]/tokens/[tokenId]/gift/route.ts` and the `GiftCell` inline-edit pattern in `EmployeeTable.tsx`.
- Admin edit is permission-gated on `campaigns:launch` and company-scoped; **admin override is allowed anytime, including after redemption** (no `redeemed` guard) — matches the gift route.
- Count meaning: total **including the person** (1 = alone), consistent with `summarizeArrival` and the employee prompt. Entering a number ≥ 1 marks the person **coming**; clearing reverts to **no response** (`attending = null`, `attendee_count = null`).
- DB CHECK requires `attending = TRUE ⇒ attendee_count ≥ 1`; otherwise `attendee_count IS NULL` — both update branches satisfy it.
- The column renders only when `campaign.supports_arrival_certificates`.
- Service-role key server-side only; never log token values. UI strings via `useT()`.
- Run tests with `npm test`; focused `npm test -- <file>`. The repo has ~21 pre-existing `logAuditEvent` suite failures unrelated to this work — track only NEW regressions.

---

### Task 1: Attendance API route (TDD)

**Files:**
- Create: `src/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route.ts`
- Modify: `src/lib/audit.ts` (add `'token.attendance_changed'` to the `AuditAction` union)
- Test: `tests/api/token-attendance.test.ts`

**Interfaces:**
- Consumes: `createClient`, `createServiceClient` (`@/lib/supabase/server`), `fetchPermissions`, `hasPermission` (`@/lib/permissions`), `resolveCompanyId` (`@/lib/platform-auth`), `logAuditEvent` (`@/lib/audit`), `JwtAppMetadata` (`@/types`).
- Produces: `PATCH(request, { params: Promise<{ id: string; tokenId: string }> })`. Body `{ attendeeCount: number | null }`. Success `{ ok: true, attending, attendee_count }`; errors `Unauthorized` 401, `Forbidden` 403, `Not found` 404, `not_supported` 400, `invalid_count` 400.

- [ ] **Step 1: Add the audit action**

In `src/lib/audit.ts`, add `'token.attendance_changed'` to the `AuditAction` union, next to the other `token.*` actions:

```ts
  | 'token.redeemed'
  | 'token.gift_changed'
  | 'token.attendance_changed'
```

- [ ] **Step 2: Write the failing test**

Create `tests/api/token-attendance.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { fetchPermissions } from '@/lib/permissions'

const mockGetUser = vi.fn()
const mockCampaignSingle = vi.fn()
const mockUpdateSingle = vi.fn()
const mockUpdate = vi.fn(() => ({
  eq: () => ({ eq: () => ({ select: () => ({ single: mockUpdateSingle }) }) }),
}))

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
      // gift_tokens
      return { update: mockUpdate }
    },
  }),
}))

function makeRequest(attendeeCount: unknown) {
  return new NextRequest('http://localhost/api/campaigns/c-1/tokens/t-1/attendance', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attendeeCount }),
  })
}
const ctx = { params: Promise.resolve({ id: 'c-1', tokenId: 't-1' }) }

describe('PATCH /api/campaigns/[id]/tokens/[tokenId]/attendance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1', app_metadata: { role_id: 'r-1', role_name: 'company_admin' } } } })
    mockCampaignSingle.mockResolvedValue({ data: { id: 'c-1', supports_arrival_certificates: true } })
    mockUpdateSingle.mockResolvedValue({ data: { id: 't-1', attending: true, attendee_count: 2 } })
  })

  it('401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route')
    const res = await PATCH(makeRequest(2), ctx)
    expect(res.status).toBe(401)
  })

  it('403 when caller lacks campaigns:launch permission', async () => {
    vi.mocked(fetchPermissions).mockResolvedValueOnce([] as any)
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route')
    const res = await PATCH(makeRequest(2), ctx)
    expect(res.status).toBe(403)
  })

  it('404 when campaign not in caller company', async () => {
    mockCampaignSingle.mockResolvedValue({ data: null })
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route')
    const res = await PATCH(makeRequest(2), ctx)
    expect(res.status).toBe(404)
  })

  it('400 not_supported when the campaign lacks arrival certificates', async () => {
    mockCampaignSingle.mockResolvedValue({ data: { id: 'c-1', supports_arrival_certificates: false } })
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route')
    const res = await PATCH(makeRequest(2), ctx)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('not_supported')
  })

  it('sets attending + count and asserts the write payload', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route')
    const res = await PATCH(makeRequest(2), ctx)
    const body = await res.json()
    expect(body).toEqual({ ok: true, attending: true, attendee_count: 2 })
    expect(mockUpdate).toHaveBeenCalledWith({ attending: true, attendee_count: 2, responded_at: expect.any(String) })
  })

  it('clears attendance when attendeeCount is null', async () => {
    mockUpdateSingle.mockResolvedValue({ data: { id: 't-1', attending: null, attendee_count: null } })
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route')
    const res = await PATCH(makeRequest(null), ctx)
    const body = await res.json()
    expect(body).toEqual({ ok: true, attending: null, attendee_count: null })
    expect(mockUpdate).toHaveBeenCalledWith({ attending: null, attendee_count: null, responded_at: null })
  })

  it('400 invalid_count for zero', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route')
    const res = await PATCH(makeRequest(0), ctx)
    expect((await res.json()).error).toBe('invalid_count')
  })

  it('400 invalid_count for a non-integer', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route')
    const res = await PATCH(makeRequest(1.5), ctx)
    expect((await res.json()).error).toBe('invalid_count')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/api/token-attendance.test.ts`
Expected: FAIL — cannot find module `@/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route`.

- [ ] **Step 4: Write the route**

Create `src/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route.ts`:

```ts
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
  const raw = body.attendeeCount

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, supports_arrival_certificates')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!campaign.supports_arrival_certificates) {
    return NextResponse.json({ error: 'not_supported' }, { status: 400 })
  }

  // null/empty clears the record; a positive integer marks the person coming.
  let update: { attending: boolean | null; attendee_count: number | null; responded_at: string | null }
  if (raw === null || raw === undefined || raw === '') {
    update = { attending: null, attendee_count: null, responded_at: null }
  } else {
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
      return NextResponse.json({ error: 'invalid_count' }, { status: 400 })
    }
    update = { attending: true, attendee_count: raw, responded_at: new Date().toISOString() }
  }

  // Admin override is allowed anytime, including after redemption.
  const { data: updated } = await service
    .from('gift_tokens')
    .update(update)
    .eq('id', tokenId)
    .eq('campaign_id', campaignId)
    .select('id, attending, attendee_count')
    .single()

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  logAuditEvent({
    companyId,
    actorId: user.id,
    action: 'token.attendance_changed',
    resourceType: 'gift_token',
    resourceId: tokenId,
    metadata: { attending: updated.attending, attendee_count: updated.attendee_count },
  })

  return NextResponse.json({ ok: true, attending: updated.attending, attendee_count: updated.attendee_count })
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/api/token-attendance.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (the new audit action makes `logAuditEvent({ action: 'token.attendance_changed' })` type-check).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/campaigns/[id]/tokens/[tokenId]/attendance/route.ts src/lib/audit.ts tests/api/token-attendance.test.ts
git commit -m "feat(arrival): admin attendance-edit API route"
```

---

### Task 2: Attendee-count column in EmployeeTable

**Files:**
- Modify: `src/components/admin/EmployeeTable.tsx`
- Modify: `src/app/admin/campaigns/[id]/page.tsx` (pass two props to both `EmployeeTable` usages)
- Modify: `src/lib/i18n/translations.he.ts` (column header)

**Interfaces:**
- Consumes: `PATCH /api/campaigns/[id]/tokens/[tokenId]/attendance` (Task 1), body `{ attendeeCount: number | null }`.
- Produces: `EmployeeTable` props `showAttendance?: boolean`, `canEditAttendance?: boolean`; `TokenRow` gains `attending: boolean | null`, `attendee_count: number | null`.

- [ ] **Step 1: Extend the `TokenRow` type**

In `src/components/admin/EmployeeTable.tsx`, add two fields to the `TokenRow` type (after `qr_image_url`):

```ts
  token: string
  qr_image_url: string | null
  attending: boolean | null
  attendee_count: number | null
}
```

- [ ] **Step 2: Add the `useRouter` import and the `AttendeeCountCell` component**

At the top of `src/components/admin/EmployeeTable.tsx`, add the router import alongside the existing imports:

```ts
import { useRouter } from 'next/navigation'
```

Add the `AttendeeCountCell` component just below the existing `GiftCell` component (after its closing brace):

```tsx
function AttendeeCountCell({
  attending,
  attendeeCount,
  editable,
  onChange,
}: {
  attending: boolean | null
  attendeeCount: number | null
  editable: boolean
  onChange: (value: number | null) => void
}) {
  const serverValue = attending === true && attendeeCount != null ? attendeeCount : null
  const [draft, setDraft] = useState<string>(serverValue != null ? String(serverValue) : '')
  useEffect(() => { setDraft(serverValue != null ? String(serverValue) : '') }, [serverValue])

  if (!editable) {
    return serverValue != null
      ? <span className="text-zinc-700">{serverValue}</span>
      : <span className="text-zinc-300">—</span>
  }

  function commit() {
    const str = draft.trim()
    if (str === '') {
      if (serverValue != null) onChange(null)
      return
    }
    const n = Number(str)
    if (!Number.isInteger(n) || n < 1) {
      setDraft(serverValue != null ? String(serverValue) : '')
      return
    }
    if (n !== serverValue) onChange(n)
  }

  return (
    <input
      type="number"
      min={1}
      value={draft}
      placeholder="—"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className="w-16 text-xs border border-zinc-200 rounded-md px-1.5 py-1 bg-white"
    />
  )
}
```

- [ ] **Step 3: Add props, router, colCount, and the change handler**

Change the `EmployeeTable` signature to accept the two new props (add to the destructured params and the type):

```tsx
export function EmployeeTable({
  campaignId,
  initialRows,
  isDraft,
  gifts = [],
  canEditGift = false,
  showAttendance = false,
  canEditAttendance = false,
}: {
  campaignId: string
  initialRows: TokenRow[]
  isDraft: boolean
  gifts?: { id: string; name: string }[]
  canEditGift?: boolean
  showAttendance?: boolean
  canEditAttendance?: boolean
}) {
```

Inside the component, add the router (near the existing `const t = useT()`):

```tsx
  const t = useT()
  const router = useRouter()
```

Just below the existing `const showGiftCol = gifts.length > 0` line, add the column count:

```tsx
  const showGiftCol = gifts.length > 0
  const colCount = 8 + (showGiftCol ? 1 : 0) + (showAttendance ? 1 : 0)
```

Add the change handler next to the existing `changeGift` function:

```tsx
  async function changeAttendance(tokenId: string, value: number | null) {
    await fetch(`/api/campaigns/${campaignId}/tokens/${tokenId}/attendance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendeeCount: value }),
    })
    // Realtime UPDATE refreshes the row; refresh re-computes the ArrivalSummary totals.
    router.refresh()
  }
```

- [ ] **Step 4: Add the header cell**

In the `<thead>` row, add the new header immediately after the Gift `<th>` block (`{showGiftCol && <th ...>{t('Gift')}</th>}`) and before the `SMS` `<th>`:

```tsx
                {showGiftCol && <th className="px-3 py-2 font-medium text-start">{t('Gift')}</th>}
                {showAttendance && <th className="px-3 py-2 font-medium text-start">{t('Arriving')}</th>}
                <th className="px-3 py-2 font-medium text-start">SMS</th>
```

- [ ] **Step 5: Add the body cell in the grouped render**

In the grouped branch (`buildGroupedRows().map(...)`, the non-header `<tr>`), after the Gift `<td>` block (the `{showGiftCol && (<td className="px-3 py-1.5"><GiftCell .../></td>)}`), add:

```tsx
                        {showAttendance && (
                          <td className="px-3 py-1.5">
                            <AttendeeCountCell
                              attending={row.attending}
                              attendeeCount={row.attendee_count}
                              editable={canEditAttendance}
                              onChange={(value) => changeAttendance(row.id, value)}
                            />
                          </td>
                        )}
```

- [ ] **Step 6: Add the body cell in the flat render**

In the flat branch (`filteredRows.map((r) => ...)`), after the Gift `<td>` block (`{showGiftCol && (<td className="px-3 py-1.5"><GiftCell .../></td>)}`), add:

```tsx
                      {showAttendance && (
                        <td className="px-3 py-1.5">
                          <AttendeeCountCell
                            attending={r.attending}
                            attendeeCount={r.attendee_count}
                            editable={canEditAttendance}
                            onChange={(value) => changeAttendance(r.id, value)}
                          />
                        </td>
                      )}
```

- [ ] **Step 7: Update the two `colSpan` values**

Replace the group-header `colSpan` (`colSpan={showGiftCol ? 9 : 8}`) and the empty-state `colSpan` (`colSpan={showGiftCol ? 9 : 8}`) — both become:

```tsx
colSpan={colCount}
```

(There are exactly two occurrences of `colSpan={showGiftCol ? 9 : 8}`; replace both.)

- [ ] **Step 8: Add the Hebrew header string**

In `src/lib/i18n/translations.he.ts`, add to the "Arrival certificates" block:

```ts
  'Arriving': 'מגיעים',
```

- [ ] **Step 9: Wire the props from the campaign detail page**

In `src/app/admin/campaigns/[id]/page.tsx`, both `<EmployeeTable .../>` usages (draft branch and sent branch) gain two props. The draft usage:

```tsx
              <EmployeeTable
                campaignId={campaign.id}
                initialRows={allTokens}
                isDraft={isDraft}
                gifts={gifts}
                canEditGift={canEditGift}
                showAttendance={campaign.supports_arrival_certificates}
                canEditAttendance={canEditGift}
              />
```

The sent (non-draft) usage:

```tsx
              <EmployeeTable
                campaignId={campaign.id}
                initialRows={allTokens}
                isDraft={isDraft}
                gifts={gifts}
                canEditGift={canEditGift}
                showAttendance={campaign.supports_arrival_certificates}
                canEditAttendance={canEditGift}
              />
```

- [ ] **Step 10: Type-check and lint**

Run: `npx tsc --noEmit`
Expected: PASS (`allTokens` already carries `attending`/`attendee_count`, so it satisfies the extended `TokenRow`).

Run: `npx eslint src/components/admin/EmployeeTable.tsx src/app/admin/campaigns/[id]/page.tsx src/lib/i18n/translations.he.ts`
Expected: no new errors.

- [ ] **Step 11: Commit**

```bash
git add src/components/admin/EmployeeTable.tsx src/app/admin/campaigns/[id]/page.tsx src/lib/i18n/translations.he.ts
git commit -m "feat(arrival): editable attendee-count column in employee table"
```

---

### Task 3: Full verification

- [ ] **Step 1: Run the feature + neighbouring tests**

Run: `npm test -- tests/api/token-attendance.test.ts tests/api/token-gift.test.ts tests/lib/arrival.test.ts tests/lib/i18n.test.ts`
Expected: PASS (Task 1's 8 tests + the unchanged neighbours).

- [ ] **Step 2: Type-check the project**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Full suite regression check**

Run: `npm test`
Expected: no NEW failures beyond the ~21 pre-existing `logAuditEvent` baseline.

- [ ] **Step 4: Backward-compatibility reasoning checkpoint**

Verify by inspection: for a campaign with `supports_arrival_certificates = false`, `showAttendance` is false ⇒ no header `<th>`, no body `<td>`, and `colCount = 8 + (showGiftCol ? 1 : 0)` — identical to the previous `showGiftCol ? 9 : 8`. So non-arrival campaigns render exactly as before. No further action — this is a reasoning checkpoint.

---

## Notes for the implementer

- Do not modify the employee-facing RSVP flow or the redemption path.
- The `gift_tokens` Realtime subscription already in `EmployeeTable` delivers the full new row on update, so an admin edit propagates to the row without a manual state write; `router.refresh()` additionally re-renders the server `ArrivalSummary`.
- Read `node_modules/next/dist/docs/` for route-handler/page conventions before editing — this Next.js version differs from training data.
