# Team, Platform Admin, Settings & Manual Employee Add — Design Spec
Date: 2026-04-29

## Overview

Four independent sub-projects that complete the GiftFlow SaaS product for multi-tenant use. Each is scoped to a single concern and can be implemented and shipped independently.

---

## Sub-project 1: Team Page

### Goal
Company admins manage their team members — invite, view, and remove users — without touching the CLI.

### Route & Access
- `/admin/team` — `company_admin` role only
- Added to the admin sidebar as a second nav item ("Team", people icon)

### Page Layout
Single full-width card inside the standard admin shell (sidebar + main content area). Same padding/max-width as the campaign list page (`max-w-4xl`).

### Member List
Table columns: **Name · Email · Role · Status · Actions**

- **Name:** from `user_metadata.full_name` or email prefix if not set
- **Email:** from auth user record
- **Role:** badge showing `company_admin`, `campaign_manager`, or `scanner`
- **Status:** `Active` (green pill) or `Pending` (violet pill, user hasn't accepted invite yet)
- **Actions:** Remove button (trash icon), shown only for other users (not yourself)

### Invite Flow
1. "+ Invite member" gradient button top-right of the card
2. Modal with:
   - **Email** (required, type=email)
   - **Role** dropdown: `company_admin`, `campaign_manager`, `scanner`
3. Submit → `POST /api/team/invite`

**API route (`POST /api/team/invite`):**
- Auth: server session, must be `company_admin`
- Body: `{ email: string, role_name: 'company_admin' | 'campaign_manager' | 'scanner' }`
- Steps:
  1. Look up `role_id` from `roles` where `name = role_name` and `is_system = true`
  2. Call `supabase.auth.admin.inviteUserByEmail(email)` — Supabase sends the magic link
  3. Call `supabase.auth.admin.updateUserById(user.id, { app_metadata: { company_id, role_id, role_name } })`
  4. Insert into `user_company_roles`: `{ user_id, company_id, role_id }`
- Response: `{ success: true }` or `{ error: string }`

Invited user appears in the list immediately with "Pending" status (detected by `last_sign_in_at === null`).

### Remove Flow
- Trash icon on each row (not shown for current user)
- Confirm modal: "Remove {name} from your team? They will lose access immediately."
- Submit → `DELETE /api/team/members/[userId]`

**API route (`DELETE /api/team/members/[userId]`):**
- Auth: server session, must be `company_admin`
- Cannot remove yourself
- Steps:
  1. Delete from `user_company_roles` where `user_id = userId AND company_id = jwt_company_id`
  2. Call `supabase.auth.admin.updateUserById(userId, { app_metadata: {} })` to clear metadata
- Does not delete the auth user (safe for potential re-invite)

### Data Fetching
Server component uses service role:
1. Query `user_company_roles` for all `user_id` where `company_id = jwt_company_id`
2. Call `supabase.auth.admin.listUsers()`, filter to those user IDs
3. Merge role info from `user_company_roles` + `roles`

---

## Sub-project 2: Platform Admin

### Goal
Platform operators onboard new client companies, appoint their first admin, and monitor activity across all tenants.

### Routes & Access
- `/platform` — `platform_admin` role only
- Separate layout from `/admin` with its own `src/app/platform/layout.tsx` and a new `src/components/platform/PlatformSidebar.tsx` component (same visual design as admin sidebar — dark zinc-900, hover-expand — but with nav items: Companies · Activity)

### Companies List (`/platform`)
Table: **Company name · Slug · Users · Campaigns · Created · Actions**

- All data from service role queries across `companies`, `user_company_roles`, `campaigns`
- "+ New Company" gradient button top-right

**New Company Modal:**
Three fields:
- **Company name** (required)
- **Slug** (auto-generated from name as lowercase-hyphenated, editable)
- **First admin email** (required)

Submit → `POST /api/platform/companies`:
1. Insert into `companies { name, slug }`
2. Look up `company_admin` system role ID
3. `supabase.auth.admin.inviteUserByEmail(email)`
4. `updateUserById` to set `app_metadata: { company_id, role_id, role_name: 'company_admin' }`
5. Insert into `user_company_roles`

### Company Detail (`/platform/companies/[id]`)
Two tabs:
- **Members** — same columns as Team page, read-only (no remove from here)
- **Campaigns** — list of campaigns with name, date, sent/draft status, employee count

### Activity Log (`/platform/activity`)
Reverse-chronological feed sourced from existing tables (no separate audit table):
- **Company created** — from `companies.created_at`
- **User invited** — from `user_company_roles.created_at`
- **Campaign launched** — from `campaigns.sent_at`

Each entry shows: event type · company name · actor email (where available) · timestamp

Fetched server-side with a UNION query across the three sources, ordered by timestamp DESC, limited to 100 entries.

---

## Sub-project 3: Company Settings

### Goal
Company admins customize their company identity and SMS message template.

### Route & Access
- `/admin/settings` — `company_admin` role only
- Added to admin sidebar as third nav item ("Settings", gear icon)

### Schema Change
New migration `006_company_settings.sql`:
```sql
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS sms_template TEXT;
```

Default `sms_template` when null: `"Hi {name}, your gift is ready! Scan your QR code here: {link}"`

### Page Layout
Centered card (`max-w-2xl`), three sections separated by `<hr>` dividers, single "Save settings" button at the bottom.

**Section 1 — Company Identity:**
- Company name: text input, pre-filled from DB
- Logo: drag-and-drop image upload (same pattern as TokenUploader). Accepts PNG/JPG/WebP. Uploads to Supabase Storage bucket `logos/{company_id}/logo.{ext}`. Shows preview once uploaded. Logo replaces the gradient square in the sidebar when set — `AdminLayout` (server component) fetches `logo_url` from `companies` and passes it as a `logoUrl?: string` prop to `Sidebar`.

**Section 2 — SMS Template:**
- Textarea pre-filled with current template (or default)
- Helper text: "Use `{name}` for the employee's name and `{link}` for their QR code link"
- Character counter (160 char SMS limit for single segment)
- Validation: must contain `{link}` — show inline error if missing

**Section 3 — Save:**
- `PATCH /api/settings` — updates `companies` row for current company
- Body: `{ name: string, logo_url: string | null, sms_template: string }`
- Success: toast/banner "Settings saved"

### Send Route Update
`POST /api/campaigns/[id]/send` fetches `companies.sms_template` for the campaign's company. Replaces `{name}` and `{link}` in the template before passing to Twilio. Falls back to the hardcoded default if `sms_template` is null.

---

## Sub-project 4: Manual Employee Add

### Goal
Campaign admins add individual employees to a draft campaign without uploading a CSV.

### Where It Lives
`EmployeeTable` component header — new "+ Add employee" outline button alongside "Resend" and "Export CSV". Visible only when the campaign is in draft state (`!sent_at`).

### New Component
`src/components/admin/AddEmployeeModal.tsx`

Modal fields:
- **Name** (required, text)
- **Phone number** (required, text — validated client-side via existing `normalizePhone` before submit)
- **Department** (optional, text)

### Flow
1. User clicks "+ Add employee" → modal opens
2. User fills fields → client-side phone validation on blur
3. Submit → `POST /api/campaigns/[id]/tokens` with body:
   ```json
   { "rows": [{ "name": "...", "phone_number": "...", "department": "..." }] }
   ```
   (Same endpoint as bulk CSV upload — single-row array)
4. On success: modal closes, row appears in table via Supabase Realtime (no refresh)
5. On error: error message shown inside the modal, modal stays open

### No New API Route
The existing `POST /api/campaigns/[id]/tokens` already handles arrays of any size — a single-row payload works without changes.

---

## Implementation Order

Build in this order (each is independent, but this is the recommended sequence):

1. **Sub-project 4** — Manual employee add (smallest, highest daily-use value)
2. **Sub-project 1** — Team page (needed for first client onboarding)
3. **Sub-project 3** — Company settings (SMS template customization)
4. **Sub-project 2** — Platform admin (needed when you have 2+ clients)

---

## Out of Scope

- Custom role creation (4 system roles are sufficient)
- Employee-facing web experience (employees receive SMS only)
- Billing / subscription management
- Dark mode
