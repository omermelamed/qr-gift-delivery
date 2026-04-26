# Phase 3 — Admin Dashboard
**Timeline:** Week 3

## Goal
Build the HR admin interface: campaign creation, CSV employee upload, live redemption tracking, and report export.

---

## Tasks

### 3.1 Campaign Creator
- [ ] Create page: `/admin/campaigns/new`
- [ ] Form fields: campaign name, campaign date
- [ ] On submit: create `campaigns` row in Supabase, redirect to campaign detail page
- [ ] Require HR admin login to access all `/admin` routes

### 3.2 CSV Upload
- [ ] Add CSV file input to campaign setup flow
- [ ] Parse CSV client-side (columns: `name`, `phone_number`)
- [ ] Show preview table of parsed employees before confirming
- [ ] On confirm: bulk insert rows into `gift_tokens` for the campaign
- [ ] Validate phone number format; show errors for invalid rows

### 3.3 Campaign Detail & Launch
- [ ] Create page: `/admin/campaigns/[id]`
- [ ] Display campaign info + employee list with statuses (Pending / Sent / Claimed)
- [ ] "Launch Campaign" button → calls `POST /api/campaigns/[id]/send`
- [ ] Show progress indicator while SMS blast is in flight
- [ ] Disable launch button if campaign already sent

### 3.4 Live Redemption Dashboard
- [ ] Real-time progress bar: X of N gifts claimed (updates via Supabase Realtime)
- [ ] Sortable/filterable table: employee name, phone, SMS status, claimed status, claimed time
- [ ] Subscribe to `gift_tokens` changes using Supabase Realtime WebSocket

### 3.5 Resend SMS
- [ ] Add "Resend" button per employee row (visible if SMS failed or not yet sent)
- [ ] Calls single-employee variant of the SMS API
- [ ] Updates `sms_sent_at` on success

### 3.6 Export Report
- [ ] "Export CSV" button on campaign detail page
- [ ] Generates CSV with columns: name, phone, sms_sent_at, redeemed, redeemed_at
- [ ] Triggers browser download

---

## Definition of Done
- HR admin can create a campaign, upload a CSV, preview it, and launch
- Dashboard shows live redemption counts via Supabase Realtime
- Resend works for individual employees
- CSV export downloads correctly with all audit fields
