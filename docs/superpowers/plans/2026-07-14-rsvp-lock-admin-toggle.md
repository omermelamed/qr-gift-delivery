# RSVP Lock Admin Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins a UI toggle to lock/unlock RSVP registration on a live (already-sent) arrival-certificate campaign, backed by a new dedicated API route with no `sent_at`/`closed_at` guard.

**Architecture:** A new standalone endpoint `PATCH /api/campaigns/[id]/rsvp-lock` updates the existing `campaigns.rsvp_locked` column (added by the prior RSVP-lock plan) with no lifecycle guard. A new standalone component `RsvpLockToggle` — not nested in `ArrivalCertToggle`/`CampaignWizard`, which only render for drafts — is rendered at the top of the launched-campaign sidebar in `src/app/admin/campaigns/[id]/page.tsx`, gated on `supports_arrival_certificates`.

**Tech Stack:** Next.js App Router API routes, Supabase (Postgres + service-role client), Vitest for the API route (no component-rendering test infra in this repo, consistent with the prior RSVP-lock plan).

## Global Constraints

- Two-way toggle: admin can lock and unlock freely, no confirmation dialog.
- The new route must have **no** `sent_at`/`closed_at` guard — it must succeed regardless of campaign lifecycle state.
- Gated on `supports_arrival_certificates`: API rejects with `400 not_supported` if false; UI only renders when true.
- Not reachable from `CampaignWizard`/`ArrivalCertToggle` — those stay completely untouched. This is a new standalone component rendered only in the launched (`!isDraft`) view.
- Same auth pattern as every other campaign-mutating route: session + `campaigns:launch` permission, scoped to the caller's `company_id`.
- No numeric capacity logic, no confirmation dialog, no changes to the employee-facing `resolveRsvpViewState`/`GiftRedemptionView`/RSVP route from the prior plan.

---

### Task 1: API route — `PATCH /api/campaigns/[id]/rsvp-lock`

**Files:**
- Create: `src/app/api/campaigns/[id]/rsvp-lock/route.ts`
- Test: `tests/api/campaign-rsvp-lock.test.ts`

**Interfaces:**
- Produces: `PATCH /api/campaigns/[id]/rsvp-lock` accepting `{ rsvpLocked: boolean }`, returning
  `200 { ok: true, rsvpLocked: boolean }` on success, or `401`/`403`/`400`/`404`/`500` with
  `{ error: string }` on failure. Task 2's `RsvpLockToggle` component calls this exact endpoint
  and body shape.

- [ ] **Step 1: Write the failing tests**

Create `tests/api/campaign-rsvp-lock.test.ts`:

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

vi.mock('@/lib/platform-auth', () => ({ resolveCompanyId: vi.fn(async () => 'company-1') }))

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }))

function makeRequest(rsvpLocked: unknown) {
  return new NextRequest('http://localhost/api/campaigns/c-1/rsvp-lock', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rsvpLocked }),
  })
}

const params = { params: Promise.resolve({ id: 'c-1' }) }

function mockCampaign(data: unknown, updateError: unknown = null) {
  const update = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: updateError }) }) }))
  mockFromService.mockReturnValue({
    select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data }) }) }) }),
    update,
  })
  return update
}

describe('PATCH /api/campaigns/[id]/rsvp-lock', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { hasPermission, fetchPermissions } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    vi.mocked(fetchPermissions).mockResolvedValue(['campaigns:launch'] as any)
    const { resolveCompanyId } = await import('@/lib/platform-auth')
    vi.mocked(resolveCompanyId).mockResolvedValue('company-1' as any)
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', app_metadata: { company_id: 'company-1', role_id: 'role-1', role_name: 'company_admin' } } },
    })
    mockCampaign({ id: 'c-1', supports_arrival_certificates: true })
  })

  it('401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest(true), params)
    expect(res.status).toBe(401)
  })

  it('401 when company cannot be resolved', async () => {
    const { resolveCompanyId } = await import('@/lib/platform-auth')
    vi.mocked(resolveCompanyId).mockResolvedValueOnce(null as any)
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest(true), params)
    expect(res.status).toBe(401)
  })

  it('403 when missing campaigns:launch permission', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest(true), params)
    expect(res.status).toBe(403)
  })

  it('400 when rsvpLocked is not a boolean', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest('yes'), params)
    expect(res.status).toBe(400)
  })

  it('404 when campaign not found', async () => {
    mockCampaign(null)
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest(true), params)
    expect(res.status).toBe(404)
  })

  it('400 not_supported when arrival certificates are disabled', async () => {
    mockCampaign({ id: 'c-1', supports_arrival_certificates: false })
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest(true), params)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('not_supported')
  })

  it('locks the campaign and logs the audit event', async () => {
    const update = mockCampaign({ id: 'c-1', supports_arrival_certificates: true })
    const { logAuditEvent } = await import('@/lib/audit')
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest(true), params)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, rsvpLocked: true })
    expect(update).toHaveBeenCalledWith({ rsvp_locked: true })
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'campaign.rsvp_lock_changed',
      resourceId: 'c-1',
      metadata: { rsvpLocked: true },
    }))
  })

  it('unlocks the campaign', async () => {
    const update = mockCampaign({ id: 'c-1', supports_arrival_certificates: true })
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest(false), params)
    expect(await res.json()).toEqual({ ok: true, rsvpLocked: false })
    expect(update).toHaveBeenCalledWith({ rsvp_locked: false })
  })

  it('succeeds even when the campaign is already sent and closed', async () => {
    mockCampaign({
      id: 'c-1',
      supports_arrival_certificates: true,
      sent_at: '2026-06-01T00:00:00Z',
      closed_at: '2026-06-02T00:00:00Z',
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest(true), params)
    expect(res.status).toBe(200)
  })

  it('500 when the update fails', async () => {
    mockCampaign({ id: 'c-1', supports_arrival_certificates: true }, { message: 'db error' })
    const { PATCH } = await import('@/app/api/campaigns/[id]/rsvp-lock/route')
    const res = await PATCH(makeRequest(true), params)
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/api/campaign-rsvp-lock.test.ts`
Expected: FAIL with "Cannot find module '@/app/api/campaigns/[id]/rsvp-lock/route'" (the route
file doesn't exist yet).

- [ ] **Step 3: Write the route**

Create `src/app/api/campaigns/[id]/rsvp-lock/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { resolveCompanyId } from '@/lib/platform-auth'
import { logAuditEvent } from '@/lib/audit'
import type { JwtAppMetadata } from '@/types'

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
  if (typeof body.rsvpLocked !== 'boolean') {
    return NextResponse.json({ error: 'rsvpLocked must be a boolean' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, supports_arrival_certificates')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (!campaign.supports_arrival_certificates) {
    return NextResponse.json({ error: 'not_supported' }, { status: 400 })
  }

  // No sent_at/closed_at guard: locking/unlocking must work on a live campaign.
  const { error: updateError } = await service
    .from('campaigns')
    .update({ rsvp_locked: body.rsvpLocked })
    .eq('id', campaignId)
    .eq('company_id', companyId)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 })
  }

  logAuditEvent({
    companyId,
    actorId: user.id,
    action: 'campaign.rsvp_lock_changed',
    resourceType: 'campaign',
    resourceId: campaignId,
    metadata: { rsvpLocked: body.rsvpLocked },
  })

  return NextResponse.json({ ok: true, rsvpLocked: body.rsvpLocked })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/api/campaign-rsvp-lock.test.ts`
Expected: all 10 tests PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run tests`
Expected: PASS, no regressions in unrelated suites.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/campaigns/\[id\]/rsvp-lock/route.ts tests/api/campaign-rsvp-lock.test.ts
git commit -m "feat(api): add PATCH /api/campaigns/[id]/rsvp-lock, no sent_at guard"
```

---

### Task 2: Admin UI — `RsvpLockToggle` + wiring + i18n

**Files:**
- Create: `src/components/admin/RsvpLockToggle.tsx`
- Modify: `src/app/admin/campaigns/[id]/page.tsx`
- Modify: `src/lib/i18n/translations.he.ts`

**Interfaces:**
- Consumes: `PATCH /api/campaigns/[id]/rsvp-lock` (Task 1) — body `{ rsvpLocked: boolean }`,
  success response `{ ok: true, rsvpLocked: boolean }`.
- Produces: `<RsvpLockToggle campaignId={string} initial={boolean} />`, a self-contained client
  component with no other exports.

- [ ] **Step 1: Create the component**

Create `src/components/admin/RsvpLockToggle.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

export function RsvpLockToggle({
  campaignId,
  initial,
}: {
  campaignId: string
  initial: boolean
}) {
  const t = useT()
  const router = useRouter()
  const [locked, setLocked] = useState(initial)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    if (busy) return
    const next = !locked
    setBusy(true)
    setLocked(next)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/rsvp-lock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rsvpLocked: next }),
      })
      if (!res.ok) setLocked(!next)
      else router.refresh()
    } catch {
      setLocked(!next)
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-3 bg-white rounded-2xl border border-zinc-200 p-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={locked}
          disabled={busy}
          onChange={toggle}
          className="mt-0.5 w-4 h-4 accent-[var(--brand)]"
        />
        <span>
          <span className="block text-sm font-medium text-zinc-900">
            {t('Stop new RSVPs (event is full)')}
          </span>
          <span className="block text-xs text-zinc-500">
            {t("People who already said they're coming keep their spot. Everyone else sees an \"event is full\" message instead of the RSVP form.")}
          </span>
        </span>
      </label>
    </div>
  )
}
```

- [ ] **Step 2: Wire it into the campaign detail page**

In `src/app/admin/campaigns/[id]/page.tsx`, add the import near the other admin component
imports (alongside `DistributorAssignment`, currently line 11):

```ts
import { RsvpLockToggle } from '@/components/admin/RsvpLockToggle'
```

Extend the campaigns select (currently line 46) from:

```ts
      .select('id, name, campaign_date, sent_at, closed_at, supports_arrival_certificates, max_attendee_count, allow_gift_if_not_attending, sms_template, reminder_sms_template, wizard_last_step')
```

to:

```ts
      .select('id, name, campaign_date, sent_at, closed_at, supports_arrival_certificates, max_attendee_count, allow_gift_if_not_attending, sms_template, reminder_sms_template, wizard_last_step, rsvp_locked')
```

In the launched-view sidebar (currently lines 184-195), add `RsvpLockToggle` at the top, before
`DistributorAssignment`, gated on `supports_arrival_certificates`:

```tsx
            {/* Sidebar (1 col): config + notes + stats, stacked independently. */}
            <div className="flex flex-col gap-4">
              {campaign.supports_arrival_certificates && (
                <RsvpLockToggle campaignId={campaign.id} initial={campaign.rsvp_locked} />
              )}
              <DistributorAssignment campaignId={campaign.id} />
```

(leave `ReminderSmsTemplate`, `CampaignNotes`, `DistributorStats` below it exactly as they are).

- [ ] **Step 3: Add the i18n strings**

In `src/lib/i18n/translations.he.ts`, add near the existing arrival-certificate strings:

```ts
  'Stop new RSVPs (event is full)': 'עצירת הרשמות חדשות (האירוע מלא)',
  "People who already said they're coming keep their spot. Everyone else sees an \"event is full\" message instead of the RSVP form.": 'מי שכבר אישרו הגעה שומרים על מקומם. כל השאר יראו הודעה שהאירוע מלא במקום טופס האישור.',
```

- [ ] **Step 4: Typecheck and run the full test suite**

Run: `npx tsc --noEmit && npx vitest run tests`
Expected: no new type errors (the one pre-existing, unrelated `tests/api/leads.test.ts` error may
still appear — confirm it's the same error as before this task, not a new one), all tests PASS.

- [ ] **Step 5: Manual verification note**

No component-rendering test infra exists in this repo (see the prior RSVP-lock plan's Task 4).
Correctness here rests on `tsc` passing and the wiring matching Task 1's route contract exactly.
Whoever deploys this should manually load a launched, arrival-certificate campaign's admin page
and confirm: the toggle appears at the top of the sidebar, clicking it flips state and persists
after a refresh, and it also works on a campaign that's already `closed`.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/RsvpLockToggle.tsx src/app/admin/campaigns/\[id\]/page.tsx src/lib/i18n/translations.he.ts
git commit -m "feat(admin): add RSVP lock toggle to the launched-campaign sidebar"
```

---

## Self-Review Notes

- **Spec coverage:** Decision 1 (two-way toggle) → the component's single `toggle()` function
  flips both directions. Decision 2 (always editable) → the route has no `sent_at`/`closed_at`
  read or check at all, and Task 1's "succeeds even when sent and closed" test locks this in.
  Decision 3 (no confirmation) → `toggle()` fires immediately on `onChange`. Decision 4 (dedicated
  endpoint) → Task 1 creates a new route file, general `PATCH /api/campaigns/[id]` is untouched.
  Decision 5 (not reachable from the wizard) → Task 2 only touches the launched-view branch of
  `page.tsx`; `CampaignWizard.tsx`/`ArrivalCertToggle.tsx` are not in either task's file list.
  Decision 6 (draft out of scope) → same reasoning. Decision 7 (gated on
  `supports_arrival_certificates`) → both the route's `not_supported` check and the page's
  conditional render.
- **Placeholder scan:** none found — every step has literal code.
- **Type consistency:** `rsvp_locked` (snake_case DB/select) vs. `rsvpLocked` (camelCase
  prop/JSON field) used consistently with the established convention from the prior plan.
  `RsvpLockToggle`'s `campaignId`/`initial` props match exactly what Task 2 Step 2 passes.
