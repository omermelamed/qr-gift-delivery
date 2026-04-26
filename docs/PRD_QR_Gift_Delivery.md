# Product Requirements Document
## One-Time QR Code Gift Delivery System
> Employee Holiday Gifting — Verification & Tracking Platform

| Field | Value |
|---|---|
| Version | 1.0 |
| Date | April 2026 |
| Status | Draft |
| Target Scale | ~2,000 employees |

**Tech Stack:** Twilio (SMS) · Supabase (Database & Backend) · Vercel (Frontend Hosting)

---

## 1. Overview & Problem Statement

The company distributes physical gifts to approximately 2,000 employees on major holidays each year. Currently there is no digital system to confirm that each employee has actually received their gift, leading to disputes, unclaimed gifts, and no audit trail for HR.

> **Core Problem:** No existing off-the-shelf platform combines bulk SMS delivery, one-time-use QR code generation, physical gift receipt confirmation, and an HR dashboard — in a single lightweight tool.

This document defines the requirements for a custom-built web application that solves this gap, built on Twilio (SMS), Supabase (database + API), and Vercel (hosting).

---

## 2. Goals & Success Metrics

### Goals
- Generate a unique, one-time-use QR code per employee per holiday event
- Send each QR code to the employee's phone via SMS automatically
- Invalidate the QR code immediately upon first successful scan
- Provide HR with a real-time dashboard showing claimed vs. unclaimed gifts
- Allow the gift distributor to scan employee QR codes in the field (offline-tolerant)

### Success Metrics
- 100% of employees receive their SMS within 10 minutes of campaign launch
- Zero duplicate redemptions across any campaign
- HR can see live redemption status at any time
- System handles 2,000 concurrent QR sends with no degradation

---

## 3. User Roles

| Role | Description |
|---|---|
| **HR Admin** | Creates campaigns, uploads employee list, monitors redemption dashboard, exports reports |
| **Gift Distributor** | Field staff who physically hand out gifts and scan employee QR codes to confirm delivery |
| **Employee** | Receives SMS with QR code, presents it to distributor at time of gift pickup |

---

## 4. User Flow

**Step 1 — HR Admin creates a campaign**
Logs into the admin dashboard, enters campaign name (e.g., "Passover 2026"), uploads CSV with employee names + phone numbers, sets campaign date.
`Vercel Frontend` `Supabase DB`

**Step 2 — System generates unique QR codes**
One unique token (UUID) is generated per employee. A QR code is created encoding a verification URL: `https://yourdomain.com/verify/{token}`. Each token is stored in Supabase as unused.
`Supabase`

**Step 3 — SMS sent to all employees**
Twilio bulk-sends an MMS to each employee containing their personalized QR code image and a short message: *"Your [Holiday] gift is ready. Show this QR code to collect it."*
`Twilio MMS`

**Step 4 — Employee presents QR code**
Employee shows the QR image on their phone to the gift distributor at the pickup point.

**Step 5 — Distributor scans the QR code**
Using a phone camera or the distributor app, they scan the code. The system checks Supabase:
- If unused → marks as redeemed + shows ✅ success
- If already used → shows ❌ already claimed

`Supabase` `Vercel API`

**Step 6 — HR monitors in real time**
The dashboard updates live showing how many gifts have been claimed vs. remaining, and can export a full audit log at any time.
`Supabase Realtime`

---

## 5. Technical Architecture

| Layer | Service | Responsibility | Notes |
|---|---|---|---|
| Frontend | Vercel (Next.js) | Admin dashboard, distributor scan page, employee verification landing page | Free tier sufficient; auto-scales globally |
| Database | Supabase (Postgres) | Stores employees, campaigns, QR tokens, redemption records | Free tier: 500MB, 2GB transfer/mo |
| Auth | Supabase Auth | HR admin & distributor login | Row-level security per role |
| Realtime | Supabase Realtime | Live dashboard updates as QR codes are redeemed | WebSocket subscriptions |
| SMS / MMS | Twilio | Sends QR code images to employees via MMS | ~$0.02 per MMS in Israel |
| QR Generation | qrcode (npm lib) | Generates QR PNG from unique token URL | Runs server-side in Next.js API route |
| File Storage | Supabase Storage | Stores generated QR code images temporarily | Needed for Twilio to serve image URL in MMS |

---

## 6. Database Schema (Supabase / Postgres)

```sql
-- Campaigns (e.g., "Passover 2026")
CREATE TABLE campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  created_by   UUID REFERENCES auth.users,
  created_at   TIMESTAMPTZ DEFAULT now(),
  sent_at      TIMESTAMPTZ
);

-- One row per employee per campaign
CREATE TABLE gift_tokens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID REFERENCES campaigns(id),
  employee_name  TEXT NOT NULL,
  phone_number   TEXT NOT NULL,
  token          UUID UNIQUE DEFAULT gen_random_uuid(), -- the QR payload
  qr_image_url   TEXT,
  sms_sent_at    TIMESTAMPTZ,
  redeemed       BOOLEAN DEFAULT FALSE,
  redeemed_at    TIMESTAMPTZ,
  redeemed_by    UUID REFERENCES auth.users -- distributor ID
);
```

---

## 7. Feature Requirements

### Admin Dashboard
- Create and name a new gift campaign
- Upload employee list via CSV (name + phone number)
- Preview list before sending
- Launch campaign — triggers QR generation + SMS blast
- Real-time progress bar: X of 2,000 gifts claimed
- Table view: employee name, phone, status (Sent / Claimed / Pending)
- Export redemption report as CSV
- Resend SMS to specific employees (e.g., those who didn't receive it)

### Distributor Scan Interface
- Mobile-optimized web page (no app install required)
- Opens phone camera to scan QR codes
- Instant visual feedback: ✅ Valid / ❌ Already Used / ⚠️ Invalid
- Shows employee name upon valid scan for confirmation
- Works on standard 4G — no special equipment needed

### Employee-Side (No App Needed)
- Receives MMS with QR image embedded
- QR is valid for the duration of the campaign
- No login or app required — just show the image

---

## 8. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | QR verification response under 1 second. SMS blast of 2,000 messages completes within 10 minutes. |
| **Security** | Tokens are UUID-based (unguessable). Supabase Row-Level Security prevents cross-role data access. Admin routes require authentication. |
| **Availability** | Vercel and Supabase both offer 99.9%+ uptime SLAs. No single point of failure in the critical verification path. |
| **Idempotency** | Scanning a QR code twice must never mark a second redemption. Database write is atomic — first write wins. |
| **Compatibility** | Distributor interface must work on iOS Safari and Android Chrome. QR image must render correctly in Israeli carrier MMS. |
| **Auditability** | Every redemption is timestamped and linked to the distributor who scanned it. Full audit trail exportable by HR at any time. |

---

## 9. Estimated Cost

| Service | Usage | Cost Per Campaign | Annual (5 holidays) |
|---|---|---|---|
| Vercel | Frontend hosting | $0 (free tier) | $0 |
| Supabase | DB + Auth + Storage | $0 (free tier) | $0 |
| Twilio MMS | 2,000 messages × ~$0.02 | ~$40 | ~$200 |
| Twilio Phone Number | 1 number | ~$1/mo | ~$12 |
| **Total** | | **~$41 / campaign** | **~$212 / year** |

---

## 10. Development Timeline

| Phase | Timeline | Tasks |
|---|---|---|
| **Setup & Core** | Week 1 | Supabase schema, Auth setup, QR generation API, Vercel project init |
| **SMS & Scanning** | Week 2 | Twilio integration, Bulk SMS sender, Distributor scan UI, Token validation API |
| **Admin Dashboard** | Week 3 | Campaign creator, CSV upload, Live status view, Export reports |
| **Testing & Launch** | Week 4 | End-to-end testing, Load test (2,000), HR team UAT, Production deploy |

---

## 11. Out of Scope (v1.0)

- **Native mobile app** — web-based distributor interface is sufficient
- **HR system integrations** (BambooHR, Workday) — CSV upload used instead
- **Gift catalog / e-gift card selection** — system verifies physical delivery only
- **WhatsApp delivery** — Twilio SMS/MMS used for v1; WhatsApp can be added in v2
- **Multi-language support** — Hebrew/English can be added post-launch

---

*One-Time QR Gift Delivery System · PRD v1.0 · Confidential*
*Powered by Twilio · Supabase · Vercel*
