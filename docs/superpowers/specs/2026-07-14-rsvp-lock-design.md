# RSVP Lock (Freeze New Registrations) — Design

**Date:** 2026-07-14
**Status:** Approved, pending implementation plan
**Builds on:** `2026-06-22-arrival-certificates-design.md`, `2026-06-24-max-attendees-per-campaign-design.md`,
`2026-07-11-allow-gift-if-not-attending-design.md`

## Summary

Campaign `8a58fd6d-4b38-4442-bbd2-80c38abb16d8` needs new RSVPs frozen: anyone who has
already answered `attending = true` stays registered and can still adjust their headcount;
anyone who answered `false` or hasn't answered yet can no longer switch to "yes" and should
see an "event is full" message instead of the RSVP form. This is a one-off lock for this
single campaign, not a numeric capacity feature and not a full campaign close (`closed_at`
is untouched — redemption, gift picking, etc. all still work normally).

## Decisions (locked during brainstorming)

1. **Not capacity math.** No headcount threshold, no counting registrants. This is a binary
   per-campaign freeze: new "yes" answers blocked, existing "yes" answers unaffected.
2. **No admin UI.** A DB column enforced by the API, flipped for this one campaign via a
   scoped `UPDATE` in the migration itself. No toggle in `ArrivalCertToggle` or the wizard.
   If a future campaign needs this, extending to an admin toggle is a separate follow-up.
3. **Grandfather rule is based on current state, not a snapshot in time.** A token is exempt
   from the lock if and only if its `attending` column is currently `true` at request time.
   If someone said yes, then later changes their mind to "no", they lose the exemption and
   cannot flip back to "yes" while the campaign is locked — consistent with "if you marked
   no ... you can't register."
4. **Headcount edits for already-yes tokens are unrestricted.** The lock only gates the
   `false/null → true` transition. Existing `max_attendee_count` (already 4 for this
   campaign) continues to be the only cap on group size.
5. **Opting out (`attending: false`) is always allowed**, locked or not — never blocked.
6. **Admin override endpoint is exempt.** `PATCH /api/campaigns/[id]/tokens/[tokenId]/attendance`
   already documents "admin override is allowed anytime, including after redemption" — this
   change doesn't touch that route.

## Data model

New migration `supabase/migrations/<ts>_campaign_rsvp_locked.sql`:

```sql
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS rsvp_locked BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE campaigns
  SET rsvp_locked = TRUE
  WHERE id = '8a58fd6d-4b38-4442-bbd2-80c38abb16d8';
```

- Default `FALSE` for every campaign (including this one until the migration runs) — no
  behavior change anywhere else.
- Add `rsvp_locked: boolean` to the campaign type in `src/types/index.ts`, alongside
  `allow_gift_if_not_attending` (`src/types/index.ts:38-40`).
- **Deployment note:** applying this migration to the live database (`supabase db push` or
  equivalent) is a separate step for whoever runs deploys — not done automatically as part
  of writing the migration file.

## API — RSVP submission

`src/app/api/gift/[token]/rsvp/route.ts`:

- Extend the select to also pull the token's current `attending` and the campaign's
  `rsvp_locked`:
  ```ts
  .select('redeemed, attending, campaigns(supports_arrival_certificates, closed_at, max_attendee_count, rsvp_locked)')
  ```
- Widen the local campaign cast to include `rsvp_locked: boolean`.
- In the `if (attending)` branch, after the existing `over_limit` check, add:
  ```ts
  if (campaign.rsvp_locked && tokenRow.attending !== true) {
    return NextResponse.json({ ok: false, error: 'event_full' }, { status: 409 })
  }
  ```
- No change when `attending` is `false` — opting out is never blocked.
- No change to the atomic `WHERE redeemed = false` update — this is a business-rule gate
  checked before that update, not a concurrency-sensitive redemption path.

## UI — employee gift page

`src/app/gift/[token]/page.tsx`:

- Extend the `campaigns(...)` select to include `rsvp_locked`.
- Widen the local campaign cast to include `rsvp_locked: boolean`.
- Pass `rsvpLocked={campaign?.rsvp_locked ?? false}` to `GiftRedemptionView` in both render
  branches (redeemed and not-redeemed).

`src/components/gift/GiftRedemptionView.tsx`:

- Add `rsvpLocked: boolean` to `Props`.
- Add: `const lockedOut = supportsArrival && rsvpLocked && attending !== true`.
- Update the branch conditions:
  ```ts
  const showRsvpForm = supportsArrival && !lockedOut && (attending === null || editing)
  const showEventFull = supportsArrival && lockedOut && (attending === null || editing)
  const showNotComing = supportsArrival && attending === false && !allowGiftIfNotAttending && !editing && !lockedOut
  ```
- New render branch (checked before `showRsvpForm`): when `showEventFull`, render a static
  message card — no form, no "change my answer" link (there's nothing to change to):
  - Heading/body: **"This event is full. Registration is closed."**
- All other branches (QR/gift display, `needsChoice`, already-`true` editing flow) are
  unchanged — `lockedOut` is `false` whenever `attending === true`, so confirmed attendees
  see exactly today's behavior, including the ability to edit their headcount via "Change my
  answer."

## i18n

Add to `src/lib/i18n/translations.he.ts`, alongside the existing RSVP strings
(`translations.he.ts:47-73`):

- "This event is full. Registration is closed." → Hebrew equivalent.

## Testing

- `tests/api/gift-rsvp.test.ts` (extend):
  - `rsvp_locked = true`, token `attending = null`, submit `attending: true` → `409 event_full`.
  - `rsvp_locked = true`, token `attending = false`, submit `attending: true` → `409 event_full`.
  - `rsvp_locked = true`, token `attending = true`, resubmit `attending: true` with a new
    `attendeeCount` → succeeds, count updates (grandfathered).
  - `rsvp_locked = true`, any token, submit `attending: false` → succeeds (opt-out never
    blocked).
  - `rsvp_locked = false` (default) → all existing tests unaffected.
- Add/extend a focused test for `GiftRedemptionView` covering the `lockedOut` matrix:
  - `rsvpLocked=false` → unchanged in every case (existing behavior).
  - `rsvpLocked=true, attending=null` → "event full" message, no RSVP form.
  - `rsvpLocked=true, attending=false` → "event full" message (not the old "not coming"
    message), no "change my answer".
  - `rsvpLocked=true, attending=true` → normal QR/gift view, "change my answer" still works.
- Confirm `PATCH /api/campaigns/[id]/tokens/[tokenId]/attendance` tests are unaffected (no
  code change there).

## Out of scope

- Any numeric capacity/headcount threshold.
- Admin UI toggle for `rsvp_locked`.
- Any change to `closed_at` / full campaign closing behavior.
- Any change to the admin manual-override attendance endpoint.
- Applying this to any campaign other than `8a58fd6d-4b38-4442-bbd2-80c38abb16d8`.
- Actually running the migration against the live database.
