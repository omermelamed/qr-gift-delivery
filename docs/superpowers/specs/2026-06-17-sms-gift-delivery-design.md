# SMS Gift Delivery Design

**Date:** 2026-06-17
**Status:** Approved

## Problem

Twilio MMS is not supported for Israeli phone numbers. WhatsApp was considered but excluded because a portion of employees do not have WhatsApp installed. The solution must reach every employee with only a phone number.

## Solution

Switch gift delivery from Twilio MMS to plain SMS. Instead of attaching a QR image, send a text message with a link to a new public employee-facing page (`/gift/[token]`) that displays the QR code. The employee taps the link, sees the QR on screen, and shows it to the distributor to scan.

## Architecture

### 1. `src/lib/twilio.ts`

Remove `qrImageUrl` from `SendGiftMMSOptions` and `MediaUrl` from the Twilio API call. Update the default `Body` to include the gift link:

```
Hi {employeeName}! Here's your {holidayName} gift: {appUrl}/gift/{token}
```

The `token` value must be threaded through from the call site (send routes). Add `token` to `SendGiftMMSOptions`.

### 2. `src/app/gift/[token]/page.tsx` (new)

Public page — no authentication required. Uses the Supabase service role (read-only) to look up `qr_image_url` and `employee_name` by token. Renders:
- Employee name
- QR code image (from `qr_image_url`)
- Campaign name
- Simple instruction: "Show this to your gift distributor"

Returns a 404-style result if the token does not exist. Does not perform or reveal any redemption state.

### 3. `src/app/api/campaigns/[id]/send/route.ts`

- Pass `token.token` into `sendGiftMMS` (needed for the link in the default body).
- Change the `{link}` placeholder replacement in `smsTemplate` from `/verify/${token.token}` to `/gift/${token.token}`.

### 4. `src/app/api/campaigns/[id]/resend/route.ts`

- Same `{link}` placeholder change: `/verify/` → `/gift/`.
- Pass `token.token` into `sendGiftMMS`.

### 5. `.env.local`

`TWILIO_PHONE_NUMBER` must be set to a Twilio number with SMS capability for Israel (+972). The WhatsApp sandbox number (`+14155238886`) is not used.

## What does not change

- Distributor flow and `/verify/[token]` — untouched
- DB schema and `gift_tokens` columns — untouched
- `sms_sent_at` tracking logic — untouched
- QR image generation and storage in Supabase Storage — untouched (still runs on send, `qr_image_url` is still stored)
- Mock mode (`TWILIO_MOCK=true`) — still works

## Employee experience

1. Employee receives SMS: `Hi Dana! Here's your Hanukkah gift: https://app.com/gift/TOKEN`
2. Employee taps link → `/gift/TOKEN` page loads, shows QR code
3. Employee shows screen to distributor
4. Distributor scans QR → `/verify/TOKEN` → gift redeemed

## Security

- `/gift/[token]` is intentionally public — the token is a UUID v4 (unguessable). The page reveals only the QR image and employee name, not redemption state.
- No service-role writes on this page — read-only lookup only.
- The verify/redemption logic remains entirely on `/verify/[token]` which requires distributor auth.
