# Google OAuth Login (Invited Users Only) — Design

**Date:** 2026-06-23
**Status:** Approved, pending implementation plan

## Objective

Let already-invited users sign in with Google as an alternative to email/password.
Google is **not** a self-signup path: a Google identity only grants access if the
email already belongs to an invited user (i.e. has `app_metadata.company_id`).
Brand-new Google emails are rejected and the auto-created orphan auth user is deleted.

## Context

The app is a Next.js (App Router, v16) multi-tenant SaaS on Supabase Auth.

- Users are **invited by company admins** (`src/app/api/team/invite/route.ts`), which
  sets `app_metadata` = `{ company_id, role_id, role_name }` via the service role and
  upserts `user_company_roles`.
- Roles: `company_admin`, `campaign_manager`, `scanner`, `platform_admin`.
- Existing auth flows: email/password sign-in, magic-link OTP (invite/re-invite),
  password reset.
- Email confirmation deliberately uses an explicit-POST flow
  (`src/app/auth/confirm/verify/route.ts`) **not** PKCE `?code=`, because email-link
  prefetchers issue GET requests that would burn the single-use token. **This concern
  does not apply to OAuth** — the same browser starts and finishes the flow — so OAuth
  uses the standard PKCE callback.
- `src/proxy.ts` treats `/auth` as a public prefix (the session is established inside it).
- The real authorization check happens in each layout (e.g. `src/app/admin/layout.tsx`
  reads `app_metadata.role_name`); the proxy only does an optimistic cookie check.

## Flow

```
Login page → "Continue with Google"
  → supabase.auth.signInWithOAuth({ provider: 'google',
        options: { redirectTo: <origin>/auth/callback?next=<safeNext> } })
  → Google consent → /auth/callback?code=…[&next=…]
  → exchangeCodeForSession(code)          // sets session cookie
  → read user.app_metadata.company_id
       ├─ present  → 303 redirect to role-based default (or ?next)
       └─ absent   → orphan:
                       service.auth.admin.deleteUser(user.id)
                       supabase.auth.signOut()
                       303 → /login?error=not_invited
```

## Components

### 1. `src/app/auth/callback/route.ts` (new)

GET route handler.

- Read `code` and `next` from the query string.
- If no `code`: redirect to `/login?error=oauth_failed`.
- `const supabase = await createClient()` (SSR server client — writes session cookies).
- `const { error } = await supabase.auth.exchangeCodeForSession(code)`.
  - On error: redirect to `/login?error=oauth_failed`.
- `const { data: { user } } = await supabase.auth.getUser()`.
- **Invited-user gate:** if `!(user.app_metadata as JwtAppMetadata)?.company_id`:
  - `createServiceClient().auth.admin.deleteUser(user.id)`
  - `await supabase.auth.signOut()`
  - redirect to `/login?error=not_invited`.
- Otherwise compute the destination with the shared role→path helper, honoring a
  safe `next` (same-origin relative path only), and `NextResponse.redirect(dest, 303)`.
- Base URL: `process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin`
  (matches `auth/confirm/verify/route.ts`).
- Reuse the existing open-redirect guard: accept `next` only when it
  `startsWith('/')` and not `'//'` / `'/\\'`.

Lives under the already-public `/auth` proxy prefix, so no `proxy.ts` change is needed.

### 2. `src/app/(auth)/login/page.tsx` (change)

- Add a **"Continue with Google"** button (below or above the email/password form,
  with an "or" divider). On click:
  ```ts
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}` },
  })
  ```
- Render an error banner from `?error=`:
  - `not_invited` → "This Google account hasn't been invited. Ask your admin for an invite."
  - `oauth_failed` → "Google sign-in failed. Please try again."
- Reuse existing Tailwind styling and `useT` i18n; add the new strings to the i18n catalog.

### 3. Shared role→path helper (new, small)

Extract the current inline mapping from the login page into e.g.
`src/lib/auth/default-path.ts`:

```ts
export function defaultPathForRole(roleName?: string): string {
  if (roleName === 'scanner') return '/scan/campaigns'
  if (roleName === 'platform_admin') return '/platform'
  return '/admin'
}
```

Use it in both `login/page.tsx` (password flow) and `auth/callback/route.ts` so the
two flows can't drift. Single source of truth.

### 4. `supabase/config.toml` (change)

Add a Google external-provider block for local dev:

```toml
[auth.external.google]
enabled = true
client_id = "env(GOOGLE_OAUTH_CLIENT_ID)"
secret = "env(GOOGLE_OAUTH_CLIENT_SECRET)"
```

Add `<origin>/auth/callback` (http and https localhost variants) to
`additional_redirect_urls`. Production configures the Google provider in the Supabase
dashboard instead.

## Config / secrets

- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` — server-side only, consumed by
  Supabase Auth (dashboard for prod, `config.toml`/env for local). Never exposed to the
  browser. Document in `.env.local.example`.
- Google Cloud Console: OAuth consent screen + a Web OAuth client whose authorized
  redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback`.

## Why the orphan-delete gate is safe

A genuinely-invited user *always* has `app_metadata.company_id` set by the invite route
before they can ever complete a login. So "missing `company_id` after a successful code
exchange" unambiguously means "never invited" — deleting that user cannot affect a real
account. Account auto-linking (Google identity merged into the existing invited user) is
safe specifically because Google verifies email ownership, preventing email-spoof linking.

## Testing

- `tests/api/auth-callback.test.ts` (mirrors existing `tests/api/*` mocking style):
  - invited user → 303 to the correct role path (`/admin`, `/scan/campaigns`, `/platform`).
  - honors a safe `?next=`; ignores `//evil.com`.
  - orphan (no `company_id`) → `deleteUser` called, `signOut` called, 303 to
    `/login?error=not_invited`.
  - missing/invalid code → 303 to `/login?error=oauth_failed`.
- Manual: real Google sign-in for an invited company admin and an invited scanner;
  a non-invited Google email is rejected with the `not_invited` banner.

## Out of scope (YAGNI)

Self-signup, new-company creation, role-assignment UI, role-restricted provider gating,
and any non-Google providers are deferred.
