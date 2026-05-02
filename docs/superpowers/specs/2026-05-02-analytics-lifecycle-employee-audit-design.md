# GiftFlow — Analytics, Campaign Lifecycle, Employee Experience & Audit Log

## Goal

Add four independent feature layers to GiftFlow:
1. **Analytics** — per-campaign and company-wide redemption stats
2. **Campaign Lifecycle** — duplication, reminder SMS, and scheduled send
3. **Employee Experience** — public self-check page for employees
4. **Audit Log** — chronological record of admin actions

---

## Sub-project 1 — Analytics

### Company Dashboard (`/admin`)

Add a summary stats bar above the campaigns list:
- Total campaigns (all time)
- Total gift tokens sent
- Overall redemption rate (%)
- Total unredeemed tokens

The existing campaigns table gains:
- A **Redemption %** column with a mini inline progress bar (claimed / total)
- Data fetched server-side on page load — no new API route needed

### Campaign Detail — Department Breakdown

New card in the bento grid (left column, below the employee table on running/closed campaigns; below the populator on draft campaigns — hidden if no department data exists).

Rendered as a stacked list:
```
Engineering    ████████░░  8 / 10  80%
Marketing      ██████░░░░  3 / 5   60%
```

Data derived from `gift_tokens.department` grouped query — no schema change.

### Campaign Detail — Distributor Stats

New card (right column, below Notes) on running/closed campaigns only.

Compact table: Distributor name | Gifts handed out | % of total redeemed

Data: `gift_tokens` grouped by `redeemed_by`, joined to auth users for names.

### Export CSV Button

Wire the existing `GET /api/campaigns/[id]/export` into a button on the campaign detail header (visible on running/closed campaigns). Downloads `campaign-<name>.csv`.

---

## Sub-project 2 — Campaign Lifecycle

### Campaign Duplication

Button labelled "Duplicate" in the campaign detail header (all states). Calls existing `POST /api/campaigns/[id]/duplicate`. On success, redirects to the new draft campaign.

### Reminder SMS

Button "Resend to unredeemed (N)" on running campaigns where unredeemed > 0. Calls existing `POST /api/campaigns/[id]/resend`. Shows a confirmation modal with the unredeemed count before firing. Displays dispatched/failed toast on completion.

### Scheduled Send

**Schema**: Add `scheduled_at TIMESTAMPTZ` to `campaigns`. Nullable — null means manual launch.

**UI**: New campaign form (`/admin/campaigns/new`) gains an optional "Schedule send" date/time picker. If set, the campaign is created in draft state with `scheduled_at` populated and is launched automatically at that time.

**Execution**: Vercel Cron job configured in `vercel.json`, runs every hour. Calls `POST /api/cron/send-scheduled`, authenticated via `Authorization: Bearer <CRON_SECRET>`. The endpoint:
1. Finds campaigns where `scheduled_at <= now()` AND `sent_at IS NULL` AND `closed_at IS NULL`
2. For each, fires the existing send logic (same as the manual launch)
3. Stamps `sent_at`

**UI feedback**: Campaign detail shows "Scheduled for <date>" badge in draft state when `scheduled_at` is set. Once sent, behaves identically to a manually launched campaign.

---

## Sub-project 3 — Employee Experience

### Self-Check Page (`/gift`)

Public, no authentication required.

**Flow**:
1. Employee visits `/gift`
2. Enters their phone number
3. System looks up `gift_tokens` where `phone_number = input` AND `redeemed = false` AND campaign is not closed
4. Shows a card per unclaimed gift: campaign name, company name, instructions ("Visit a gift distribution point with this page open to claim your gift")
5. If nothing found: "No unclaimed gifts found for this number"

**Security**: Uses the Supabase anon key. RLS policy on `gift_tokens` allows `SELECT` where `phone_number = current_setting('app.phone', true)` — set via a Postgres function called from the API route before querying. Alternatively (simpler): a dedicated API route `POST /api/gift/lookup` that uses the service role, accepts `{ phone }`, normalises it, and returns only safe fields (campaign name, company name — no token UUID).

**Implementation choice**: Use a dedicated API route with service role (simpler, avoids new RLS policy complexity). Return only: `campaignName`, `companyName`, `campaignDate`. Never return the token value.

---

## Sub-project 4 — Audit Log

### Schema

New table `audit_events`:
```sql
CREATE TABLE audit_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   UUID,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_company_idx ON audit_events (company_id, created_at DESC);
```

RLS: `company_admin` can read rows where `company_id = jwt_company_id()`. No user can write directly — inserts are service-role only.

### Actions Logged

| action | resource_type | metadata |
|---|---|---|
| `campaign.created` | `campaign` | `{ name }` |
| `campaign.launched` | `campaign` | `{ name, token_count }` |
| `campaign.closed` | `campaign` | `{ name }` |
| `campaign.deleted` | `campaign` | `{ name }` |
| `campaign.duplicated` | `campaign` | `{ name, source_id }` |
| `campaign.reminder_sent` | `campaign` | `{ name, dispatched, failed }` |
| `token.redeemed` | `gift_token` | `{ employee_name, campaign_name }` |

### Audit Log Page (`/admin/audit`)

New page in the admin sidebar (lock icon). Chronological table:
- Timestamp (relative + absolute on hover)
- Actor (name or email)
- Action (human-readable: "Launched campaign **Holiday 2026**")
- Filter dropdown by action type

Data fetched server-side, paginated (50 rows per page).

---

## Architecture Notes

- All new DB writes go through service-role API routes — no direct client writes
- Audit log inserts are fire-and-forget (non-blocking) — a helper `logAuditEvent()` called after the primary action succeeds
- Scheduled send uses `CRON_SECRET` env var (added to Vercel env) — the cron endpoint returns 401 if the header is missing
- Employee self-check never exposes token UUIDs — lookup is phone-in, campaign metadata out
- Department breakdown and distributor stats are computed at request time — no materialised views needed at current scale

## Build Order

1. Analytics (no schema changes — fastest to ship)
2. Campaign Lifecycle (one migration for `scheduled_at`)
3. Employee Experience (one new public page + API route)
4. Audit Log (one migration + logging wired into existing routes)
