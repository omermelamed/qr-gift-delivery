# GiftFlow Security Test Plan

> Scope: full-coverage security assessment of the GiftFlow SaaS platform (Next.js App Router + Supabase + Twilio on Vercel).
> Owner: Omer Melamed. Authorized self-assessment of own production/staging environment.
> Last updated from code review: see "Pre-identified findings" — verify these **first**, they are based on reading the current `main`.

---

## 0. Rules of engagement

- **Test against staging**, or a throwaway Supabase project seeded with fake data. Do NOT run destructive/credit-burning tests against the real Twilio account or real customer phone numbers.
- Disable real SMS sending (unset Twilio env or use a test number) before running send/credit tests — otherwise you'll burn real credits and spam real phones.
- Keep a log: endpoint, payload, expected vs actual, severity. Use the template in §8.
- Never paste real tokens, service-role keys, or customer PII into logs or this repo.

## 1. Test accounts to prepare

Create in the test environment:

| Account | Role | Purpose |
|---|---|---|
| `platform@test.dev` | platform_admin | god-mode tests, impersonation |
| `adminA@test.dev` | company_admin (Company A) | tenant-isolation baseline |
| `adminB@test.dev` | company_admin (Company B) | the "victim" tenant |
| `managerA@test.dev` | campaign_manager (Company A) | privilege-boundary tests |
| `scannerA@test.dev` | scanner (Company A) | lowest privilege; escalation tests |
| (no account) | anonymous | unauthenticated endpoint tests |

Seed Company A and Company B each with: 1 campaign, several gift tokens (some redeemed, some not), employees with phone numbers, and a credit balance.

## 2. Tooling

- **Burp Suite** (or `mitmproxy` / `caido`) — intercept + replay requests, swap session cookies/IDs.
- **`curl` / `httpie`** — scripted endpoint probing (templates in §7).
- The browser **anon key** (it's public — grab it from network tab / `NEXT_PUBLIC_SUPABASE_ANON_KEY`) plus the **Supabase REST endpoint** for direct RLS probing.
- `npm audit` / `osv-scanner` — dependency CVEs.
- `nuclei` with headers/exposures templates against the deployed URL.
- A second browser profile / incognito to hold a different role's session simultaneously.

---

## 3. Pre-identified findings (verify these FIRST)

These came out of the code review on `main`. Confirm each, rate impact in your environment, then fix.

### 🔴 C1 — `/api/generate-qr` is fully unauthenticated, uses the service-role key
`src/app/api/generate-qr/route.ts` has **no auth check**. It accepts `{ token, campaignId }`, generates a QR, uploads to the `qr-codes` storage bucket, and runs `UPDATE gift_tokens SET qr_image_url = … WHERE token = …` via the service-role client.
- **Test:** as anonymous, `POST /api/generate-qr` with arbitrary `campaignId` + `token` values. Confirm you can write objects into storage and mutate `gift_tokens` rows without a session.
- **Impact:** unauthenticated DB write + storage write/pollution (DoS / storage fill), data tampering. Possible bucket path injection via `campaignId`/`token` (try `../`, very long strings, path separators).
- **Likely fix:** require an authenticated session + permission, and validate the token belongs to the caller's company. This route may even be dead code (the `send` route already generates QRs inline) — consider deleting it.

### 🔴 C2 — `/api/team/invite` overwrites an existing user's `app_metadata` (cross-tenant hijack)
`src/app/api/team/invite/route.ts`: when the invited email already exists, it calls `service.auth.admin.updateUserById(targetUserId, { app_metadata: { company_id: <caller's company>, role_id, role_name } })` — **replacing the target's metadata wholesale**, with no check that the target isn't already a member of a different company (or a platform_admin).
- **Test:** as `adminA`, invite the email of `adminB` (Company B admin). Then check whether adminB's `app_metadata` now points to Company A. Repeat targeting `platform@test.dev` — confirm whether you can strip/downgrade the platform admin's role.
- **Impact:** account takeover / cross-tenant privilege tampering; potential platform_admin de-elevation. Critical for a multi-tenant product.
- **Likely fix:** reject invite if the user already has a role in another company (or merge into `user_company_roles` without clobbering `app_metadata`/role_name of a higher-privileged account).

### 🔴 C3 — `campaign_notes` has RLS DISABLED (CONFIRMED) + audit every other table
**Confirmed by migration review:** `campaign_notes` (migration `20240501000011`) is created but **never gets `ENABLE ROW LEVEL SECURITY` and has zero policies**. Every other app table is RLS-enabled. Since Supabase grants the public `anon`/`authenticated` roles default access to `public`-schema tables, **any holder of the public anon key (it ships in the browser) can SELECT/INSERT/UPDATE/DELETE all `campaign_notes` across all tenants** — cross-tenant read of admins' free-text notes AND a stored-XSS write vector (anon writes a note `body`; an admin renders it).
- **Fix (ship before/with the test):**
  ```sql
  ALTER TABLE campaign_notes ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "campaign_notes_platform_admin" ON campaign_notes
    FOR ALL USING (auth.is_platform_admin());
  CREATE POLICY "campaign_notes_company_isolation" ON campaign_notes
    FOR ALL USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND c.company_id = auth.jwt_company_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND c.company_id = auth.jwt_company_id()));
  ```
- Still verify the rest at runtime — `message_templates`, `credits`, `credit_transactions`, `employees`, `campaign_gifts`, `campaign_distributors`, `audit_events` all have RLS enabled in migrations, but confirm in the live DB they each also have a *restrictive policy* (RLS on + zero policies = deny-all, which can mask a logic bug; RLS off = wide open like notes).
- **Test (most important single test):** with only the **public anon key**, hit the Supabase REST API directly for each table and try to read/write cross-tenant rows:
  ```
  curl "$SUPABASE_URL/rest/v1/campaign_notes?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
  ```
  Run for: `campaign_notes`, `credits`, `credit_transactions`, `sms_templates`, `employees`, `campaign_gifts`, `campaign_distributors`, `audit_events`, `companies`. A table with RLS off returns ALL tenants' rows.
- Also confirm with: `SELECT relname, relrowsecurity FROM pg_class WHERE relkind='r';` in the SQL editor — every app table must show `relrowsecurity = true` **and** have at least one policy.
- **Impact:** any table without RLS = full cross-tenant data breach via a key that ships in the browser.

### 🟠 H1 — `/api/gift/lookup` unauthenticated PII / phone enumeration
`src/app/api/gift/lookup/route.ts` takes a phone number (no auth, no rate limit) and returns employee name, company name, campaign name for any unredeemed gift.
- **Test:** as anonymous, POST phone numbers; confirm PII returned. Script enumeration to show no rate limiting.
- **Impact:** privacy leak + lets an attacker confirm "does person X (phone) work at company Y and have a gift." Add rate limiting / CAPTCHA / minimize returned fields.

### 🟠 H2 — No `middleware.ts`; auth is enforced per-route
There is no central auth gate. Each route/layout enforces its own checks, so coverage is only as good as the weakest route.
- **Test:** enumerate every route in `src/app/api/**/route.ts` (list in §6) and for each, send an **unauthenticated** request and a **wrong-role / wrong-tenant** request. Build the matrix in §6.

### 🟠 H3 — `CRON_SECRET` is a single static shared secret gating SMS sends; send route trusts `x-company-id`
`/api/cron/send-scheduled` and `/api/campaigns/[id]/send`: if `x-cron-secret === CRON_SECRET`, the send route **trusts the `x-company-id` header** and dispatches SMS (burning credits).
- **Test:** confirm `CRON_SECRET` strength and that it's never exposed (client bundles, logs, error responses, git history). Try the send route with a guessed/blank secret. Confirm a valid-secret caller can't send for a campaign whose `company_id` they spoof in the header (the `.eq('company_id', companyId)` should make a mismatch 404 — verify).
- **Impact:** if the secret leaks → SMS bombing / credit drain across tenants.

### 🟠 H4 — No security headers configured
`next.config.ts` and `vercel.json` are empty. No CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy.
- **Test:** `curl -I` the deployed app; confirm missing headers. Test clickjacking (frame the admin dashboard).

### 🟡 M1 — `/api/users/resolve` cross-tenant name disclosure
Gated by `campaigns:launch` but resolves **any** user ID to a display name with no tenant scoping. A company_admin can harvest names of users in other companies if they can guess/obtain user UUIDs.

### 🟡 M2 — Impersonation has no audit log / no re-auth
`/api/platform/impersonate` sets an 8h cookie; `resolveCompanyId` trusts it. Verify: impersonation events are audit-logged; the cookie is httpOnly+secure in prod (it is in code — confirm in prod response); no CSRF token on the POST (session-gated, but consider). Confirm a non-platform-admin cannot set/forge the cookie to gain company access (it's read by `resolveCompanyId` only when role_name === 'platform_admin', so verify a regular admin setting that cookie manually is ignored).

### 🟡 M3 — Public storage buckets
`qr-codes` and `logos` buckets are public; object paths are `campaignId/token.png` and `companyId/logo.ext`. Confirm whether listing is disabled (can't enumerate the bucket) and that knowing a public URL only exposes a QR/logo (acceptable) — but note redemption is gated server-side so a leaked QR URL alone shouldn't redeem.

### 🟡 M4 — Logo upload content-type trust (stored XSS via SVG)
`/api/settings/logo` checks `file.type.startsWith('image/')` (client-controlled) and size. An attacker can upload an SVG containing `<script>`; if served from the app origin and opened directly, it executes.
- **Test:** upload `evil.svg` with embedded JS; check the served `Content-Type`/`Content-Disposition` and whether it runs in a browser. Restrict to raster types or force `Content-Disposition: attachment` / a sanitized content-type.

---

## 4. Systematic test categories (full coverage)

### 4.1 Authentication & session
- Login: brute-force / rate limiting on Supabase auth; lockout behavior.
- Password reset (`/api/team/reset-password`): note it uses `generateLink(type:'recovery')` which **generates but may not send** an email — verify reset actually delivers (functional + security: no token leakage in response).
- Session: cookie flags (httpOnly, Secure, SameSite) on Supabase auth cookies; session fixation; does logout invalidate; JWT expiry honored; tampered JWT rejected.
- Magic-link / invite links: single-use? expiry? redirect open-redirect via `redirectTo`/`next` params (e.g. `/login?next=//evil.com`).

### 4.2 Authorization & multi-tenancy (highest priority for a SaaS)
- **IDOR across every `[id]` route**: as `adminA`, take a Company B `campaignId`, `tokenId`, `userId`, `noteId`, `giftId`, `employeeId`, `templateId` and try GET/PATCH/DELETE. Expected: 403/404, never B's data. Routes to hit: all under `campaigns/[id]/*`, `employees/[id]`, `sms/templates/[id]`, `team/members/[userId]`, `platform/companies/[id]/*`.
- **Role escalation**: as `scannerA`, attempt admin-only actions (create campaign, invite user, add credits, change settings). As `managerA`, attempt company_admin-only actions. Confirm `fetchPermissions`/`hasPermission` blocks each.
- **Platform-admin sentinel abuse**: confirm the `__platform_admin__` permission sentinel can only ever be produced for a real platform_admin (`fetchPermissions` returns it only when `role_name==='platform_admin'`, which comes from the signed JWT — verify JWT can't be self-set).
- **Impersonation boundary**: while impersonating Company A, confirm platform admin actions are correctly scoped to A and `Back to Platform` clears the cookie.

### 4.3 Token / redemption integrity (core domain)
- Token guessability: confirm tokens are UUID v4 (unguessable, non-sequential).
- **Double redemption / race (TOCTOU)**: fire many concurrent `POST /api/verify/[token]` for one token; exactly one success. (Code uses an atomic `UPDATE … WHERE redeemed=false` — verify it holds under load.)
- Redeem closed/expired campaign token → rejected.
- Redeem as unauthorized scanner (not assigned distributor, not admin) → rejected; platform_admin bypass works as intended.
- Redeem cross-tenant token.
- Verify `/verify/[token]` page (server component) and `/api/verify/[token]` agree and both enforce auth.

### 4.4 Injection & output handling
- **Stored XSS**: put `<img src=x onerror=alert(1)>` / `"><script>` into employee_name, company name, campaign name, gift name, SMS template, campaign notes, department. View in admin tables, exported CSV (`/api/campaigns/[id]/export` — CSV formula injection: leading `=`,`+`,`-`,`@`), and the verify result card. Note: lots of RTL/Hebrew rendering — test bidi/unicode tricks.
- **SQL injection**: Supabase client parameterizes, but check any raw filters / `.or()` string building and the `gift/lookup` phone normalization path.
- **CSV import** (`/api/employees/import`): malformed rows, huge files, formula injection, encoding (UTF-8/Hebrew), header spoofing.
- **JSON body abuse / mass assignment**: send extra fields (`company_id`, `redeemed`, `role_name`, `balance`) on PATCH/POST bodies to see if they're trusted instead of derived server-side.

### 4.5 Business logic
- **Credit manipulation**: try to add credits as non-platform-admin (`/api/platform/companies/[id]/credits` — should be 403). Try negative/zero/huge/decimal amounts (code checks positive integer — verify). Race the `send` credit reservation to overspend (concurrent sends; the `.gte('balance', smsCount)` guard should prevent — verify).
- **Send idempotency**: double-fire `/api/campaigns/[id]/send`; `sent_at` guard should 409 the second.
- **Refund logic**: force SMS failures and confirm refunds can't be gamed to inflate balance.
- **Campaign close**: after close, no sends/redemptions; can a manager reopen?

### 4.6 File upload / storage
- Logo (§M4) and QR generation (§C1) paths; oversized files, wrong types, path traversal in `campaignId`/`token`/`companyId` used to build storage paths.

### 4.7 Rate limiting & DoS
- No rate limiting observed. Hammer: `/api/gift/lookup`, login, `/api/verify/[token]`, invite. Confirm there's some protection (Vercel/WAF) or flag the gap.

### 4.8 Infra / config / exposure
- Security headers (§H4). HTTPS/HSTS. CORS on API routes.
- Secret leakage: grep client bundle and responses for `SERVICE_ROLE`, `CRON_SECRET`, Twilio SID/token. Confirm only `NEXT_PUBLIC_*` reach the browser.
- `.env` not committed; check git history for leaked secrets (`git log -p | grep -i secret`).
- `npm audit` / `osv-scanner` for dependency CVEs.
- Error verbosity: confirm 500s don't leak stack traces / SQL.

---

## 5. Quick anonymous probe script (run first)

```bash
BASE=https://your-staging-url
# Every API route, unauthenticated — expect 401/403/400, flag any 200 returning data
for r in \
  "/api/generate-qr|POST|{\"token\":\"x\",\"campaignId\":\"x\"}" \
  "/api/gift/lookup|POST|{\"phone\":\"+972500000000\"}" \
  "/api/users/resolve|POST|{\"ids\":[\"x\"]}" \
  "/api/platform/companies|GET|" \
  "/api/sms/credits|GET|" \
  "/api/settings|GET|" ; do
  IFS='|' read -r path method bodydata <<< "$r"
  echo "=== $method $path ==="
  curl -s -o /dev/null -w "%{http_code}\n" -X "$method" "$BASE$path" \
    -H 'Content-Type: application/json' ${bodydata:+-d "$bodydata"}
done
```

Direct RLS probe with the public anon key (C3):
```bash
for t in campaign_notes credits credit_transactions sms_templates employees \
         campaign_gifts campaign_distributors audit_events companies gift_tokens; do
  echo "=== $t ==="
  curl -s -o /dev/null -w "%{http_code} " "$SUPABASE_URL/rest/v1/$t?select=*&limit=1" \
    -H "apikey: $ANON" -H "Authorization: Bearer $ANON"; echo
done
# 200 with rows for a table you shouldn't see anonymously = RLS gap
```

## 6. Endpoint auth matrix (fill in)

For each route: does it check (a) authenticated, (b) correct permission, (c) tenant scope?

| Route | Anon → ? | Wrong role → ? | Cross-tenant → ? | Notes |
|---|---|---|---|---|
| `POST /api/generate-qr` | | | | **C1 — no auth** |
| `POST /api/gift/lookup` | | | | **H1 — public PII** |
| `POST /api/users/resolve` | | | | **M1** |
| `POST /api/team/invite` | | | | **C2** |
| `POST /api/team/reset-password` | | | | |
| `* /api/campaigns/[id]/*` | | | | IDOR sweep |
| `* /api/employees/[id]` | | | | |
| `* /api/sms/templates/[id]` | | | | |
| `* /api/platform/companies/[id]/credits` | | | | admin must be 403 |
| `POST /api/campaigns/[id]/send` | | | | H3 cron header |
| `GET /api/cron/send-scheduled` | | | | secret-gated |
| `POST /api/verify/[token]` | | | | redemption race |
| `* /api/settings`, `/settings/logo` | | | | M4 |
| ...(complete for all 40 routes) | | | | |

## 7. Reusable authenticated probe
Grab a role's `sb-…-auth-token` cookie from the browser, then:
```bash
curl -s "$BASE/api/campaigns/$COMPANY_B_CAMPAIGN_ID" \
  -H "Cookie: $ADMIN_A_COOKIE" -w "\n%{http_code}\n"
# Expect 403/404. A 200 with Company B data = IDOR.
```

## 8. Finding report template
```
ID:           (C1, H2, …)
Title:
Severity:     Critical | High | Medium | Low
Endpoint/File:
Auth context: anon | scanner | manager | admin (Co A) | platform
Steps to reproduce:
Request/payload:
Expected:
Actual:
Impact:
Fix recommendation:
Status:       open | fixed | accepted-risk
```

---

## 9. Suggested order for tomorrow
1. **C3** — RLS-on-every-table probe (biggest blast radius, 15 min).
2. **C1** — unauthenticated generate-qr.
3. **C2** — invite metadata overwrite.
4. **H1/H2** — anon probe script + full endpoint matrix (§6).
5. **4.2** tenant-isolation IDOR sweep (the SaaS-critical category).
6. **4.3** redemption race + auth.
7. **H3, H4, M1–M4**, then **4.4–4.8** breadth.
8. Write up findings (§8), prioritize fixes.
```
