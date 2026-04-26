# Domain context

## Roles

| Role | Access | Responsibility |
|---|---|---|
| HR Admin | `/admin/*` (authenticated) | Create campaigns, upload CSV, launch SMS blast, monitor dashboard, export reports |
| Gift Distributor | `/scan` (authenticated) | Scan employee QR codes in the field to confirm gift handoff |
| Employee | Public (no login) | Receive MMS, present QR code — no app or account needed |

## Core entities

**Campaign** — a named holiday gift event (e.g., "Passover 2026"). Created by HR, has a sent_at timestamp once launched.

**GiftToken** — one row per employee per campaign. Contains the unique `token` UUID (the QR payload), SMS delivery status, and redemption state. This is the source of truth.

## Hard invariants

- `token` is a UUID — unguessable, unique globally
- `redeemed = true` is set exactly once — the first successful scan wins, any subsequent scan returns "already claimed"
- the verify endpoint write must be atomic (use `UPDATE ... WHERE redeemed = false RETURNING *` or equivalent)
- `sms_sent_at` is written only after Twilio confirms the message was accepted
- the service-role key is only used server-side (API routes / server actions), never exposed to the browser

## URL structure

- `/verify/[token]` — public landing shown when employee's QR is scanned directly
- `/scan` — distributor camera scan page (authenticated)
- `/admin` — HR admin root (authenticated)
- `/admin/campaigns/new` — campaign creation
- `/admin/campaigns/[id]` — campaign detail, launch, live dashboard
- `/api/verify/[token]` — token validation API (POST)
- `/api/campaigns/[id]/send` — launch SMS blast (POST)
- `/api/generate-qr` — generate and store QR image (POST)

## Database schema

```sql
CREATE TABLE campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  created_by   UUID REFERENCES auth.users,
  created_at   TIMESTAMPTZ DEFAULT now(),
  sent_at      TIMESTAMPTZ
);

CREATE TABLE gift_tokens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID REFERENCES campaigns(id),
  employee_name  TEXT NOT NULL,
  phone_number   TEXT NOT NULL,
  token          UUID UNIQUE DEFAULT gen_random_uuid(),
  qr_image_url   TEXT,
  sms_sent_at    TIMESTAMPTZ,
  redeemed       BOOLEAN DEFAULT FALSE,
  redeemed_at    TIMESTAMPTZ,
  redeemed_by    UUID REFERENCES auth.users
);
```

## Cost envelope

~$41 per campaign (2,000 Twilio MMS at ~$0.02 each). Vercel and Supabase are free tier.
