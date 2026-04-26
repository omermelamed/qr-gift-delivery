---
name: campaign-flow
description: The core business workflow — campaign creation through CSV upload, QR generation, SMS blast, distributor scanning, and HR reporting. Use when implementing or reviewing any part of the end-to-end gift delivery flow.
---

# Campaign Flow

The central product flow from campaign creation to gift redemption. Every feature connects back to this pipeline.

## Flow steps

```
1. HR creates campaign (name + date)
        ↓
2. HR uploads CSV (employee name + phone)
        ↓
3. System bulk-inserts gift_tokens rows (token UUID auto-generated per row)
        ↓
4. HR reviews preview, clicks "Launch"
        ↓
5. API: generate QR image per token → upload to Supabase Storage → update qr_image_url
        ↓
6. API: send MMS via Twilio per employee → update sms_sent_at on success
        ↓
7. Campaign.sent_at updated when all messages dispatched
        ↓
8. Distributor scans QR → POST /api/verify/[token]
        ↓
9. Atomic UPDATE: redeemed=true WHERE token=X AND redeemed=false
        ↓
10. HR dashboard updates live via Supabase Realtime
        ↓
11. HR exports CSV audit log
```

## State machine for gift_tokens

```
PENDING (sms_sent_at NULL, redeemed FALSE)
  → SENT (sms_sent_at set, redeemed FALSE)
  → REDEEMED (redeemed TRUE, redeemed_at set, redeemed_by set)
```

Transitions are one-directional. No state goes backward.

## API contract summary

### POST /api/verify/[token]
Request: `{ distributorId: string }`
Response (valid):   `{ valid: true, employeeName: string }`
Response (used):    `{ valid: false, reason: "already_used", employeeName: string }`
Response (invalid): `{ valid: false, reason: "invalid" }`

### POST /api/campaigns/[id]/send
Response: `{ dispatched: number, failed: number, campaignId: string }`

### POST /api/generate-qr
Request: `{ token: string, campaignId: string }`
Response: `{ qrImageUrl: string }`

## CSV format

```csv
name,phone_number
Omer Melamed,+972501234567
Dana Cohen,0521234567
```

Accepted phone formats: `+972XXXXXXXXX` or `05XXXXXXXX`. Validate before insert.

## Checklist when touching this flow

- [ ] token uniqueness preserved (UNIQUE constraint, never overwritten)
- [ ] QR image uploaded before SMS send attempt
- [ ] `sms_sent_at` only set after Twilio confirms
- [ ] verify endpoint uses atomic UPDATE (not read-then-write)
- [ ] Realtime subscription covers `gift_tokens` for the campaign
- [ ] export CSV includes all audit fields: name, phone, sms_sent_at, redeemed, redeemed_at
