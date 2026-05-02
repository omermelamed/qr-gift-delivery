# Multi-Gift Campaign Design

## Goal

Allow campaigns to define multiple gift options. When a distributor scans an employee's QR code and the campaign has multiple gifts, they pick which gift the employee took before confirming redemption. Single-gift campaigns are unaffected.

---

## Schema

### New table: `campaign_gifts`

```sql
CREATE TABLE campaign_gifts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  position    INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX campaign_gifts_campaign_idx ON campaign_gifts (campaign_id, position);
ALTER TABLE campaign_gifts ENABLE ROW LEVEL SECURITY;
-- company admins and campaign managers can manage gifts; anyone with campaigns:view can read
CREATE POLICY "campaign_gifts_company_isolation"
  ON campaign_gifts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_gifts.campaign_id
        AND c.company_id = public.jwt_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_gifts.campaign_id
        AND c.company_id = public.jwt_company_id()
    )
  );
```

### Modified table: `gift_tokens`

Add nullable `gift_id` column stamped at redemption:

```sql
ALTER TABLE gift_tokens
  ADD COLUMN IF NOT EXISTS gift_id UUID REFERENCES campaign_gifts(id) ON DELETE SET NULL;
```

---

## API Routes

### `GET /api/campaigns/[id]/gifts`
Returns all gift options for the campaign, ordered by position.
Auth: `campaigns:launch` permission.
Response: `{ gifts: { id, name, position }[] }`

### `POST /api/campaigns/[id]/gifts`
Adds a gift option.
Body: `{ name: string }`
Auth: `campaigns:launch` permission. Only allowed when campaign is draft.
Appends at end (position = max existing position + 1).
Response: `{ id, name, position }`

### `DELETE /api/campaigns/[id]/gifts/[giftId]`
Removes a gift option.
Auth: `campaigns:launch` permission. Only allowed when campaign is draft.
Response: `{ success: true }`

### `PUT /api/campaigns/[id]/gifts/[giftId]`
Updates a gift option name.
Body: `{ name: string }`
Auth: `campaigns:launch` permission. Only allowed when campaign is draft.
Response: `{ success: true }`

### `POST /api/verify/[token]` — updated
Accepts optional `giftId?: string` in the request body alongside `distributorId`.
If provided, stamps `gift_id` on the token row during the atomic UPDATE.
If not provided, `gift_id` stays null (graceful — existing single-gift behavior).

---

## Frontend Components

### `GiftOptionsEditor` (client component)
Used in the campaign detail page draft layout (right column, below DistributorAssignment).

- Fetches `GET /api/campaigns/[id]/gifts` on mount
- Shows a list of gift name chips with a × remove button each
- At the bottom: a text input + "Add" button (or Enter key) to add new options
- On remove: calls `DELETE /api/campaigns/[id]/gifts/[giftId]`
- On add: calls `POST /api/campaigns/[id]/gifts`
- Hidden/disabled after campaign is launched

### Scan page (`/scan/page.tsx`) — updated
After a successful QR scan that returns `{ valid: true, employeeName }`:
- Fetch `GET /api/campaigns/[campaignId]/gifts` to get gift options
- If 0 or 1 gift options → existing confirm button (no change)
- If 2+ gift options → replace confirm button with a vertical stack of full-width gift buttons (one per option). Each button shows the gift name. Tapping sends the redemption with `giftId` included.

The scan page already knows `campaignId` from the decoded QR payload. The gift list can be fetched once on scan-page mount (not per-scan) and cached in state.

### `EmployeeTable` — updated
- New "Gift" column (rendered only when `gifts.length > 0`)
- Each row shows a colored badge with the gift name, or "—"
- Badge colors assigned by gift index: `[indigo, violet, amber, teal, rose, orange]`
- The parent page passes `gifts` as a prop

### `RedemptionProgress` — updated
Below the progress bar, add a gift breakdown row:
- Only rendered when `gifts.length > 0` and `claimedCount > 0`
- Each gift shows: colored dot + name + count + %
- "Unchoosen" (redeemed but no gift_id) is shown as a grey entry if any exist

---

## Data Flow

### Campaign detail page (`/admin/campaigns/[id]/page.tsx`)
- Fetches `campaign_gifts` alongside tokens in server-side query
- Passes `gifts` to `EmployeeTable` and `RedemptionProgress`
- Renders `GiftOptionsEditor` in the draft bento grid

### Scan page
- Fetches gift options once on mount
- Passes `giftId` to `POST /api/verify/[token]` when a gift is selected
- The verify response is unchanged (`{ valid: true, employeeName }`)

---

## Behavior Rules

- **No gifts defined** → single-gift campaign. All existing behavior unchanged. `gift_id` stays null on all tokens.
- **1 gift defined** → treated as single-gift. The one gift is auto-stamped on redemption (the API stamps `gift_id` automatically when only one gift exists).
- **2+ gifts defined** → multi-gift campaign. Distributor must tap a gift button to confirm redemption.
- **Gifts are locked after launch** — add/remove/edit gift options is only allowed while the campaign is in draft state. The API enforces this.
- **gift_id is nullable** — a redeemed token can have `gift_id = null` (redeemed before gifts were defined, or via a path that didn't supply a gift). The UI handles this gracefully.

---

## Migration

Single migration file: `20240502000017_multi_gift.sql`
- Creates `campaign_gifts` table with RLS
- Adds `gift_id` to `gift_tokens`

Workflow idempotent patch: adds both changes with `IF NOT EXISTS` guards.

---

## Build Order

1. Migration + workflow patch
2. Gift management API routes (`GET`, `POST`, `DELETE`, `PUT`)
3. `GiftOptionsEditor` component + wire into campaign detail page
4. Update verify API to accept `giftId`
5. Update scan page to fetch gifts + show gift picker
6. Update `EmployeeTable` to show Gift column
7. Update `RedemptionProgress` to show gift breakdown
