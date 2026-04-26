# Phase 2 — SMS & Scanning
**Timeline:** Week 2

## Goal
Enable bulk SMS delivery of QR codes via Twilio and build the distributor scan interface with real-time token validation.

---

## Tasks

### 2.1 Twilio Integration
- [ ] Install Twilio Node.js SDK
- [ ] Configure Twilio credentials in environment variables (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`)
- [ ] Create helper: `sendMMS(to: string, imageUrl: string, body: string)`
- [ ] Test single MMS send with a QR image URL

### 2.2 Bulk SMS Sender API
- [ ] Create Next.js API route: `POST /api/campaigns/[id]/send`
  - Reads all `gift_tokens` for the campaign
  - Generates QR code image for each token (calls Phase 1 QR API)
  - Sends MMS via Twilio to each employee's phone number
  - Updates `sms_sent_at` in `gift_tokens` after each successful send
- [ ] Handle Twilio rate limiting (queue with small delay if needed)
- [ ] Update `campaigns.sent_at` when all messages are dispatched

### 2.3 Token Validation API
- [ ] Create Next.js API route: `GET /api/verify/[token]`
  - If token not found → return `{ valid: false, reason: "invalid" }`
  - If token already redeemed → return `{ valid: false, reason: "already_used", employee_name }`
  - If token unused → atomically mark as redeemed, return `{ valid: true, employee_name }`
- [ ] Ensure atomic write (first-write-wins, idempotent — no double redemption)

### 2.4 Distributor Scan Interface
- [ ] Create page: `/scan` (mobile-optimized)
- [ ] Integrate camera-based QR scanner (e.g., `html5-qrcode` or `@zxing/browser`)
- [ ] On scan, call `/api/verify/[token]` and display result:
  - ✅ Valid — show employee name
  - ❌ Already claimed — show warning
  - ⚠️ Invalid token — show error
- [ ] Require distributor login to access `/scan`

---

## Definition of Done
- Bulk SMS sends QR images to all employees in a campaign
- `sms_sent_at` is recorded per token after send
- Token validation is atomic — no double redemption possible
- Distributor scan page works on iOS Safari and Android Chrome
