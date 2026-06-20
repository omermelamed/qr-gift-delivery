# GiftFlow Security Assessment — Findings

> Method: full static review of all 39 API routes, RLS migrations, auth/permission libs, storage policies, config, and dependencies on branch `main`.
> Date: 2026-06-20. These are code-confirmed unless marked *(verify at runtime)*.
> Severity scale: 🔴 Critical · 🟠 High · 🟡 Medium · ⚪ Low.

## Remediation status (2026-06-20)

All findings below have been remediated in code except where noted. Migration
`20240620000027_security_hardening.sql` must be applied in Supabase, and
`npm install` run (xlsx repointed to the patched SheetJS build).

| Finding | Status | Notes |
|---|---|---|
| C1 generate-qr | ✅ Fixed | Route deleted (was unused; `send` makes QRs inline). |
| C2 invite hijack | ✅ Fixed | Rejects platform-admin / foreign-company targets. |
| C3 campaign_notes RLS | ✅ Fixed | New migration — **apply in Supabase**. |
| H1 gift/lookup | ✅ Fixed | IP rate-limit (5/min). Edge/WAF still recommended. |
| H2 broken authz | ✅ Fixed | Role gates added to employees/notes/credits/scanners/logo. |
| H3 qr-codes bucket | ✅ Fixed | INSERT/SELECT restricted to service_role — **apply migration; verify QR images still render in staging**. |
| H4 xlsx | ✅ Fixed | Repointed to xlsx-0.20.3; run `npm install`. |
| H5 security headers | ✅ Fixed | `next.config.ts` — **verify CSP doesn't break anything in staging**. |
| H6 cron x-company-id | ✅ Fixed | Company derived from campaign row. |
| M1 users/resolve | ✅ Fixed | Scoped to caller's company. |
| M2 CSV injection | ✅ Fixed | Formula-prefix neutralized. |
| M3 logo upload | ✅ Fixed | Raster allowlist (SVG rejected); CSP `img-src` limits `logo_url`. |
| M4 rate limiting | ◑ Partial | `gift/lookup` covered; login/verify rely on Supabase + WAF. |
| M5 audit logging | ✅ Fixed | invite / role change / removal / impersonation logged. |
| M6 listUsers(1000) | ⚠️ Open | Left as-is — rewrite risks breaking team features. Defense-in-depth only. |
| L1 reset-password | ✅ Fixed | Now sends via `resetPasswordForEmail`. |
| L2 platform/migrate | ✅ Fixed | Dead route deleted. |
| L3 login open-redirect | ✅ Fixed | `next` param restricted to same-origin paths. |
| L4 SMS body | ⚠️ Accepted | Tenant-controlled content; low risk. |
| L5 slug uniqueness | ⚠️ Accepted | Enforced by DB `UNIQUE` constraint. |
| (new) Next.js 16.2.4 CVEs | ⚠️ Open | Surfaced by `npm audit`; needs a Next upgrade (breakage risk) — your call. |

## Summary

| # | Severity | Title | Location |
|---|---|---|---|
| C1 | 🔴 | Unauthenticated service-role DB + storage write | `api/generate-qr/route.ts` |
| C2 | 🔴 | Invite overwrites existing user metadata → cross-tenant account hijack | `api/team/invite/route.ts` |
| C3 | 🔴 | `campaign_notes` table has RLS disabled (anon read/write all tenants) | migration `…000011` |
| H1 | 🟠 | Unauthenticated phone→PII enumeration | `api/gift/lookup/route.ts` |
| H2 | 🟠 | Broken function-level authz — `scanner` can reach admin data | employees/notes/credits/team routes |
| H3 | 🟠 | `qr-codes` storage bucket: unrestricted INSERT + public read | migration `…000004` |
| H4 | 🟠 | Vulnerable dep `xlsx@0.18.5` (proto-pollution + ReDoS, no fix) parses uploads | `package.json` |
| H5 | 🟠 | No security headers (CSP/HSTS/X-Frame-Options/…) | `next.config.ts`, `vercel.json` |
| H6 | 🟠 | `CRON_SECRET` static shared secret gates SMS; send trusts `x-company-id` | cron + `…/send` |
| M1 | 🟡 | Cross-tenant name disclosure | `api/users/resolve/route.ts` |
| M2 | 🟡 | CSV / formula injection in export | `api/campaigns/[id]/export/route.ts` |
| M3 | 🟡 | Logo upload trusts client content-type (SVG stored-XSS); arbitrary `logo_url` | `settings/logo`, `settings` |
| M4 | 🟡 | No rate limiting anywhere (brute force / enumeration) | global |
| M5 | 🟡 | No audit logging on invite / role / email / ban / impersonation | team + platform routes |
| M6 | 🟡 | `listUsers({perPage:1000})` pulls all-tenant users into memory | several routes |
| L1–L5 | ⚪ | See Low section | — |

---

## 🔴 Critical

### C1 — `/api/generate-qr` is fully unauthenticated, uses the service-role key
`src/app/api/generate-qr/route.ts` has **zero auth**. Body `{ token, campaignId }` → builds path `${campaignId}/${token}.png`, uploads to the `qr-codes` bucket, and runs `UPDATE gift_tokens SET qr_image_url=… WHERE token=…` via service role.
- **Impact:** anonymous DB write + storage write/pollution (DoS / cost), data tampering, path-injection via `campaignId`/`token` (`../`, control chars).
- **Repro:** `curl -X POST $BASE/api/generate-qr -d '{"token":"anything","campaignId":"x"}' -H 'content-type: application/json'`.
- **Fix:** require an authenticated session + `campaigns:create`, resolve company and verify the token's campaign belongs to it — or **delete the route** (the `send` route already generates QRs inline; this looks like dead code).

### C2 — `/api/team/invite` clobbers an existing user's `app_metadata`
`src/app/api/team/invite/route.ts` (lines 98–106): when the invited email already exists, it calls `updateUserById(targetUserId, { app_metadata: { company_id: <caller company>, role_id, role_name } })` — replacing the target's entire metadata, with **no check that the target isn't already in another company or is the platform admin**.
- **Impact:** a `company_admin` can (a) yank a user out of another company into theirs, and (b) target `admin@giftflow.dev` to strip/downgrade the **platform_admin** role. Cross-tenant account hijack + privilege tampering.
- **Repro:** as adminA, `POST /api/team/invite {email: "<adminB-or-platform-email>", role_name:"scanner"}`; inspect target's metadata.
- **Fix:** reject if target already has a role in a *different* company (or is platform_admin); only ever `upsert` into `user_company_roles` for the new company, never overwrite role_name of a higher-privileged or foreign account.

### C3 — `campaign_notes` has RLS disabled (CONFIRMED)
Migration `20240501000011_campaign_notes.sql` creates the table but never runs `ENABLE ROW LEVEL SECURITY` and defines no policy. Every other table is locked down. Supabase grants the public `anon`/`authenticated` roles default access to `public`-schema tables, so **anyone with the browser-shipped anon key can SELECT/INSERT/UPDATE/DELETE all tenants' notes.**
- **Impact:** cross-tenant read of admins' free-text notes + stored-XSS write vector (anon writes a note an admin renders).
- **Repro:** `curl "$SUPABASE_URL/rest/v1/campaign_notes?select=*" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"`.
- **Fix:**
  ```sql
  ALTER TABLE campaign_notes ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "campaign_notes_platform_admin" ON campaign_notes
    FOR ALL USING (auth.is_platform_admin());
  CREATE POLICY "campaign_notes_company_isolation" ON campaign_notes
    FOR ALL USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND c.company_id = auth.jwt_company_id()))
    WITH CHECK (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND c.company_id = auth.jwt_company_id()));
  ```

---

## 🟠 High

### H1 — `/api/gift/lookup` unauthenticated PII / phone enumeration
`src/app/api/gift/lookup/route.ts`: no auth, no rate limit. Returns employee name + company name + campaign name for any phone with an unredeemed gift.
- **Impact:** privacy leak; lets anyone confirm "person at this phone works at company X and has a gift." Enumerable.
- **Fix:** require auth, or at minimum rate-limit + CAPTCHA and reduce returned fields. Consider lookup-by-token only.

### H2 — Broken function-level authorization (role not checked)
Many routes verify **authentication + company membership but not role/permission**, so a `scanner` (intended only to redeem tokens) can reach admin-grade data:
- `api/employees/route.ts` (GET/POST) — list full employee directory PII; create employees.
- `api/employees/[id]/route.ts` (PATCH/DELETE) — rename/clear/delete employees; PATCH also rewrites linked `auth.users` `full_name` and cascades to `gift_tokens`.
- `api/employees/import/route.ts` — bulk import.
- `api/campaigns/[id]/notes/*` — read/create/edit campaign notes.
- `api/sms/credits/route.ts` & `…/transactions` — view billing balance/ledger.
- `api/team/scanners/route.ts` — list all team members' **names + emails**.
- `api/settings/logo/route.ts` — replace the company logo.
- **Impact:** privilege boundary collapse for the lowest role; PII harvest + tampering within a tenant.
- **Fix:** add `hasPermission(...)` gates (e.g. `employees:manage`, `users:manage`, `billing:read`) to each, matching the model already used by campaigns/settings routes.

### H3 — `qr-codes` storage bucket misconfigured
Migration `20240101000004`: bucket is `public=true`; policy `qr_codes_service_insert` is `FOR INSERT WITH CHECK (bucket_id='qr-codes')` — **no role restriction**, so any authenticated user can upload arbitrary objects; `qr_codes_public_read` allows anyone to read (and potentially list) objects.
- **Impact:** open file hosting on your Supabase domain (storage fill / cost / abuse); public listing could enable `campaignId/token.png` enumeration → token discovery.
- **Fix:** restrict INSERT to the service role only (`auth.role() = 'service_role'`); confirm object listing is disabled for anon; consider a private bucket with signed URLs for QR images.

### H4 — Vulnerable dependency `xlsx@0.18.5`
`npm audit`: SheetJS prototype pollution (GHSA-4r6h-8v6p-xvw6) + ReDoS (GHSA-5pgg-2g8v-p4x9), **High, no npm fix available**. Used to parse user-uploaded spreadsheets (employee import).
- **Impact:** crafted spreadsheet → prototype pollution / DoS.
- **Fix:** move to the maintained SheetJS distribution (their CDN, not npm) or swap to `exceljs`; validate/limit file size & sheet count; parse in a sandboxed/edge-isolated path.

### H5 — No security headers
`next.config.ts` and `vercel.json` are empty. Missing CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- **Impact:** clickjacking of the admin dashboard, MIME sniffing, weaker XSS containment.
- **Fix:** add a `headers()` block in `next.config.ts` (frame-ancestors 'none', HSTS, nosniff, strict Referrer-Policy, a CSP).

### H6 — `CRON_SECRET` is a static shared secret; send route trusts `x-company-id`
`cron/send-scheduled` → calls `campaigns/[id]/send` with `x-cron-secret` + `x-company-id`. If the secret matches, send trusts the header-supplied company.
- **Impact:** if `CRON_SECRET` leaks (logs, bundle, history), an attacker can trigger SMS dispatch for arbitrary campaigns → SMS bombing / credit drain.
- **Fix:** confirm secret strength + that it never reaches the client; prefer Vercel's signed cron auth; have `send` derive company from the campaign row, never from a header.

---

## 🟡 Medium

- **M1 — `/api/users/resolve` cross-tenant name disclosure.** Gated by `campaigns:launch` but resolves *any* user UUID to a display name with no tenant scoping. Scope IDs to the caller's company.
- **M2 — CSV/formula injection in export.** `api/campaigns/[id]/export` quotes fields but doesn't neutralize cells beginning with `= + - @` (employee_name/department are user-supplied). Prefix such cells with `'`.
- **M3 — Logo upload content-type trust.** `settings/logo` validates only the client-supplied `file.type`; an SVG with embedded script can be uploaded and, served from origin, execute. Also `settings` PATCH stores an arbitrary `logo_url` string. Restrict to raster types / re-encode; force `Content-Disposition: attachment` or a sanitized type; validate `logo_url` origin.
- **M4 — No rate limiting.** Login, `gift/lookup`, `verify/[token]`, invite are all unthrottled. Add per-IP/user limits (Vercel WAF / middleware).
- **M5 — Missing audit logging on sensitive actions.** `team/invite`, `team/members/[userId]` (role/email/ban changes), and `platform/impersonate` don't call `logAuditEvent`, while campaign actions do. Add audit entries, especially for impersonation and role changes.
- **M6 — `listUsers({ perPage: 1000 })`** in `team/scanners`, `employees` sync, `export`, `invite` loads *all* platform users into memory and filters in app code: cross-tenant data in process memory and silent breakage past 1000 users. Prefer targeted `user_company_roles` joins.

## ⚪ Low
- **L1 — `team/reset-password`** uses `generateLink(type:'recovery')`, which *generates* but does not send an email — verify reset delivery actually works (functional + ensure the link isn't returned to the caller).
- **L2 — `platform/migrate`** is dead/confusing code that fires a pointless service-key `fetch`; remove it.
- **L3 — Open-redirect** *(verify)*: check `next` / `emailRedirectTo` params in `(auth)/login` and invite/reset flows reject absolute/`//` URLs.
- **L4 — SMS body** includes tenant-controlled `employee_name`; low-risk content injection.
- **L5 — `companies.slug`** uniqueness not enforced in app layer (relies on DB).

---

## Public-by-design (validated, not bugs — but watch)
- `/gift/[token]` and `/verify/[token]` reveal employee name + campaign by token; mitigated by **UUID v4** tokens (unguessable). Redemption is server-side & auth-gated (atomic `UPDATE … WHERE redeemed=false`). Keep tokens out of logs; pair with H3 fix so tokens can't be enumerated via storage.
- Credits integrity is enforced at the DB (`balance >= 0`, `balance = purchased - used`) and the send reservation uses an atomic `.gte('balance', n)` guard — good.

## Fix-before-launch shortlist
1. C3 (RLS on campaign_notes) — one migration, ship now.
2. C1 (delete or auth-gate generate-qr).
3. C2 (invite metadata clobber).
4. H2 (add role checks to employees/notes/credits/team routes).
5. H3 (lock the qr-codes INSERT policy).
6. H5 (security headers) + H4 (xlsx) + H6 (cron secret).
