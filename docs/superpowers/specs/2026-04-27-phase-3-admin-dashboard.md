# Phase 3 — Admin Dashboard Design

**Date:** 2026-04-27

---

## Goal

Build the HR admin interface: campaign creation with CSV/XLSX employee upload, draft save before launch, live redemption tracking via Supabase Realtime, bulk resend to unclaimed employees, and CSV export.

---

## Architecture

Server components + client islands (Approach A). Pages are React Server Components. Only the progress bar and employee table are client components using Supabase Realtime. CSV/XLSX parsing is client-side for instant preview; mutations go through API routes. Consistent with Phase 1 and 2 patterns.

Multi-tenant: every query is scoped to `company_id` from the authenticated user's JWT. A server layout at `src/app/admin/layout.tsx` enforces session + admin role before any admin page renders.

---

## Schema Additions

Two new columns required (migration):

```sql
ALTER TABLE campaigns ADD COLUMN campaign_date DATE;
ALTER TABLE gift_tokens ADD COLUMN department TEXT;
```

---

## Pages

| Page | Route | Type |
|---|---|---|
| Campaign list | `/admin` | Server component |
| New campaign | `/admin/campaigns/new` | Server component + client file upload |
| Campaign detail | `/admin/campaigns/[id]` | Server component + client Realtime islands |

### `/admin` — Campaign list

- Cards per campaign: name, campaign date, sent count, claimed/total progress
- "New Campaign" button top right
- Scoped to `company_id` — admins never see other companies' campaigns

### `/admin/campaigns/new` — New campaign

- Form: campaign name (required) + campaign date (required)
- On submit: `POST /api/campaigns` → creates row with `status = 'draft'`, redirects to `/admin/campaigns/[id]`
- CSV/XLSX upload lives on the detail page, not here

### `/admin/campaigns/[id]` — Campaign detail

- Header: campaign name, date, status badge (Draft / Ready / Sent)
- "Launch Campaign" button: enabled only when tokens exist and `sent_at IS NULL`
- Upload section: file picker + preview table (appears when a file is selected)
- Live progress bar (client island)
- Employee table (client island)
- "Resend to unclaimed" button
- "Export CSV" button

---

## API Routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `POST /api/campaigns` | POST | admin | Create draft campaign |
| `POST /api/campaigns/[id]/tokens` | POST | admin | Bulk insert employees from upload |
| `POST /api/campaigns/[id]/resend` | POST | admin | Resend SMS to all unclaimed employees |
| `GET /api/campaigns/[id]/export` | GET | admin | Stream CSV export of all tokens |

The existing `POST /api/campaigns/[id]/send` (launch) is unchanged.

### `POST /api/campaigns`

Request: `{ name: string, campaignDate: string }` (ISO date)
Response: `{ id: string }`
- Creates `campaigns` row scoped to `company_id` from JWT
- Sets `campaign_date`, leaves `sent_at` null (draft)

### `POST /api/campaigns/[id]/tokens`

Request: `{ rows: Array<{ name: string, phone_number: string, department?: string }> }`
- Validates each row: name required, phone E.164 format
- Returns `{ inserted: number, skipped: number, errors: Array<{ row: number, reason: string }> }`
- Before inserting: deletes existing tokens where `sms_sent_at IS NULL` (re-upload replaces unsent tokens)
- Never deletes tokens where `sms_sent_at IS NOT NULL`
- Bulk inserts valid rows via service-role client

### `POST /api/campaigns/[id]/resend`

- Fetches all `gift_tokens` where `campaign_id = id AND redeemed = false` (not yet claimed) — covers both employees who never received the SMS and those who received it but lost it
- Reuses `sendGiftMMS` + updates `sms_sent_at` (same pattern as send route)
- Respects `TWILIO_MOCK=true`
- Response: `{ dispatched: number, failed: number }`

### `GET /api/campaigns/[id]/export`

- Fetches all `gift_tokens` for the campaign
- Streams CSV with columns: `name, phone_number, department, sms_sent_at, redeemed, redeemed_at, redeemed_by`
- Sets `Content-Disposition: attachment; filename="campaign-{id}.csv"`

---

## CSV/XLSX Upload Flow

1. User picks `.csv` or `.xlsx` — parsed client-side via `xlsx` npm package
2. Preview table appears showing first 10 rows: Name · Phone · Department · Status
3. Invalid rows highlighted red with reason (missing name, bad phone format)
4. Summary: "245 valid · 3 invalid"
5. "Confirm Upload" enabled only when ≥ 1 valid row
6. On confirm: valid rows POSTed to `/api/campaigns/[id]/tokens`; invalid rows discarded
7. After success: employee table refreshes

**Phone normalisation:** Common Israeli formats (`05X-XXXXXXX`, `05X XXXXXXX`) are normalised to E.164 (`+9725XXXXXXXX`) before validation. Rows that cannot be normalised are flagged invalid.

**Re-upload:** Safe to re-upload before launch. Replaces all unsent tokens. Sent tokens are never touched.

---

## Live Redemption Dashboard

Two client islands on the campaign detail page, both receiving initial data from the server render (no flash of zero/empty).

### Progress Bar Island

- Displays "X / N claimed" with a filled progress bar
- Subscribes to `gift_tokens` Realtime channel filtered by `campaign_id`
- Updates count on `UPDATE` events where `redeemed` changes to `true`

### Employee Table Island

Columns: Name · Phone (masked, last 4 digits) · Department · SMS Status · Claimed · Claimed At · Distributor (name or ID of scanner)

- Default sort: unclaimed first, then claimed (helps distributors see who's left)
- Row updates in place on Realtime `UPDATE` events — no full reload
- Realtime filter: `campaign_id=eq.{id}` — scoped to current campaign only

### Resend Button

- "Resend to unclaimed" — calls `POST /api/campaigns/[id]/resend`
- Disabled while in flight, shows spinner
- After response: shows `dispatched / failed` count for 3 seconds

### Export Button

- "Export CSV" — calls `GET /api/campaigns/[id]/export`
- Triggers browser download via `<a download>` trick

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/005_admin_columns.sql` | Create | Add `campaign_date`, `department` columns |
| `src/app/admin/layout.tsx` | Create | Session + admin role guard |
| `src/app/admin/page.tsx` | Create | Campaign list (server component) |
| `src/app/admin/campaigns/new/page.tsx` | Create | New campaign form (server component) |
| `src/app/admin/campaigns/[id]/page.tsx` | Create | Campaign detail (server component) |
| `src/components/admin/TokenUploader.tsx` | Create | CSV/XLSX file picker + preview + confirm |
| `src/components/admin/RedemptionProgress.tsx` | Create | Live progress bar (client, Realtime) |
| `src/components/admin/EmployeeTable.tsx` | Create | Live employee table (client, Realtime) |
| `src/app/api/campaigns/route.ts` | Create | POST — create campaign |
| `src/app/api/campaigns/[id]/tokens/route.ts` | Create | POST — bulk insert employees |
| `src/app/api/campaigns/[id]/resend/route.ts` | Create | POST — resend to unclaimed |
| `src/app/api/campaigns/[id]/export/route.ts` | Create | GET — CSV export |
| `tests/api/campaigns.test.ts` | Create | Unit tests for create campaign |
| `tests/api/tokens.test.ts` | Create | Unit tests for bulk token insert |
| `tests/api/resend.test.ts` | Create | Unit tests for resend route |
| `tests/api/export.test.ts` | Create | Unit tests for export route |

---

## Hard Invariants

- Never delete tokens where `sms_sent_at IS NOT NULL` on re-upload
- All queries scoped to `company_id` from JWT — never trust campaign ownership from URL alone
- `sent_at` only set by the send route (not by create or token insert)
- Resend uses the same atomic `sms_sent_at` update pattern as the send route
- Export never exposes raw phone numbers — masked in UI but full in export (HR audit use)
- Admin layout enforces role check server-side — proxy is first line, layout is second

---

## Definition of Done

- HR admin can create a draft campaign, upload CSV/XLSX with preview, and launch
- Re-upload before launch safely replaces unsent tokens
- Live progress bar and employee table update in real time as distributors scan
- "Resend to unclaimed" dispatches SMS to all unredeemed tokens
- CSV export downloads with all audit columns
- All new API routes have Vitest tests with mocked Supabase
