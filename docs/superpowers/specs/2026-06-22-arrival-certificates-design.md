# Arrival Certificates (אישור הגעה) — Design

**Date:** 2026-06-22
**Status:** Approved, pending implementation plan

## Summary

Add an optional, per-campaign RSVP layer ("Arrival Certificates" / אישור הגעה) on top of
the existing QR gift-delivery flow. When a campaign opts in, the person who opens their
gift link is asked whether they are coming, and if so, how many people are coming with
them (headcount). HR can see how many people confirmed and the total number of arriving
people. Campaigns that do **not** opt in behave exactly as they do today.

This is **RSVP only** — no certificate document/PDF is generated. "Arrival Certificate"
is the product name for the attendance-confirmation feature.

## Decisions (locked during brainstorming)

1. **Scope:** RSVP/attendance confirmation only. No generated certificate artifact.
2. **Not-coming + QR:** The QR is *gated on the RSVP* for arrival-cert campaigns. Marking
   "not coming" hides the gift QR.
3. **Default state (no answer yet):** Ask first, then reveal the QR. The RSVP question is
   shown first; choosing "coming" (+ count) reveals the QR (and the gift picker for
   multi-gift campaigns); choosing "not coming" shows a confirmation and no QR.
4. **Update window:** The answer is editable while the campaign is open, but **locks once
   the gift token is redeemed** (the gift has been collected).
5. **Totals are derived, never stored.** Reports re-aggregate from `gift_tokens` on every
   read, so totals are always correct after an update — consistent with how redemption
   counts already work and with the project rule that Supabase is the single source of
   truth.

## Backward compatibility

`campaigns.supports_arrival_certificates` defaults to `FALSE`. Every existing campaign,
and any new campaign that does not opt in, is completely unaffected: the `/gift/[token]`
page, the verify/scan redemption path, and the admin campaign view all behave exactly as
today. New behavior is reached only behind `supports_arrival_certificates = TRUE`.

## Data model

New migration: `supabase/migrations/20240622000029_arrival_certificates.sql`.

### `campaigns`
```sql
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS supports_arrival_certificates BOOLEAN NOT NULL DEFAULT FALSE;
```

### `gift_tokens`
```sql
ALTER TABLE gift_tokens
  ADD COLUMN IF NOT EXISTS attending      BOOLEAN,      -- NULL = no response, TRUE = coming, FALSE = not coming
  ADD COLUMN IF NOT EXISTS attendee_count INT,          -- headcount INCLUDING the person; required iff attending = TRUE
  ADD COLUMN IF NOT EXISTS responded_at   TIMESTAMPTZ;  -- set/updated on each response

ALTER TABLE gift_tokens
  ADD CONSTRAINT attendee_count_consistency CHECK (
    (attending = TRUE  AND attendee_count IS NOT NULL AND attendee_count >= 1) OR
    (attending IS DISTINCT FROM TRUE AND attendee_count IS NULL)
  );
```

**Headcount semantics:** `attendee_count` includes the person themselves. Coming alone =
`1`; coming with a spouse = `2`. This matches the requirement example (counts `1, 2, 4`
⇒ total `7`).

The CHECK enforces the validation rules at the DB layer: count is required and positive
only when `attending = TRUE`; in every other state (`NULL` no-response, or `FALSE` not
coming) the count must be `NULL`.

### Derived totals (no stored counters)
- **Approved people** = `COUNT(*) WHERE attending = TRUE`
- **Total arriving** = `COALESCE(SUM(attendee_count), 0) WHERE attending = TRUE`
- Not coming = `COUNT(*) WHERE attending = FALSE`
- No response = `COUNT(*) WHERE attending IS NULL`

RLS: no new policies required — both columns live on existing tables (`campaigns`,
`gift_tokens`) already covered by company-isolation policies. The employee RSVP write goes
through the service client, exactly like the existing `…/choose` route.

## API

### `POST /api/gift/[token]/rsvp` (new)
Mirrors `src/app/api/gift/[token]/choose/route.ts` (service client, unauthenticated — the
attendee is not a logged-in user).

Request body: `{ attending: boolean, attendeeCount?: number }`

Guards (reject with appropriate status):
- token does not exist → `404 { ok: false, error: 'invalid' }`
- campaign `supports_arrival_certificates = FALSE` → `400 { ok: false, error: 'not_supported' }`
- campaign closed (`closed_at` set) → `409 { ok: false, error: 'campaign_closed' }`
- token already redeemed → `409 { ok: false, error: 'locked' }` (lock-once-redeemed)

Validation:
- `attending === true` → `attendeeCount` must be an integer `>= 1`, else
  `400 { ok: false, error: 'invalid_count' }`. Store `attending = true`,
  `attendee_count = attendeeCount`, `responded_at = now()`.
- `attending === false` → ignore/clear count. Store `attending = false`,
  `attendee_count = NULL`, `responded_at = now()`.

Write is an **idempotent overwrite**, not a first-writer lock:
```sql
UPDATE gift_tokens
SET attending = $attending, attendee_count = $count, responded_at = now()
WHERE token = $token AND redeemed = FALSE
RETURNING attending, attendee_count;
```
If `0` rows return, the token was redeemed (locked) between the guard read and the write —
respond `409 { ok: false, error: 'locked' }`. Re-answering simply replaces the previous
answer; because totals are derived, no counter reconciliation is needed.

Response on success: `{ ok: true, attending, attendeeCount }`.

### `POST /api/campaigns` (extend)
Accept `supportsArrivalCertificates?: boolean` (default `false`) and persist it on insert.

### `PATCH /api/campaigns/[id]` (new)
Permission: `campaigns:launch`. Allows flipping `supports_arrival_certificates` **while the
campaign is still a draft** (`sent_at IS NULL`). Body: `{ supportsArrivalCertificates: boolean }`.
Returns `409` if the campaign has already been sent. Writes an audit event
(`campaign.updated`).

## Frontend

### New-campaign form — `src/app/admin/campaigns/new/page.tsx`
Add a checkbox **"Supports Arrival Certificates"** that posts
`supportsArrivalCertificates` to `POST /api/campaigns`.

### Draft campaign detail
Surface the same toggle on the draft view so an admin can change it before sending
(wired to `PATCH /api/campaigns/[id]`).

### Employee flow — `src/app/gift/[token]/page.tsx` + `GiftRedemptionView`
The page additionally selects `campaigns(name, supports_arrival_certificates)` and the
token's `attending, attendee_count`. Branching applies **only when
`supports_arrival_certificates = TRUE`**; otherwise the current flow is untouched.

Render order for an arrival-cert campaign:
1. `redeemed` → existing "Already claimed" view (answer is locked).
2. `attending IS NULL` (no answer yet) → **RSVP form** (`ArrivalRsvp`), QR hidden.
3. `attending = FALSE` → "You marked you're not coming" confirmation + **"Change my answer"**
   that reopens the form. No QR.
4. `attending = TRUE` → existing flow unchanged: gift picker (if multi-gift) → QR, plus a
   **"Change my answer"** affordance (allowed while not redeemed).

### New component — `src/components/gift/ArrivalRsvp.tsx` (client)
- Coming / Not-coming choice.
- "Coming" reveals a numeric headcount input (min `1`, integer); inline validation before
  submit.
- Submits to `POST /api/gift/[token]/rsvp`, then `router.refresh()` so the server page
  re-renders into the correct next state (QR / gift picker / not-coming confirmation).
- Pre-fills from the current answer when reopened via "Change my answer".

### Admin reporting — campaign detail + `src/components/admin/ArrivalSummary.tsx` (new)
Rendered **only when the flag is on**. Computed server-side from the tokens already loaded
on `src/app/admin/campaigns/[id]/page.tsx` (add `attending, attendee_count` to the select):
- **Approved people** (count of `attending = TRUE`)
- **Total arriving** (sum of `attendee_count`)
- Not coming / No response counts for context.

`EmployeeTable` shows an attendance status column (coming +N / not coming / no response)
when the flag is on.

## Types — `src/types/index.ts`
- `Campaign` += `supports_arrival_certificates: boolean`
- `GiftToken` += `attending: boolean | null`, `attendee_count: number | null`,
  `responded_at: string | null`

## Testing (Vitest, mirroring `tests/api/gift-choose.test.ts`)
New file `tests/api/gift-rsvp.test.ts` (plus a campaign-config assertion where the flag is
set/edited):
- **Flag disabled:** RSVP request is rejected (`not_supported`); campaign behaves as today.
- **Flag enabled:** RSVP accepted.
- **Coming with count:** stores `attending = TRUE`, `attendee_count = N`.
- **Not coming:** stores `attending = FALSE`, `attendee_count = NULL`.
- **Update not→coming:** updates to `attending = TRUE` with a count.
- **Update coming→not:** updates to `attending = FALSE`, count cleared to `NULL`.
- **Totals after updates:** approved-count and total-arriving aggregations are correct
  after a sequence of create/update operations (e.g. counts `1, 2, 4` ⇒ approved `3`,
  total `7`).
- **Validation:** coming without a count, or count `< 1` / non-integer → rejected.
- **Lock once redeemed:** RSVP on a redeemed token → `locked`.

## Out of scope
- Generated certificate documents (PDF/image).
- Changing the verify/scan redemption path (it is deliberately untouched).
- Reminders/notifications driven by RSVP state.
- Capacity limits / waitlists.
