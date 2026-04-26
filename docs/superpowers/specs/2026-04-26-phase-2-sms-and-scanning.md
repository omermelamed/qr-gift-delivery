# Phase 2 — SMS & Scanning Design

**Date:** 2026-04-26

---

## Goal

Enable bulk QR delivery (via Twilio MMS in production, dev preview page locally) and build the distributor scan interface with atomic token validation. Add login and auth middleware to protect scanner and admin routes.

---

## Architecture

### Dev / Prod mode split

The send API checks `TWILIO_MOCK=true` at runtime:

- **Production** (`TWILIO_MOCK` unset or `false`): generates QR image per token → sends Twilio MMS → updates `sms_sent_at`.
- **Dev** (`TWILIO_MOCK=true`): generates QR image per token → skips Twilio → updates `sms_sent_at` (state is realistic) → response includes `devPreviewUrl` pointing to `/dev/preview/[campaignId]`.

The DB state is identical in both modes. The only difference is whether an MMS is actually sent.

---

## Components

### 1. `POST /api/campaigns/[id]/send`

- Requires auth + `campaigns:launch` permission.
- Fetches all `gift_tokens` for the campaign where `sms_sent_at IS NULL`.
- For each token:
  1. Calls `POST /api/generate-qr` to get `qrImageUrl` (skips if already set).
  2. In production: sends MMS via Twilio helper, updates `sms_sent_at` on success.
  3. In dev: skips Twilio, updates `sms_sent_at` directly.
- Uses `Promise.allSettled` in batches of 50 with 1s delay between batches (Twilio rate limit).
- Sets `campaigns.sent_at = now()` after all tokens processed.
- Response: `{ dispatched: number, failed: number, campaignId: string, devPreviewUrl?: string }`.

### 2. `POST /api/verify/[token]`

- Public endpoint — no auth required (scanner device may not have session).
- Atomic redemption via single SQL UPDATE:
  ```sql
  UPDATE gift_tokens
  SET redeemed = true, redeemed_at = now(), redeemed_by = $distributorId
  WHERE token = $token AND redeemed = false
  RETURNING employee_name
  ```
- If 0 rows returned: check if token exists → `already_used` or `invalid`.
- Response contract:
  - Valid: `{ valid: true, employeeName: string }`
  - Used: `{ valid: false, reason: "already_used", employeeName: string }`
  - Invalid: `{ valid: false, reason: "invalid" }`

### 3. `/dev/preview/[campaignId]`

- Dev-only page — rendered only when `NODE_ENV !== 'production'`. Returns 404 in production.
- No auth required (localhost only, no sensitive data beyond QR images).
- Fetches all `gift_tokens` for the campaign via service-role client (server component).
- Displays a grid: employee name, phone (masked), QR code image.
- Purpose: allow developer/tester to scan a real QR with a phone without paying Twilio.

### 4. `/scan`

- Mobile-optimized, full-screen camera page.
- Requires session + `tokens:scan` permission — middleware redirects to `/login` if not met.
- Uses `@zxing/browser` for camera-based QR decoding (works on iOS Safari + Android Chrome).
- Flow:
  1. Camera opens, continuously decodes frames.
  2. On decode: extracts token from URL (`/verify/<token>`), calls `POST /api/verify/[token]`.
  3. Displays result overlay:
     - ✅ Green — employee name, "Gift collected"
     - ❌ Red — "Already claimed" + employee name
     - ⚠️ Orange — "Invalid QR code"
  4. After 3 seconds, overlay dismisses and camera resumes.

### 5. `/login`

- Email + password login via Supabase Auth (`signInWithPassword`).
- On success: redirects to `/scan` (for scanners) or `/admin` (for admins/managers) based on `role_name` in JWT.
- Simple form — no social auth needed.

### 6. Auth Middleware (`middleware.ts`)

- Runs on `/scan`, `/admin/*`, and `/api/campaigns/*`.
- Uses `@supabase/ssr` to read session from cookies.
- Unauthenticated → redirect to `/login`.
- Missing permission → redirect to `/login` (or 403 for API routes).

---

## File Map

| File | Action |
|---|---|
| `src/app/api/campaigns/[id]/send/route.ts` | Create |
| `src/app/api/verify/[token]/route.ts` | Create |
| `src/app/(dev)/dev/preview/[campaignId]/page.tsx` | Create |
| `src/app/(auth)/login/page.tsx` | Create |
| `src/app/scan/page.tsx` | Create |
| `src/components/QrScanner.tsx` | Create |
| `src/lib/twilio.ts` | Create |
| `src/middleware.ts` | Create |
| `tests/api/send.test.ts` | Create |
| `tests/api/verify.test.ts` | Create |

---

## Hard Invariants

- Verify endpoint must use atomic UPDATE — never read-then-write.
- `sms_sent_at` is set only after the send is confirmed (Twilio `.sid` exists, or mock path explicitly sets it).
- Dev preview page returns 404 in production — guarded by `NODE_ENV` check.
- `TWILIO_MOCK=true` in `.env.local` activates mock mode; Twilio env vars are not required when mocking.
- Scanner page requires `tokens:scan` permission — enforced in middleware.

---

## Definition of Done

- `POST /api/campaigns/[id]/send` dispatches QR + MMS (or mock) for all unsent tokens.
- `POST /api/verify/[token]` atomically redeems tokens — no double redemption possible.
- `/dev/preview/[campaignId]` shows QR images scannable with a phone (dev only).
- `/scan` works on iOS Safari and Android Chrome with camera.
- `/login` authenticates users and redirects by role.
- Middleware protects `/scan` and `/admin/*` — unauthenticated users hit `/login`.
- All API routes have Vitest tests with mocked Supabase/Twilio.
