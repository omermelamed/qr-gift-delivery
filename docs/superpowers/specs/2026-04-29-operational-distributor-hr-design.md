# Operational, Distributor & HR Visibility Features — Design Spec
Date: 2026-04-29

## Overview

Three groups of features that complete the day-to-day operational experience of GiftFlow for HR admins, distributors, and platform operators.

---

## Group 1: Auth Improvements

### Forgot Password

**Flow:**
1. "Forgot password?" link below the sign-in button on `/login` — toggles an inline email form inside the same card (no new page for the request step)
2. User enters email → calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: NEXT_PUBLIC_APP_URL/reset-password })`
3. Card shows "Check your email — we sent a reset link to {email}"
4. Supabase sends the email with a magic link pointing to `/reset-password`

**New page: `/reset-password`** (`src/app/(auth)/reset-password/page.tsx`)
- `'use client'` — reads `access_token` from the URL hash on mount via `supabase.auth.onAuthStateChange` or `supabase.auth.getSession()`
- Shows "New password" + "Confirm password" fields
- On submit: calls `supabase.auth.updateUser({ password: newPassword })`
- On success: redirects to `/login` with a success message
- Validation: passwords must match, minimum 8 chars

**No new API route needed** — Supabase Auth handles the token exchange.

---

### Resend Invite

**Where:** `/admin/team` — pending members (those with `isPending: true`) get a "Resend" outline button alongside the Remove button in the Actions column.

**Flow:**
1. Click "Resend" → `POST /api/team/resend` with `{ userId }`
2. Route fetches the user's email via `service.auth.admin.getUserById(userId)`
3. Re-calls `service.auth.admin.inviteUserByEmail(email, { redirectTo: APP_URL/admin })`
4. Returns `{ success: true }`
5. Button shows "Sent!" for 3 seconds, then resets

**Only shown for pending members** — active members have no invite to resend.

---

## Group 2: Campaign Management

### Campaign Duplication

**Where:** Campaign list (`/admin`) — each campaign card gets a "Duplicate" icon button (copy icon, outline style) to the left of the card's right edge, visible on hover.

**Modal fields:**
- Campaign name (pre-filled: "Copy of {original name}")
- Campaign date (pre-filled: original date, editable)
- Checkbox: "Copy employees from this campaign" (unchecked by default)

**API: `POST /api/campaigns/[id]/duplicate`**
1. Auth + `campaigns:create` permission check
2. Verify campaign belongs to `jwt_company_id`
3. Insert new campaign `{ name, campaign_date, company_id }`
4. If checkbox checked: copy all `gift_tokens` rows from original, setting `campaign_id` to new ID, and resetting `redeemed = false`, `redeemed_at = null`, `redeemed_by = null`, `sms_sent_at = null`, `qr_image_url = null`
5. Return `{ id: newCampaignId }`
6. Client redirects to `/admin/campaigns/{newCampaignId}`

---

### Campaign Close/Expiry

**Schema change (migration 007):**
```sql
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
```

**Status progression:** Draft → Sent → Closed

**Where:** Campaign detail header — "Close campaign" button (zinc outline style, not gradient) visible only when `sent_at IS NOT NULL AND closed_at IS NULL`.

**Modal:** "Close campaign? No further QR codes can be redeemed after closing. This cannot be undone."

**API: `POST /api/campaigns/[id]/close`**
1. Auth + `campaigns:launch` permission check
2. Verify campaign is sent (`sent_at IS NOT NULL`) and not already closed
3. Update `campaigns SET closed_at = now()` where `id = campaignId AND company_id = jwt_company_id`
4. Return `{ success: true }`

**Verify route update:** `POST /api/verify/[token]` — after checking `redeemed`, also checks `campaigns.closed_at`. If `closed_at IS NOT NULL`, returns `{ valid: false, reason: 'campaign_closed' }`.

**Scanner new state:** Full-screen red overlay with "Campaign closed" message (same takeover pattern as other error states).

**Status badge:** Three states:
- `closed_at IS NOT NULL` → grey badge "Closed"
- `sent_at IS NOT NULL` → green badge "Sent"
- otherwise → violet badge "Draft"

**Campaign list + detail pages** both updated to show the three-state badge and pass `closed_at` in queries.

---

### Department Breakdown

**Where:** Campaign detail page — "By department" toggle button in the employee table header, next to the existing action buttons. Only shown when at least one employee has a non-null department.

**Behavior (client-side only, no new API):**
- Default: flat list sorted by `redeemed` asc, then `employee_name` asc (current)
- Toggled: rows grouped by department, with a sub-header row per department showing department name + `{claimed} / {total} claimed`
- Employees with `department = null` grouped under "No department"
- Sorting within each group: unclaimed first, then alphabetical

**Component change:** `EmployeeTable` accepts a new internal toggle state. The grouping logic is a pure client-side computation over the existing `rows` array.

---

## Group 3: Distributor Improvements

### Scanner History

**Where:** `/scan` page — a "History" pill button in the bottom-right corner of the screen (always visible, doesn't interfere with camera). Tapping it slides up a bottom sheet showing the last 10 scans of the current session.

**Data:** In-memory only — `scanHistory` state array on the scan page, cleared on page reload. Each entry: `{ employeeName, result: 'success' | 'already_claimed' | 'invalid' | 'closed', timestamp }`.

**History panel:** Semi-transparent dark sheet (`bg-zinc-900/95`) slides up from the bottom. Shows a list of recent scans with coloured icons (green checkmark, red X). Tap anywhere outside or a close button to dismiss. Falls back to "No scans yet this session" when empty.

**No backend change needed.**

---

### Multiple Distributors Per Campaign

#### Schema (migration 008)
```sql
CREATE TABLE campaign_distributors (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, user_id)
);

CREATE INDEX campaign_distributors_campaign_idx ON campaign_distributors (campaign_id);
```

**Backwards compatibility:** If `campaign_distributors` has zero rows for a campaign, any authenticated scanner can scan it (existing behaviour preserved).

#### Assignment UI

**Where:** Campaign detail left rail — new "Distributors" card below `TokenUploader`, before `sent_at` is set (hidden after launch).

**Card contents:**
- List of assigned distributors: display name + email + remove (×) button
- "+ Add distributor" button → opens a dropdown/modal listing scanner-role users in the company (fetched from `user_company_roles` joined with auth users)
- Empty state: "Any scanner can scan this campaign" (reflects backwards-compatible default)

**APIs:**
- `GET /api/campaigns/[id]/distributors` — returns `[{ userId, name, email }]` of assigned distributors
- `POST /api/campaigns/[id]/distributors` — body `{ userId }`, inserts into `campaign_distributors`
- `DELETE /api/campaigns/[id]/distributors/[userId]` — removes assignment

#### Restriction

**Verify route update:** `POST /api/verify/[token]` — after existing checks:
1. Count rows in `campaign_distributors` where `campaign_id = token.campaign_id`
2. If count > 0 AND `distributorId` not in that set → return `{ valid: false, reason: 'not_authorized' }`

**Scanner new state:** Full-screen red overlay: "Not authorised for this campaign."

#### Tracking (show names instead of UUIDs)

**`GET /api/campaigns/[id]/distributors`** — already returns the assigned-distributor list. Extend response to include a `redemptions` map: `{ [userId]: displayName }` built from all distinct `redeemed_by` values on the campaign's tokens + the auth user lookup.

**`EmployeeTable` update:** On mount, if `campaign.sent_at` is set, fetches `/api/campaigns/[id]/distributors` and stores the `{ userId → name }` map in state. The "Distributor" column renders `nameMap[redeemed_by] ?? redeemed_by ?? '—'`.

---

## Migration Summary

| Migration | Change |
|---|---|
| `007_campaign_close.sql` | `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ` |
| `008_campaign_distributors.sql` | New `campaign_distributors` table + index |
| `009_employees_directory.sql` | New `employees` table + unique constraint + index |

---

## Group 4: Employee Directory

A company-level employee roster that persists across campaigns. HR admins maintain one canonical list; individual campaigns are populated from it (or via CSV upload, or by cloning a prior campaign).

---

### Schema (migration 009)

```sql
CREATE TABLE employees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  phone       TEXT NOT NULL,
  department  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (company_id, phone)
);

CREATE INDEX employees_company_idx ON employees (company_id);
```

The `UNIQUE (company_id, phone)` constraint prevents duplicates and enables `ON CONFLICT DO UPDATE` upserts when importing.

---

### Directory Page (`/admin/employees`)

**Nav:** Add "Employees" entry to the admin sidebar between Campaigns and Settings (person-list icon).

**Layout:** Full-width table, same shell as `/admin/team`.

**Columns:** Name · Phone · Department · Actions (Edit pencil, Remove trash)

**Toolbar (top-right):**
- Search input (filters name / department client-side)
- Department filter dropdown (populated from distinct departments in the list)
- "+ Add employee" button → opens `AddDirectoryEmployeeModal`
- "Import CSV" button → opens `ImportDirectoryModal`

**`AddDirectoryEmployeeModal`:** Name + Phone (with `normalizePhone` validation on blur) + Department (optional). `POST /api/employees` on submit. On 409 (duplicate phone): inline error "A employee with this phone number already exists."

**Edit:** Inline row edit or same modal pre-filled. `PATCH /api/employees/[id]`.

**Remove:** Trash icon → ConfirmModal → `DELETE /api/employees/[id]`. Does **not** remove from existing campaign tokens (historical data preserved).

**`ImportDirectoryModal`:** Same CSV/XLSX parser as `TokenUploader`. On parse, shows a preview table (name, phone, department columns detected). "Import N employees" button → `POST /api/employees/import` with `{ rows: [...] }` — server does `upsert` (update name/department if phone already exists, insert if new). Returns `{ inserted, updated }`. Modal shows "X added, Y updated."

---

### Campaign Population — Three Paths

The `TokenUploader` component is replaced by a `CampaignPopulator` component with three tabs:

```
[ Upload file ]  [ From directory ]  [ Clone campaign ]
```

`Clone campaign` tab is only shown when `campaignCount > 0` (i.e., there are other campaigns to clone from).

#### Tab 1: Upload file (existing behaviour, extended)

Same drag-drop zone as today. After parsing and before inserting tokens:

- Checkbox: **"Save employees to directory"** (unchecked by default)
- If checked: `POST /api/employees/import` is called first (upsert), then the normal `POST /api/campaigns/[id]/tokens` flow runs.
- If unchecked: existing flow unchanged.

#### Tab 2: From directory

- Shows all company employees in a filterable, checkable list (search + department filter, same controls as the directory page).
- "Select all" / "Deselect all" controls.
- Shows `{N} selected` count.
- "Add to campaign" button → calls `POST /api/campaigns/[id]/tokens` with `{ source: 'directory', employeeIds: [uuid, ...] }`.
- Server fetches the selected `employees` rows and inserts them as `gift_tokens` (same schema as CSV path: `employee_name`, `phone`, `department`, `campaign_id`, token = `gen_random_uuid()`).
- Replaces existing tokens (same delete-then-insert behaviour as CSV upload, with the same "are you sure?" confirmation if tokens already exist).

#### Tab 3: Clone campaign

- Dropdown of other campaigns in the company (name + date), sorted newest first.
- "Clone employees" button → copies all `gift_tokens` from the selected campaign to this one, resetting `redeemed`, `redeemed_at`, `redeemed_by`, `sms_sent_at`, `qr_image_url` (same logic as the duplicate-campaign route).
- This replaces the "Copy employees from this campaign" checkbox in the campaign duplication modal — duplication no longer offers that checkbox; cloning is done here instead.

---

### API Changes

**`GET /api/employees`** — Returns `[{ id, employee_name, phone, department }]` for `jwt_company_id`, ordered by `employee_name`. Auth required; `company_id` scoped via RLS.

**`POST /api/employees`** — Body `{ employee_name, phone, department? }`. Inserts one row. 409 on duplicate phone.

**`PATCH /api/employees/[id]`** — Body `{ employee_name?, phone?, department? }`. Updates fields present in body. 404 if not found for company.

**`DELETE /api/employees/[id]`** — Removes from directory only. 404 if not found for company.

**`POST /api/employees/import`** — Body `{ rows: [{ employee_name, phone, department? }] }`. Upserts: `INSERT ... ON CONFLICT (company_id, phone) DO UPDATE SET employee_name = EXCLUDED.employee_name, department = EXCLUDED.department`. Returns `{ inserted: N, updated: M }`.

**`POST /api/campaigns/[id]/tokens` (extended)** — Existing CSV path unchanged. New branch: if body contains `{ source: 'directory', employeeIds: [...] }`, fetches those `employees` rows and builds the token list from them. The delete-then-insert behaviour is the same regardless of source.

---

## Migration Summary

- Push notifications when a gift is claimed
- Distributor mobile app
- Offline scanning mode
