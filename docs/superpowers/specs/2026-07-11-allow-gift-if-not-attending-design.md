# Allow Gift If Not Attending — Design

**Date:** 2026-07-11
**Status:** Approved, pending implementation plan
**Builds on:** `2026-06-22-arrival-certificates-design.md`, `2026-06-24-max-attendees-per-campaign-design.md`

## Summary

Arrival Certificates campaigns let an employee RSVP (`attending: true/false`) before
seeing their gift QR. Today, marking "not coming" is a hard, hardcoded stop:
`GiftRedemptionView` always hides the gift picker/QR and shows only a "you're not coming"
message with a "change my answer" link — there is no way for an admin to let non-attendees
still pick a gift. This change adds a per-campaign checkbox, nested under the existing
"Supports Arrival Certificates" toggle, that lets an admin opt in to showing the gift
picker/QR to employees regardless of their RSVP answer.

## Decisions (locked during brainstorming)

1. **Scope of the checkbox:** nested inside the existing Arrival Certificates settings
   block, only rendered/meaningful when `supports_arrival_certificates` is on — the
   "not attending" concept doesn't exist otherwise.
2. **Default:** `FALSE` for both new and existing campaigns — matches today's hardcoded
   skip behavior exactly. No behavior change until an admin opts in.
3. **Blast radius:** gift-link page only. `POST /api/gift/[token]/choose`,
   `POST /api/gift/[token]/rsvp`, and `verifyAndRedeem` (distributor scan / `/verify/[token]`)
   are unchanged. A distributor can already redeem a walk-in regardless of RSVP status
   today (`verifyAndRedeem` never reads `attending`), and that stays true.
4. **Changed-mind flow (attending → not attending, after already choosing a gift):**
   the stored `gift_id` is left untouched. The gift page simply re-applies the checkbox
   rule like any other non-attendee: hidden if the checkbox is off, still shown (with the
   already-chosen gift) if it's on. Flipping back to attending later shows the same gift
   again with no re-choice needed. No new state, no "release"/"reclaim" logic — consistent
   with `gift_id` being the single source of truth for a chosen gift, and there being no
   per-gift stock/quantity concept in `campaign_gifts` to reclaim.
5. **Gift Breakdown / `giftDistribution()` reporting:** **unchanged.** It already counts by
   `gift_id` presence alone, ignoring `attending` entirely — a chosen gift counts whether
   or not the employee is currently marked attending, since they could still flip back
   before the event. No new "excluded" bucket.
6. **Configured pre-send only:** same lifecycle as `supports_arrival_certificates` /
   `max_attendee_count` — editable via `PATCH /api/campaigns/[id]`, blocked once
   `sent_at` is set (existing 409 guard, unchanged).

## Data model

New migration `supabase/migrations/<ts>_allow_gift_if_not_attending.sql`:

```sql
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS allow_gift_if_not_attending BOOLEAN NOT NULL DEFAULT FALSE;
```

- Add `allow_gift_if_not_attending: boolean` to the campaign type in `src/types/index.ts`
  (alongside `supports_arrival_certificates` / `max_attendee_count`, `src/types/index.ts:38`).

## API — campaign config

`PATCH /api/campaigns/[id]/route.ts`:

- Add a new optional field to the `update` object type: `allow_gift_if_not_attending?: boolean`.
- New block, same shape as the existing `supportsArrivalCertificates` handling:
  ```ts
  if ('allowGiftIfNotAttending' in body) {
    if (typeof body.allowGiftIfNotAttending !== 'boolean') {
      return NextResponse.json({ error: 'allowGiftIfNotAttending must be a boolean' }, { status: 400 })
    }
    update.allow_gift_if_not_attending = body.allowGiftIfNotAttending
  }
  ```
- No change to the partial-update mechanics, the `sent_at` guard, or audit logging
  (`campaign.updated` metadata already logs whatever is in `update`).

`POST /api/campaigns/route.ts` (create): **unchanged** — not settable at creation, same
rationale as `max_attendee_count` (campaign stays editable pre-send).

## UI — admin configuration

`src/components/admin/ArrivalCertToggle.tsx`:

- New prop `initialAllowGiftIfNotAttending: boolean`.
- New local state `allowGiftIfNotAttending`, mirroring the `enabled` boolean's optimistic
  toggle pattern (`patch({ allowGiftIfNotAttending: next }, revert)`).
- Rendered only when `enabled` (the arrival-certificates toggle) is true, alongside the
  existing max-attendees input:
  - Label: **"Let people who aren't coming still choose a gift"**
  - Helper text: **"Off: they'll see a message instead of the gift picker. On: they can
    still pick a gift and get their QR code even if they're not attending."**
- `src/app/admin/campaigns/[id]/page.tsx` (already selects the campaign row) — extend the
  select to include `allow_gift_if_not_attending` and pass it through.
- `src/components/admin/wizard/CampaignWizard.tsx` — extend the `campaign` prop type with
  `allow_gift_if_not_attending: boolean` and pass `initialAllowGiftIfNotAttending` through
  to `<ArrivalCertToggle>` at `CampaignWizard.tsx:215-219`. Extend the wizard's campaign
  fetch (wherever `CampaignWizard` is rendered, e.g.
  `src/app/admin/campaigns/[id]/page.tsx` / `.../new/page.tsx`) to select the new column.
- Review & Launch step (`CampaignWizard.tsx`, step 5 summary `dl`, around line 234-235):
  add a row matching the existing "Arrival Certificates: On/Off" row, shown only when
  `campaign.supports_arrival_certificates` is true:
  `<dt>{t('Gift if not attending')}</dt><dd>{campaign.allow_gift_if_not_attending ? t('Allowed') : t('Skipped')}</dd>`.

## UI — employee gift page

`src/app/gift/[token]/page.tsx`:

- Extend the `campaigns(...)` select to include `allow_gift_if_not_attending`.
- Widen the local campaign cast to include `allow_gift_if_not_attending: boolean`.
- Pass `allowGiftIfNotAttending={campaign?.allow_gift_if_not_attending ?? false}` to
  `GiftRedemptionView` in both render branches (redeemed and not-redeemed).

`src/components/gift/GiftRedemptionView.tsx`:

- Add `allowGiftIfNotAttending: boolean` to `Props`.
- Replace the current unconditional gate:
  ```ts
  const showNotComing = supportsArrival && attending === false && !editing
  ```
  with:
  ```ts
  const showNotComing = supportsArrival && attending === false && !allowGiftIfNotAttending && !editing
  ```
- No other branch changes needed: when `allowGiftIfNotAttending` is true and
  `attending === false`, the view falls through to the existing `needsChoice` / chosen-gift
  / QR branches exactly as it would for an attendee. The "Change my answer" link in the QR
  branch (`GiftRedemptionView.tsx:110-118`, gated on `supportsArrival`) already covers this
  case with no change.

## i18n

Add to `src/lib/i18n/translations.he.ts`:

- "Let people who aren't coming still choose a gift" (checkbox label)
- "Off: they'll see a message instead of the gift picker. On: they can still pick a gift
  and get their QR code even if they're not attending." (helper text)
- "Gift if not attending" (review-step summary row label)
- "Allowed" / "Skipped" (review-step summary row values)

## Testing

- `tests/api/campaign-patch.test.ts` (extend): `allowGiftIfNotAttending` boolean persists;
  non-boolean → `400`; partial update with only this field (no other fields) works; combined
  with other fields in one PATCH works; `sent_at` set → `409` (existing guard still holds).
- Add a focused test (new or extended existing suite covering `GiftRedemptionView` /
  `gift/[token]/page.tsx` logic, if such coverage exists) for the four-state matrix:
  - `supportsArrival=false` → picker/QR always shown (flag irrelevant), unchanged.
  - `attending=null` → RSVP form shown (flag irrelevant), unchanged.
  - `attending=false, allowGiftIfNotAttending=false` → "not coming" message, no picker/QR
    (today's behavior, unchanged).
  - `attending=false, allowGiftIfNotAttending=true` → picker/QR shown exactly as an
    attendee would see it.
- No change expected to `tests/api/gift-choose.test.ts`, `tests/api/gift-rsvp.test.ts`,
  or `tests/api/verify.test.ts` — confirm by running them, don't add new cases there.

## Out of scope

- Any change to `/api/gift/[token]/choose`, `/api/gift/[token]/rsvp`, or `verifyAndRedeem`.
- Clearing/reclaiming a previously chosen `gift_id` on a changed-mind flip.
- Excluding non-attendees from `GiftBreakdown` / `giftDistribution()`.
- Setting this flag at campaign creation time.
- Any per-token override of this campaign-level setting.
