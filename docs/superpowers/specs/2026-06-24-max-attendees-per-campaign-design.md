# Max Attendees Per Campaign — Design

**Date:** 2026-06-24
**Status:** Approved, pending implementation plan
**Builds on:** `2026-06-22-arrival-certificates-design.md`, `2026-06-23-attendee-count-column-design.md`

## Summary

In Arrival Certificates mode, employees RSVP with a headcount (`attendee_count`,
including themselves). Today that number is unbounded. This change lets an admin define
a per-campaign **maximum** so an employee cannot RSVP for more people than allowed. The
limit is enforced server-side in the RSVP API and surfaced in the RSVP form.

## Decisions (locked during brainstorming)

1. **What the max counts:** total **people including the employee** — consistent with
   `attendee_count` and `summarizeArrival`. `max_attendee_count = 4` ⇒ the person + up to
   3 guests.
2. **Scope:** **per campaign** (one value for everyone in it), stored alongside
   `supports_arrival_certificates`. Not per-token.
3. **No limit by default:** the column is nullable; `NULL` = unlimited. Existing campaigns
   are unaffected.
4. **Employee RSVP only:** the cap applies to employee self-RSVP
   (`POST /api/gift/[token]/rsvp`). The **admin attendance override**
   (`PATCH …/tokens/[tokenId]/attendance`) stays **unbounded** — it records reality
   (actual arrivals, VIP exceptions), not a request, so it must not be capped.
5. **Configured pre-send only:** set via the toggle area on the campaign detail page,
   editable only while the campaign is unsent (`sent_at IS NULL`), mirroring the existing
   `supports_arrival_certificates` toggle. **Not** settable at campaign creation (YAGNI —
   the campaign is editable until sent, so there is no capability gap).
6. **Lowering the max is not retroactive:** rows that already RSVP'd above a newly-lowered
   max are left as-is (they committed legitimately). Only new/edited RSVPs are checked
   against the current max.

## Data model

New migration `supabase/migrations/<ts>_campaign_max_attendees.sql`:

```sql
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS max_attendee_count INT;

ALTER TABLE campaigns
  ADD CONSTRAINT max_attendee_count_positive
  CHECK (max_attendee_count IS NULL OR max_attendee_count >= 1);
```

- `NULL` = no limit. No default needed (NULL is the implicit default).
- Add `max_attendee_count: number | null` to the campaign type in `src/types/index.ts:38`.

## API — RSVP enforcement (authoritative)

`POST /api/gift/[token]/rsvp/route.ts`:

- Extend the campaign select to include `max_attendee_count`:
  `campaigns(supports_arrival_certificates, closed_at, max_attendee_count)`.
- After the existing `attendeeCount` integer/`>= 1` validation, when **attending** and
  `max_attendee_count !== null && attendeeCount > max_attendee_count`:
  return `400 { ok: false, error: 'over_limit', max: max_attendee_count }`.
- No change to the atomic redeemed-guard UPDATE; this is a pre-write validation.

## API — campaign config

`PATCH /api/campaigns/[id]/route.ts`:

- Today the body **requires** `supportsArrivalCertificates` to be a boolean. Loosen to a
  **partial update**: read both `supportsArrivalCertificates` and `maxAttendeeCount`,
  build the update object from whichever fields are present, and `400` if neither is
  provided.
- `supportsArrivalCertificates` (when present): must be a boolean (unchanged rule) →
  sets `supports_arrival_certificates`.
- `maxAttendeeCount` (when present): `null` clears the limit; otherwise must be an integer
  `>= 1`, else `400 { error: 'invalid_max' }`. Sets `max_attendee_count`.
- Keep the existing guards: auth → `resolveCompanyId` → `campaigns:launch`; campaign must
  exist in company (404); **reject when `sent_at` is set** (409, unchanged).
- Audit `campaign.updated` metadata includes whichever fields changed.

`POST /api/campaigns/route.ts` (create): **unchanged.** Max is not accepted at creation.

## UI — admin configuration

`src/components/admin/ArrivalCertToggle.tsx`:

- When the toggle is **on**, render a compact number input (`min=1`, `step=1`) labelled
  "Max people per invite" with an empty = "no limit" affordance.
- Initial value comes from a new `initialMax: number | null` prop (passed from
  `src/app/admin/campaigns/[id]/page.tsx:167`, which already selects the campaign — extend
  its select to include `max_attendee_count`).
- On commit (blur / Enter), PATCH `{ maxAttendeeCount: parsedIntOrNull }`; on success
  `router.refresh()`, on failure revert the input (same optimistic pattern as the toggle).
- The input is only meaningful pre-send; the toggle area is already only shown pre-send on
  the campaign page, so no extra gating is needed beyond what already exists there.

## UI — employee RSVP form

`src/components/gift/ArrivalRsvp.tsx`:

- New prop `maxCount: number | null`.
- When set: the number input gets `max={maxCount}`; before submit, if
  `attendeeCount > maxCount`, show the over-limit message and do not POST.
- Helper text under the field when `maxCount !== null`, e.g. "Up to {maxCount} people".
- If the server still returns `over_limit` (e.g. max lowered after page load), show the
  same message rather than the generic save error.

Threading (the campaign max must reach the form):

- `src/app/gift/[token]/page.tsx:15` — add `max_attendee_count` to the
  `campaigns(...)` select; widen the local campaign cast (`page.tsx:21`).
- `src/components/gift/GiftRedemptionView.tsx` — add `maxCount: number | null` to `Props`,
  thread it to `<ArrivalRsvp maxCount={...} />` (around `GiftRedemptionView.tsx:65`).
- `gift/[token]/page.tsx` passes `maxCount={campaign?.max_attendee_count ?? null}` to
  `GiftRedemptionView` (both render branches).

## i18n

Add to `src/lib/i18n/translations.he.ts`:

- "Max people per invite" (toggle-area label)
- "No limit" (placeholder/helper for empty)
- "Up to {n} people" (RSVP helper) — implement with a parameterized helper if the i18n
  layer supports interpolation; otherwise split into static + number.
- Over-limit error, e.g. "You can bring up to {n} people." for the `over_limit` case.

(Confirm the existing translation helper's interpolation capability during implementation;
fall back to composing the number outside the translated string if it has none.)

## Testing

- `tests/api/gift-rsvp.test.ts` (extend): attending with `attendeeCount > max` →
  `400 over_limit`; attending at exactly `max` → success; `max = null` → unbounded (any
  count accepted); `attending = false` ignores the max.
- `tests/api/campaign-patch.test.ts` (extend): `maxAttendeeCount` integer `>= 1` persists;
  `null` clears; `0` / negative / non-integer → `400 invalid_max`; partial update with
  only `maxAttendeeCount` (no `supportsArrivalCertificates`) works; neither field → `400`;
  `sent_at` set → `409` (unchanged guard still holds).
- Toggle input + RSVP form are UI (no unit tests, consistent with existing components).

## Out of scope

- Per-token / per-employee limits.
- Setting the max at campaign creation.
- Retroactively trimming or flagging RSVPs that exceed a newly-lowered max.
- Any cap on the admin attendance-override route.
