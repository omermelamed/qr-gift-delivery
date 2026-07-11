# Allow Gift If Not Attending Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-campaign checkbox, nested under "Supports Arrival Certificates," that lets an admin allow employees who marked "not attending" to still choose a gift and see their QR code on their own gift-link page.

**Architecture:** One new boolean column on `campaigns` (`allow_gift_if_not_attending`, default `FALSE`), threaded through the existing PATCH route → wizard settings UI → employee gift page exactly the way `supports_arrival_certificates` already is. No changes to the RSVP API, the choose-gift API, or the distributor verify/redeem flow — this is purely a display gate on `GiftRedemptionView`.

**Tech Stack:** Next.js App Router, Supabase (Postgres), TypeScript, Vitest, Tailwind.

## Global Constraints

- Default `FALSE` for the new column — no behavior change for existing campaigns until an admin opts in.
- The checkbox is only rendered when `supports_arrival_certificates` is on; store the value in the DB unconditionally (no CHECK constraint tying the two columns together).
- Settings editable only pre-send (`sent_at IS NULL`) — same 409 guard already enforced in `PATCH /api/campaigns/[id]`.
- No changes to `POST /api/gift/[token]/choose`, `POST /api/gift/[token]/rsvp`, `verifyAndRedeem`, or `GiftBreakdown`/`giftDistribution()`.
- A previously chosen `gift_id` is never cleared by an attendance flip in either direction.
- Full spec: `docs/superpowers/specs/2026-07-11-allow-gift-if-not-attending-design.md`.

---

### Task 1: Migration + Campaign type

**Files:**
- Create: `supabase/migrations/20240702000035_allow_gift_if_not_attending.sql`
- Modify: `src/types/index.ts:27-42` (the `Campaign` type)

**Interfaces:**
- Produces: DB column `campaigns.allow_gift_if_not_attending BOOLEAN NOT NULL DEFAULT FALSE`, and the TypeScript field `allow_gift_if_not_attending: boolean` on `Campaign`. Every later task reads/writes this exact name.

- [ ] **Step 1: Write the migration**

```sql
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS allow_gift_if_not_attending BOOLEAN NOT NULL DEFAULT FALSE;
```

Save as `supabase/migrations/20240702000035_allow_gift_if_not_attending.sql`.

- [ ] **Step 2: Apply the migration locally**

Run: `npx supabase db reset` (or the project's usual local-migration command — check `package.json` scripts for a `db:migrate`/`supabase` script first and prefer that if one exists).
Expected: migration runs with no errors; `campaigns` table now has `allow_gift_if_not_attending` defaulting to `false`.

- [ ] **Step 3: Update the `Campaign` type**

In `src/types/index.ts`, add the field to the existing type (around line 38-39, next to `max_attendee_count`):

```ts
export type Campaign = {
  id: string
  company_id: string
  name: string
  campaign_date: string | null
  created_by: string | null
  created_at: string
  sent_at: string | null
  closed_at: string | null
  scheduled_at: string | null
  scheduled_confirmed_at: string | null
  supports_arrival_certificates: boolean
  max_attendee_count: number | null
  allow_gift_if_not_attending: boolean
  sms_template: string | null
  reminder_sms_template: string | null
}
```

- [ ] **Step 4: Run the existing test suite to confirm nothing broke**

Run: `npm run test`
Expected: all existing tests still pass (this task adds no new tests — it's schema/type only).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20240702000035_allow_gift_if_not_attending.sql src/types/index.ts
git commit -m "feat(db): add campaigns.allow_gift_if_not_attending column"
```

---

### Task 2: PATCH route support + API tests

**Files:**
- Modify: `src/app/api/campaigns/[id]/route.ts:79-141`
- Test: `tests/api/campaign-patch.test.ts`

**Interfaces:**
- Consumes: nothing new from other tasks (this task is independent of Task 1's migration at runtime — the route only needs the column name, which is already decided).
- Produces: `PATCH /api/campaigns/[id]` accepts `{ allowGiftIfNotAttending: boolean }` in the request body and writes `allow_gift_if_not_attending` on the `campaigns` row. Task 3/4 UI code calls this with that exact body key.

- [ ] **Step 1: Write the failing tests**

Add to `tests/api/campaign-patch.test.ts`, right after the existing `'updates the flag on a draft campaign'` test (before the closing `})` of the `describe` block):

```ts
  it('returns 400 when allowGiftIfNotAttending is present but not a boolean', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ allowGiftIfNotAttending: 'yes' }), params)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('allowGiftIfNotAttending must be a boolean')
  })

  it('updates allowGiftIfNotAttending on a draft campaign', async () => {
    const update = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }))
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update,
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ allowGiftIfNotAttending: true }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(update).toHaveBeenCalledWith({ allow_gift_if_not_attending: true })
  })

  it('updates both arrival flags together in one PATCH', async () => {
    const update = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }))
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update,
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ supportsArrivalCertificates: true, allowGiftIfNotAttending: true }), params)
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ supports_arrival_certificates: true, allow_gift_if_not_attending: true })
  })

  it('returns 409 for allowGiftIfNotAttending when the campaign was already sent', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: '2026-06-01T00:00:00Z' } }) }) }) }),
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ allowGiftIfNotAttending: true }), params)
    expect(res.status).toBe(409)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/api/campaign-patch.test.ts`
Expected: the 4 new tests FAIL (route doesn't recognize `allowGiftIfNotAttending` yet, so `update` is called with `{}` or the 400 "No recognized fields" path is hit / the 400 "not a boolean" check never fires).

- [ ] **Step 3: Implement the route change**

In `src/app/api/campaigns/[id]/route.ts`, extend the `update` object type (around line 79-86):

```ts
  const update: {
    name?: string
    campaign_date?: string
    supports_arrival_certificates?: boolean
    max_attendee_count?: number | null
    allow_gift_if_not_attending?: boolean
    sms_template?: string | null
    wizard_last_step?: number
  } = {}
```

Then add a new validation block right after the existing `maxAttendeeCount` block (after line 123, before the `smsTemplate` block):

```ts
  if ('allowGiftIfNotAttending' in body) {
    if (typeof body.allowGiftIfNotAttending !== 'boolean') {
      return NextResponse.json({ error: 'allowGiftIfNotAttending must be a boolean' }, { status: 400 })
    }
    update.allow_gift_if_not_attending = body.allowGiftIfNotAttending
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/api/campaign-patch.test.ts`
Expected: all tests in the file PASS, including the 4 new ones.

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`
Expected: all tests pass (no regressions to other routes).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/campaigns/[id]/route.ts tests/api/campaign-patch.test.ts
git commit -m "feat(api): support allowGiftIfNotAttending in campaign PATCH"
```

---

### Task 3: ArrivalCertToggle checkbox + translations

**Files:**
- Modify: `src/components/admin/ArrivalCertToggle.tsx`
- Modify: `src/lib/i18n/translations.he.ts:37` (insert after the existing arrival-certificates strings)

**Interfaces:**
- Consumes: `PATCH /api/campaigns/[id]` body key `allowGiftIfNotAttending` (Task 2).
- Produces: `ArrivalCertToggle` now requires a new prop `initialAllowGiftIfNotAttending: boolean`. Task 4 must pass this prop wherever `<ArrivalCertToggle>` is rendered, or the build fails type-checking.

- [ ] **Step 1: Update the component**

Replace the full contents of `src/components/admin/ArrivalCertToggle.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

export function ArrivalCertToggle({
  campaignId,
  initial,
  initialMax,
  initialAllowGiftIfNotAttending,
}: {
  campaignId: string
  initial: boolean
  initialMax: number | null
  initialAllowGiftIfNotAttending: boolean
}) {
  const t = useT()
  const router = useRouter()
  const [enabled, setEnabled] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [maxValue, setMaxValue] = useState<string>(initialMax != null ? String(initialMax) : '')
  const [allowGiftIfNotAttending, setAllowGiftIfNotAttending] = useState(initialAllowGiftIfNotAttending)

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

  async function toggleAllowGift() {
    if (busy) return
    const next = !allowGiftIfNotAttending
    setBusy(true)
    setAllowGiftIfNotAttending(next)
    await patch({ allowGiftIfNotAttending: next }, () => setAllowGiftIfNotAttending(!next))
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-3 bg-white rounded-2xl border border-zinc-200 p-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={toggle}
          className="mt-0.5 w-4 h-4 accent-[var(--brand)]"
        />
        <span>
          <span className="block text-sm font-medium text-zinc-900">{t('Supports Arrival Certificates')}</span>
          <span className="block text-xs text-zinc-500">{t('Let people confirm attendance and how many are coming.')}</span>
        </span>
      </label>

      {enabled && (
        <div className="flex flex-col gap-4 ps-7">
          <div className="flex flex-col gap-1.5">
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
              className="w-32 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-brand"
            />
            <span className="text-xs text-zinc-500">{t('e.g. 5 = the person plus up to 4 guests.')}</span>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={allowGiftIfNotAttending}
              disabled={busy}
              onChange={toggleAllowGift}
              className="mt-0.5 w-4 h-4 accent-[var(--brand)]"
            />
            <span>
              <span className="block text-sm font-medium text-zinc-900">
                {t("Let people who aren't coming still choose a gift")}
              </span>
              <span className="block text-xs text-zinc-500">
                {t("Off: they'll see a message instead of the gift picker. On: they can still pick a gift and get their QR code even if they're not attending.")}
              </span>
            </span>
          </label>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add Hebrew translations**

In `src/lib/i18n/translations.he.ts`, insert after line 37 (`'Let people confirm attendance and how many are coming.': ...`):

```ts
  "Let people who aren't coming still choose a gift": 'אפשר למי שלא מגיע לבחור מתנה בכל זאת',
  "Off: they'll see a message instead of the gift picker. On: they can still pick a gift and get their QR code even if they're not attending.":
    'כבוי: הם יראו הודעה במקום בורר המתנות. פעיל: הם עדיין יוכלו לבחור מתנה ולקבל את קוד ה-QR שלהם גם אם הם לא מגיעים.',
```

- [ ] **Step 3: Run the full test suite**

Run: `npm run test`
Expected: all tests pass. This component has no existing unit test file, and per the project's established convention (see `docs/superpowers/specs/2026-06-24-max-attendees-per-campaign-design.md`, "Testing" section), UI toggle components aren't unit tested here — this task is implementation only, verified manually in Task 6.

- [ ] **Step 4: Run type checking**

Run: `npx tsc --noEmit`
Expected: fails right now, because no caller passes `initialAllowGiftIfNotAttending` yet (Task 4 fixes this). Confirm the *only* new error is about the missing prop on `<ArrivalCertToggle>` in `CampaignWizard.tsx` — if there are other unrelated errors, stop and investigate before proceeding.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/ArrivalCertToggle.tsx src/lib/i18n/translations.he.ts
git commit -m "feat(ui): add allow-gift-if-not-attending checkbox to ArrivalCertToggle"
```

---

### Task 4: Wire the campaign prop through the wizard and detail page

**Files:**
- Modify: `src/components/admin/wizard/CampaignWizard.tsx:25-40` (prop type), `:215-219` (ArrivalCertToggle usage), `:229-236` (review step summary)
- Modify: `src/app/admin/campaigns/[id]/page.tsx:46` (select), `:138-147` (CampaignWizard prop object)
- Modify: `src/lib/i18n/translations.he.ts` (two more strings)

**Interfaces:**
- Consumes: `Campaign.allow_gift_if_not_attending` (Task 1), `ArrivalCertToggle`'s `initialAllowGiftIfNotAttending` prop (Task 3).
- Produces: `CampaignWizard`'s `campaign` prop now requires `allow_gift_if_not_attending: boolean`. No later task consumes this directly — it's the final link in the chain.

- [ ] **Step 1: Extend the campaign select in the detail page**

In `src/app/admin/campaigns/[id]/page.tsx`, line 46, add the new column to the existing select:

```ts
      .select('id, name, campaign_date, sent_at, closed_at, supports_arrival_certificates, max_attendee_count, allow_gift_if_not_attending, sms_template, reminder_sms_template, wizard_last_step')
```

- [ ] **Step 2: Pass the field into `CampaignWizard`**

In the same file, in the `CampaignWizard` prop object (around line 138-147), add:

```tsx
            <CampaignWizard
              campaign={{
                id: campaign.id,
                name: campaign.name,
                campaign_date: campaign.campaign_date,
                supports_arrival_certificates: campaign.supports_arrival_certificates,
                max_attendee_count: campaign.max_attendee_count,
                allow_gift_if_not_attending: campaign.allow_gift_if_not_attending,
                sms_template: campaign.sms_template,
                reminder_sms_template: campaign.reminder_sms_template,
                wizard_last_step: campaign.wizard_last_step,
              }}
```

- [ ] **Step 3: Extend `CampaignWizard`'s prop type**

In `src/components/admin/wizard/CampaignWizard.tsx`, extend the `campaign` type (lines 26-35):

```ts
  campaign: {
    id: string
    name: string
    campaign_date: string | null
    supports_arrival_certificates: boolean
    max_attendee_count: number | null
    allow_gift_if_not_attending: boolean
    sms_template: string | null
    reminder_sms_template: string | null
    wizard_last_step: number
  }
```

- [ ] **Step 4: Pass the prop into `ArrivalCertToggle`**

In the same file, at the existing `<ArrivalCertToggle>` usage (lines 215-219):

```tsx
                  <ArrivalCertToggle
                    campaignId={campaign.id}
                    initial={campaign.supports_arrival_certificates}
                    initialMax={campaign.max_attendee_count}
                    initialAllowGiftIfNotAttending={campaign.allow_gift_if_not_attending}
                  />
```

- [ ] **Step 5: Add the Review & Launch summary row**

In the same file, in the step-5 summary `dl` (lines 229-236), add a row right after the Arrival Certificates row, shown only when arrival certificates is on:

```tsx
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-zinc-500">{t('Campaign name')}</dt><dd className="text-zinc-900">{name || '—'}</dd>
              <dt className="text-zinc-500">{t('Campaign date')}</dt><dd className="text-zinc-900">{campaignDate || '—'}</dd>
              <dt className="text-zinc-500">{t('Employees')}</dt><dd className="text-zinc-900">{employeeCount}</dd>
              <dt className="text-zinc-500">{t('Gift options')}</dt><dd className="text-zinc-900">{gifts.length}</dd>
              <dt className="text-zinc-500">{t('Arrival Certificates')}</dt>
              <dd className="text-zinc-900">{campaign.supports_arrival_certificates ? t('On') : t('Off')}</dd>
              {campaign.supports_arrival_certificates && (
                <>
                  <dt className="text-zinc-500">{t('Gift if not attending')}</dt>
                  <dd className="text-zinc-900">{campaign.allow_gift_if_not_attending ? t('Allowed') : t('Skipped')}</dd>
                </>
              )}
            </dl>
```

- [ ] **Step 6: Add the two new translations**

In `src/lib/i18n/translations.he.ts`, add near the other arrival-certificates strings:

```ts
  'Gift if not attending': 'מתנה למי שלא מגיע',
  'Allowed': 'מותר',
  'Skipped': 'מדולג',
```

- [ ] **Step 7: Run type checking**

Run: `npx tsc --noEmit`
Expected: no errors (the missing-prop error from Task 3 Step 4 is now resolved).

- [ ] **Step 8: Run the full test suite**

Run: `npm run test`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/wizard/CampaignWizard.tsx src/app/admin/campaigns/[id]/page.tsx src/lib/i18n/translations.he.ts
git commit -m "feat(ui): thread allow_gift_if_not_attending through the campaign wizard"
```

---

### Task 5: Gate the employee gift page on the new flag

**Files:**
- Modify: `src/app/gift/[token]/page.tsx`
- Modify: `src/components/gift/GiftRedemptionView.tsx`

**Interfaces:**
- Consumes: `campaigns.allow_gift_if_not_attending` (Task 1).
- Produces: `GiftRedemptionView`'s `Props` now includes `allowGiftIfNotAttending: boolean` (required). This is the last task — nothing downstream consumes it.

- [ ] **Step 1: Extend the campaign select and cast in the gift page**

In `src/app/gift/[token]/page.tsx`, update the token/campaign select (line 21) to include the new column inside the nested `campaigns(...)` select:

```ts
    .select('employee_name, redeemed, qr_image_url, gift_id, campaign_id, attending, attendee_count, campaigns(name, supports_arrival_certificates, max_attendee_count, allow_gift_if_not_attending)')
```

Widen the local cast (line 27):

```ts
  const campaign = tokenRow.campaigns as unknown as {
    name: string
    supports_arrival_certificates: boolean
    max_attendee_count: number | null
    allow_gift_if_not_attending: boolean
  } | null
```

Add a resolved local next to the existing `supportsArrival` / `maxCount` lines (line 28-29):

```ts
  const supportsArrival = campaign?.supports_arrival_certificates ?? false
  const maxCount = campaign?.max_attendee_count ?? null
  const allowGiftIfNotAttending = campaign?.allow_gift_if_not_attending ?? false
```

- [ ] **Step 2: Pass the new prop in both render branches**

In the same file, add `allowGiftIfNotAttending={allowGiftIfNotAttending}` to both `<GiftRedemptionView>` calls — the redeemed branch (around line 32-47) and the non-redeemed branch (around line 62-76):

```tsx
      <GiftRedemptionView
        token={token}
        employeeName={tokenRow.employee_name}
        campaignName={campaign?.name ?? null}
        redeemed
        qrImageUrl={null}
        gifts={[]}
        needsChoice={false}
        chosenGiftName={null}
        supportsArrival={supportsArrival}
        attending={tokenRow.attending}
        attendeeCount={tokenRow.attendee_count}
        maxCount={maxCount}
        allowGiftIfNotAttending={allowGiftIfNotAttending}
      />
```

and

```tsx
    <GiftRedemptionView
      token={token}
      employeeName={tokenRow.employee_name}
      campaignName={campaign?.name ?? null}
      redeemed={false}
      qrImageUrl={tokenRow.qr_image_url}
      gifts={gifts.map((g) => ({ id: g.id, name: g.name }))}
      needsChoice={needsChoice}
      chosenGiftName={chosenGift?.name ?? null}
      supportsArrival={supportsArrival}
      attending={tokenRow.attending}
      attendeeCount={tokenRow.attendee_count}
      maxCount={maxCount}
      allowGiftIfNotAttending={allowGiftIfNotAttending}
    />
```

- [ ] **Step 3: Update `GiftRedemptionView`'s Props and gating logic**

In `src/components/gift/GiftRedemptionView.tsx`, add the new prop to `Props` (lines 10-23):

```ts
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
  maxCount: number | null
  allowGiftIfNotAttending: boolean
}
```

Destructure it in the component signature (lines 25-38), adding `allowGiftIfNotAttending` to the parameter list.

Change the gating logic (lines 56-58):

```ts
  // For arrival-certificate campaigns, the RSVP gates the gift QR — unless the
  // campaign explicitly allows non-attendees to still receive a gift.
  const showRsvpForm = supportsArrival && (attending === null || editing)
  const showNotComing = supportsArrival && attending === false && !allowGiftIfNotAttending && !editing
```

(No other lines in the file change — the `needsChoice` / chosen-gift / QR branches already do the right thing once `showNotComing` is `false`.)

- [ ] **Step 4: Run type checking**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run the full test suite**

Run: `npm run test`
Expected: all tests pass — this task has no existing test file covering `GiftRedemptionView` or `gift/[token]/page.tsx` (no precedent for component tests here), so no test changes are expected. Confirm `tests/api/gift-choose.test.ts`, `tests/api/gift-rsvp.test.ts`, and `tests/api/verify.test.ts` are unaffected (unchanged files).

- [ ] **Step 6: Commit**

```bash
git add src/app/gift/[token]/page.tsx src/components/gift/GiftRedemptionView.tsx
git commit -m "feat(gift): let campaigns allow gift selection for non-attendees"
```

---

### Task 6: Manual end-to-end verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: the fully wired feature from Tasks 1-5.
- Produces: nothing — this is the final confidence check before calling the feature done.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (background/separate terminal)

- [ ] **Step 2: Create a test campaign with Arrival Certificates on**

In the browser, go to `/admin/campaigns/new`, add one employee, open Advanced Settings, and turn on "Supports Arrival Certificates." Confirm the new "Let people who aren't coming still choose a gift" checkbox appears, unchecked by default.

- [ ] **Step 3: Verify the off (default) behavior**

With the checkbox left unchecked, launch the campaign (or use the dev preview route if launching requires SMS credits — check `src/app/(dev)/dev/preview/[campaignId]/page.tsx` for a no-SMS preview link) and open the employee's gift link. Mark "I'm not coming." Confirm the page shows the "you marked that you're not coming" message and does **not** show a gift picker or QR code — matching today's behavior exactly.

- [ ] **Step 4: Verify the on behavior**

Go back to the campaign's Advanced Settings and check "Let people who aren't coming still choose a gift." Reload the employee's gift link (still marked not-coming). Confirm the gift picker (or QR code, if single-gift) now shows normally, exactly as it would for an attendee.

- [ ] **Step 5: Verify the changed-mind flow**

With the checkbox still on, choose a gift while not-attending. Then click "Change my answer" and switch to "I'm coming." Confirm the same previously-chosen gift/QR is shown — no re-choice prompt. Then switch back to "I'm not coming" and confirm the same gift/QR is still shown (checkbox is on, so it stays visible) with the same gift as before (i.e., `gift_id` was never reset by any of these flips).

- [ ] **Step 6: Verify the settings lock after send**

On a launched (sent) campaign, confirm there is no way to reach the Advanced Settings / ArrivalCertToggle UI (it only renders in the draft wizard, per `isDraft` in `src/app/admin/campaigns/[id]/page.tsx`) — consistent with the existing pre-send-only lifecycle for `supports_arrival_certificates`.

- [ ] **Step 7: Report results**

Summarize pass/fail for each step above. If any step fails, do not mark this task complete — file it as a bug against the relevant task instead.
