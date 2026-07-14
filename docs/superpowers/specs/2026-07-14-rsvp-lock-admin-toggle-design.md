# RSVP Lock Admin Toggle — Design

**Date:** 2026-07-14
**Status:** Approved, pending implementation plan
**Builds on:** `2026-07-14-rsvp-lock-design.md` (the `rsvp_locked` column, RSVP-route gate, and
`resolveRsvpViewState`/`GiftRedemptionView` employee-facing behavior are already shipped and
untouched by this change)

## Summary

The RSVP lock (`campaigns.rsvp_locked`) currently has no admin UI — it was flipped once via a
migration for a single campaign. This adds a toggle so an admin can lock/unlock registration on
any arrival-certificate campaign directly from the admin dashboard, without touching the
database.

## Decisions (locked during brainstorming)

1. **Two-way toggle**, not a one-way "close registration" action. Same on/off semantics as the
   existing `ArrivalCertToggle` checkboxes — admin can lock and later unlock freely.
2. **Always editable**, including after `sent_at` and `closed_at`. This is the opposite of every
   other setting in `ArrivalCertToggle` (which all lock once `sent_at` is set) — the whole point
   of this toggle is to act on an already-live campaign.
3. **No confirmation dialog.** Same simple optimistic-toggle pattern as every other checkbox in
   this admin UI (click → save → revert on error).
4. **New dedicated endpoint**, `PATCH /api/campaigns/[id]/rsvp-lock`, rather than extending the
   general `PATCH /api/campaigns/[id]`. That endpoint has a blanket, request-wide `sent_at` guard
   (`route.ts:161-163`) — reject-everything, not per-field — so carving out an exception there
   would add a special case to an otherwise simple one-line guard. A separate route with no guard
   at all mirrors the existing precedent of `PATCH .../tokens/[tokenId]/attendance`, which is
   already documented as "allowed anytime, including after redemption."
5. **Not reachable from `ArrivalCertToggle`/`CampaignWizard` at all.** Those only render while a
   campaign is a draft (`src/app/admin/campaigns/[id]/page.tsx:135`, `isDraft` branch) — the exact
   opposite of when this toggle is useful. This is a new, standalone component rendered in the
   **launched-view sidebar only** (the `!isDraft` branch, `page.tsx:155-197`), at the **top** of
   the sidebar column, before `DistributorAssignment` — it's the most operationally significant
   live-campaign control, so it should be the first thing an admin sees.
6. **Draft campaigns are out of scope.** A draft has zero RSVPs yet (nothing to grandfather), so
   locking one isn't meaningful. `CampaignWizard`/`ArrivalCertToggle` are untouched by this change.
7. **Gated on `supports_arrival_certificates`**, same as the employee-facing lock behavior — the
   concept doesn't exist otherwise. Rendered only when true; the API also rejects with
   `not_supported` if called on a campaign where it's false, mirroring the attendance route's own
   guard.

## API — `PATCH /api/campaigns/[id]/rsvp-lock`

New file `src/app/api/campaigns/[id]/rsvp-lock/route.ts`:

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

## UI — `RsvpLockToggle` component

New file `src/components/admin/RsvpLockToggle.tsx`, following `ArrivalCertToggle`'s
single-checkbox optimistic pattern exactly, but posting to the new dedicated endpoint:

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

## Wiring — `src/app/admin/campaigns/[id]/page.tsx`

- Extend the campaigns select (currently line 46) to include `rsvp_locked`.
- In the launched-view sidebar (`!isDraft` branch, currently lines 184-195), add
  `RsvpLockToggle` at the top, before `DistributorAssignment`, gated on
  `campaign.supports_arrival_certificates`:
  ```tsx
  <div className="flex flex-col gap-4">
    {campaign.supports_arrival_certificates && (
      <RsvpLockToggle campaignId={campaign.id} initial={campaign.rsvp_locked} />
    )}
    <DistributorAssignment campaignId={campaign.id} />
    {/* ...unchanged... */}
  </div>
  ```
- Add `rsvp_locked: boolean` to whatever local type/destructure is needed for this page (it
  already destructures `campaign.*` fields directly from the Supabase result, no separate cast
  needed here unlike the gift page).

## i18n

Add to `src/lib/i18n/translations.he.ts`:
- `'Stop new RSVPs (event is full)'` → Hebrew label.
- `"People who already said they're coming keep their spot. Everyone else sees an \"event is full\" message instead of the RSVP form."` → Hebrew helper text.

## Testing

- New `tests/api/campaign-rsvp-lock.test.ts`, following `tests/api/token-attendance.test.ts`'s
  mocking pattern (session + permissions + service client):
  - 401 when unauthenticated.
  - 403 when missing `campaigns:launch` permission.
  - 400 when `rsvpLocked` is not a boolean.
  - 404 when campaign not found / wrong company.
  - 400 `not_supported` when `supports_arrival_certificates` is false.
  - Successful lock (`rsvpLocked: true` → `ok: true, rsvpLocked: true`), successful unlock.
  - **Key test:** succeeds even when the campaign's `sent_at` and `closed_at` are both set —
    proves the absence of the guard that blocks the general PATCH endpoint.
  - Audit log call happens with the right action/metadata.
- No changes expected to `tests/api/campaign-patch.test.ts`, `tests/api/token-attendance.test.ts`,
  or any `GiftRedemptionView`/`resolveRsvpViewState` tests — this change only adds a new route and
  a new admin-only component; the employee-facing lock behavior from the prior design is
  untouched.

## Out of scope

- Any change to `CampaignWizard`/`ArrivalCertToggle` or the draft-campaign flow.
- A confirmation dialog before locking.
- Any numeric capacity/headcount feature.
- Making this toggle available before a campaign is sent.
