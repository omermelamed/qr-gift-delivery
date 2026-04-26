# Security rules

## Token security

- tokens are UUID v4 — unguessable, never sequential
- the verify URL encodes the token directly (`/verify/{token}`) — this is intentional and safe given UUIDs
- never log token values in application logs
- token expiry is campaign-scoped; invalidate all tokens when a campaign is closed

## Auth and RLS

- admin routes (`/admin/*`) must check session server-side via `createServerClient`; redirect to login if unauthenticated
- distributor scan route (`/scan`) must check session; role must be `distributor`
- Supabase RLS is the enforcement layer — never disable it for convenience
- service-role key is only used in server-side API routes; never import it in client components

## Atomic redemption

- the verify endpoint must use a single atomic SQL UPDATE:
  ```sql
  UPDATE gift_tokens
  SET redeemed = true, redeemed_at = now(), redeemed_by = $distributor_id
  WHERE token = $token AND redeemed = false
  RETURNING employee_name
  ```
- if the UPDATE returns 0 rows, either the token is invalid or already redeemed — check which and respond accordingly
- never implement this as a read-then-write; that is a TOCTOU race condition

## Twilio

- Twilio credentials are server-side only (API routes); never reference them in client code
- phone numbers are stored as-is from the CSV; validate format before attempting to send
