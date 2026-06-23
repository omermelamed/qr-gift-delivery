# Editable Attendee-Count Column — Design

**Date:** 2026-06-23
**Status:** Approved, pending implementation plan
**Builds on:** `2026-06-22-arrival-certificates-design.md`

## Summary

Add an "מגיעים" (arriving) column to the campaign `EmployeeTable`, shown only for
campaigns that support Arrival Certificates, with inline admin editing of each person's
attendee count. Mirrors the existing admin gift-edit pattern (the `GiftCell` inline editor
+ the `PATCH /api/campaigns/[id]/tokens/[tokenId]/gift` route).

## Decisions (locked during brainstorming)

1. **Edit scope:** the count is editable for *any* row. Entering a positive number marks
   that person as **coming** with that headcount (admin override / recording arrivals).
   Clearing it reverts the row to "no response".
2. **Count meaning:** total **including the person** (1 = coming alone, 2 = with one
   guest) — consistent with `summarizeArrival` and the employee prompt
   "how many people are coming? (including you)".
3. **Lock:** admin override is allowed **anytime, including after redemption** — identical
   to the existing gift-edit route (`tokens/[tokenId]/gift/route.ts:50`).
4. **Visibility:** the column renders only when `campaign.supports_arrival_certificates`.

## No schema change

`gift_tokens.attending` and `attendee_count` already exist (arrival-certificates
migration), and `src/app/admin/campaigns/[id]/page.tsx` already selects them and carries
them through `allTokens` into `EmployeeTable`. This change is API + UI only.

## API — new route

`PATCH /api/campaigns/[id]/tokens/[tokenId]/attendance`

Mirrors `src/app/api/campaigns/[id]/tokens/[tokenId]/gift/route.ts`:
- Auth → `resolveCompanyId` → permission `campaigns:launch` (else 401/403).
- Campaign must exist and belong to the company (else 404), **and** have
  `supports_arrival_certificates = true` (else `400 { error: 'not_supported' }`).
- Body `{ attendeeCount: number | null }`:
  - **integer ≥ 1** → update `attending = true`, `attendee_count = N`,
    `responded_at = now()`. Non-integer or `< 1` → `400 { error: 'invalid_count' }`.
  - **null / missing** → update `attending = null`, `attendee_count = null`,
    `responded_at = null` (clears the record).
- Update is scoped `.eq('id', tokenId).eq('campaign_id', campaignId)`; admin override has
  no `redeemed` guard (matches the gift route). 0 rows ⇒ `404`.
- Audit: new action `token.attendance_changed` (add to the `AuditAction` union in
  `src/lib/audit.ts`).
- Response: `{ ok: true, attending, attendee_count }`.

The CHECK constraint (`attending = TRUE ⇒ attendee_count ≥ 1`; otherwise NULL) is satisfied
by both branches: coming-with-N sets both, clear sets both to null.

## UI — `EmployeeTable`

### New component `AttendeeCountCell` (in `EmployeeTable.tsx`, sibling to `GiftCell`)
Props: `{ tokenId, attending, attendeeCount, editable, onChange }`.
- **editable** (admin with `campaigns:launch`): a compact number input (`min=1`),
  value = `attendee_count` when `attending === true`, else empty with placeholder `—`.
  On commit (blur / Enter) it calls `onChange(value)`; the value is the parsed integer or
  `null` when emptied.
- **read-only**: renders `attending === true ? attendee_count : '—'`.

### `EmployeeTable` wiring
- `TokenRow` type gains `attending: boolean | null` and `attendee_count: number | null`
  (the rows already carry these at runtime; the Realtime `{...r, ...updated}` merge then
  keeps them current on edits).
- New props: `showAttendance: boolean` and `canEditAttendance: boolean`.
- `changeAttendance(tokenId, value)` → `PATCH …/attendance` with `{ attendeeCount: value }`,
  then `router.refresh()` so the server-rendered `ArrivalSummary` totals re-compute (the
  row itself also updates live via the existing gift_tokens Realtime subscription). Uses
  `useRouter` from `next/navigation`.
- Header: a new `<th>מגיעים</th>` rendered when `showAttendance`, placed after the Gift
  column (before SMS) in both the grouped and flat header.
- A matching `<td>` with `AttendeeCountCell` in **both** the grouped and flat row renders,
  at the same position.
- Replace the inline `showGiftCol ? 9 : 8` colSpan math with a computed
  `colCount = 8 + (showGiftCol ? 1 : 0) + (showAttendance ? 1 : 0)`, used by the
  group-header `colSpan` and the empty-state `colSpan`.

### `src/app/admin/campaigns/[id]/page.tsx`
Pass `showAttendance={campaign.supports_arrival_certificates}` and
`canEditAttendance={canEditGift}` (already computed as
`hasPermission(permissions, 'campaigns:launch')`) to both `EmployeeTable` usages (draft and
sent branches).

## i18n

Add to `src/lib/i18n/translations.he.ts`: `'Arriving': 'מגיעים'` (column header). The cell
otherwise shows numbers / `—`.

## Known limitation (intentional, YAGNI)

Because the column shows/edits only the count, "not coming" and "no response" rows both
render as an empty `—` here — the not-coming vs no-response distinction stays in the
`ArrivalSummary` card. Clearing an admin-set count returns the row to "no response"
(`attending = null`), not "not coming".

## Testing

New `tests/api/token-attendance.test.ts`, mirroring `tests/api/token-gift.test.ts`:
- 401 (no session), 403 (missing `campaigns:launch`).
- 404 when the campaign isn't found / not in the company.
- `400 not_supported` when the campaign lacks arrival certificates.
- set count ≥ 1 → stores `attending = true`, `attendee_count = N` (asserts the update
  payload).
- clear (`null`) → stores `attending = null`, `attendee_count = null`.
- `400 invalid_count` for `0`, negatives, and non-integers.

The table column is UI (no unit test, consistent with the gift column).

## Out of scope

- Editing "not coming" as a distinct state from the grid (only count + cleared/no-response).
- CSV export of the attendee count.
- Any change to the employee-facing RSVP flow or the redemption path.
