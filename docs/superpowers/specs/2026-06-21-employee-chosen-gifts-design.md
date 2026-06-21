# Employee-Chosen Gifts Design

**Date:** 2026-06-21
**Status:** Approved

## Problem

Multi-gift campaigns currently let the **distributor** pick which gift an employee took, at scan time. We want the **employee** to choose their own gift ahead of time, from the SMS link page. The choice locks once made (only an admin can change it). HR sees who chose what and the full distribution **before** any scanning happens, and the distributor sees the already-chosen gift at scan time so they know what to bring.

## What already exists

- `campaign_gifts` table (per-campaign gift options) and `gift_tokens.gift_id` column — created in `20240504000018_multi_gift.sql`.
- Public `/gift/[token]` page (the SMS link target) that currently just shows the employee's QR code.
- `/scan` page with a distributor gift-picker state (`gift_selection`).
- `POST /api/verify/[token]` already stamps `gift_id` at redemption and returns `needsGiftSelection` when gifts exist but none is chosen.
- Campaign detail page already renders a Gift column (`EmployeeTable`) and a gift distribution breakdown (`RedemptionProgress`) from `gift_id`.

## Core change

Today `gift_id` is written **only at redemption**. This feature decouples the choice from redemption: `gift_id` is set when the employee picks (pre-scan) and persists on the token while `redeemed = false`. Everything else follows from that.

## Decisions

- **Scan behavior:** distributor screen is show-only for the employee's choice, with a fallback — if the employee never chose, the distributor can still pick at scan so redemption is never blocked.
- **Admin override:** an admin can change the recorded gift **anytime, including after redemption**.
- **Gift page flow:** for multi-gift campaigns, the employee must **pick first, then the QR is revealed**. Single-gift and no-gift campaigns are unaffected (QR shown immediately).

---

## Architecture

### 1. Schema — `supabase/migrations/20240621000028_gift_chosen_at.sql`

Add one nullable timestamp to `gift_tokens`:

```sql
ALTER TABLE gift_tokens
  ADD COLUMN IF NOT EXISTS gift_chosen_at TIMESTAMPTZ;
```

- Set when the employee (or admin) picks a gift.
- Lets us distinguish "chose but not yet collected" from "never chose" — a clean, queryable state without overloading `redeemed_at`.
- No RLS changes: existing `gift_tokens` / `campaign_gifts` policies already cover reads and the new writes go through the service role in server routes.
- Apply the matching idempotent patch to the migration workflow per project convention.

### 2. New route — `POST /api/gift/[token]/choose` (public)

Public (no auth) — same trust model as `/gift/[token]`: the token is an unguessable UUID v4.

- Body: `{ giftId: string }`.
- Validate `giftId` belongs to this token's campaign (join `campaign_gifts` on `campaign_id`); reject otherwise.
- Atomic lock (mirrors the redemption pattern — first writer wins):

```sql
UPDATE gift_tokens
SET gift_id = $giftId, gift_chosen_at = now()
WHERE token = $token AND gift_id IS NULL AND redeemed = false
RETURNING gift_id
```

- **0 rows back** → already chosen or already redeemed. Re-read the row and return the existing `gift_id` + gift name (idempotent). The employee cannot change a locked choice — this is the lock.
- Response: `{ ok: true, gift: { id, name } }` (the effective choice, whether just made or pre-existing).
- Never reveals redemption state beyond what `/gift/[token]` already shows.

### 3. Employee gift page — `src/app/gift/[token]/page.tsx` (rewire)

Server component fetches token + campaign + the campaign's gift options (ordered by `position`) + the token's current `gift_id`.

Branching:

- **0 or 1 gift options (single / no-gift campaign)** → unchanged: show QR immediately (existing layout). For the 1-gift case `gift_id` is irrelevant to the employee (auto-stamped at redemption as today).
- **2+ gift options, no choice yet (`gift_id` null)** → render the gift picker (client component). QR is hidden.
- **2+ gift options, already chosen** → show the locked choice ("Your gift: X") + the QR + "Show this to collect your gift."
- **Already redeemed** → existing "Already Claimed" screen (unchanged).

New client component (e.g. `GiftPicker`) handles the picker:
- Renders the gift options as tappable buttons.
- On tap → `POST /api/gift/[token]/choose`, then transitions to the locked choice + QR view (no full reload needed; can re-render with the returned gift, or refresh server data).
- After a successful choice the picker is gone — revisiting the link shows the locked choice + QR.

### 4. Verify route — `src/app/api/verify/[token]/route.ts` (rewire)

Current logic returns `needsGiftSelection` whenever gifts exist and no `giftId` was supplied by the scanner. New logic keys off the token's stored `gift_id`:

- Token **already has `gift_id`** (employee chose, or single-gift auto, or admin set) → redeem with that gift directly. **Do not** return `needsGiftSelection`. Include the chosen gift's `name` in the success response so the scan screen can display it.
- Gifts exist but token's `gift_id` is **null** → keep the existing `needsGiftSelection` fallback path (distributor picks at scan; the supplied `giftId` is stamped during the atomic redemption UPDATE). Also set `gift_chosen_at` in that UPDATE for consistency.
- Single-gift auto-stamp (exactly one option) stays.
- Atomic redemption UPDATE and audit logging (`token.redeemed`, including `gift_id`) unchanged otherwise.

Success response gains an optional gift name, e.g. `{ valid: true, employeeName, giftName?: string }`. Update the `TokenVerifyResult` type accordingly.

### 5. Scan screen — `src/app/scan/page.tsx` (display)

- On a successful redemption where `giftName` is present, the result takeover shows the **gift name as the primary text** (e.g. "Wireless Headphones"), with the employee name as the secondary label. No "bring:" prefix.
- When no gift name (single/no-gift campaign) → existing "Gift collected" text.
- The existing distributor gift-picker (`gift_selection` state) is retained but now only triggers in the fallback case (employee didn't choose). No structural change to that UI.

### 6. Campaign page — `src/app/admin/campaigns/[id]/page.tsx` + `EmployeeTable` + `RedemptionProgress`

- **Distribution before scanning:** because `gift_id` is now set pre-scan, the existing Gift column and `RedemptionProgress` breakdown reflect employee choices before anyone scans — no new rendering work, only ensure the server query selects `gift_id` (it already does) and `gift_chosen_at` if needed for display.
- **Admin override (new):** make the Gift cell editable for admins. A dropdown listing the campaign's gift options lets an admin set or change any employee's gift, allowed **anytime, including after redemption**.
  - New route `PATCH /api/campaigns/[id]/tokens/[tokenId]/gift` — admin-auth (company_admin / campaign_manager / platform_admin), service role, validates the gift belongs to the campaign, writes `gift_id` (and `gift_chosen_at = now()`) unconditionally, and logs an audit event (e.g. `token.gift_changed` with old/new gift).
  - The Gift cell becomes a controlled dropdown only for users with the edit permission; everyone else sees the read-only badge as today.

---

## Data flow

1. HR sends the campaign → SMS links go out (existing flow, unchanged).
2. Employee opens `/gift/[token]` → multi-gift campaign → picks a gift → `POST /api/gift/[token]/choose` locks `gift_id` + `gift_chosen_at` → page reveals the QR.
3. HR opens the campaign page → sees each employee's chosen gift and the live distribution, before any scan.
4. Distributor scans → `/api/verify/[token]` sees the stored `gift_id` → redeems and returns the gift name → scan screen shows the gift name to hand over.
5. Fallback: employee never chose → distributor picker appears at scan (existing UI) → choice stamped during redemption.
6. Admin can override any token's gift at any time from the campaign page.

## Behavior rules

- **No gifts / 1 gift** → employee-facing flow unchanged; QR shown immediately. (1-gift still auto-stamps at redemption.)
- **2+ gifts** → employee must choose before seeing the QR.
- **Employee choice is locked** once made — only an admin can change it.
- **Admin override** allowed anytime, even post-redemption.
- **`gift_id` may be null at scan** → distributor fallback picker covers it; redemption never blocked.

## Out of scope

- Notifying the employee when an admin changes their gift.
- Letting employees change their own pick after locking.
- Any change to single-gift / no-gift campaign behavior.
- Inventory limits / per-gift caps (a gift can be chosen by any number of employees).

## Build order

1. Migration (`gift_chosen_at`) + workflow patch.
2. `POST /api/gift/[token]/choose` route (atomic lock + idempotent re-read).
3. `/gift/[token]` page rewire + `GiftPicker` client component.
4. Verify route rewire (key off stored `gift_id`, return `giftName`) + `TokenVerifyResult` type update.
5. Scan screen: show gift name on success.
6. Admin override: `PATCH .../tokens/[tokenId]/gift` route + editable Gift cell in `EmployeeTable`.
7. Verify campaign-page distribution renders pre-scan (likely no code change beyond the query).
