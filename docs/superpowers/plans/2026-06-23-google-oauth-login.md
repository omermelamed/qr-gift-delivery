# Google OAuth Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let already-invited users sign in with Google; reject and delete brand-new (uninvited) Google accounts.

**Architecture:** Add a standard Supabase PKCE OAuth callback route (`/auth/callback`) that exchanges the code, gates on `app_metadata.company_id` (the invited-user marker), deletes the orphan + signs out on failure, and otherwise redirects by role. A shared `defaultPathForRole` helper keeps the password and OAuth flows in sync. The login page gets a "Continue with Google" button and `?error=` banners.

**Tech Stack:** Next.js 16 App Router, Supabase Auth (`@supabase/ssr`), Vitest, Tailwind.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-23-google-oauth-login-design.md`.
- "Invited" is defined as `app_metadata.company_id` being present. Nothing else counts.
- Service-role client (`createServiceClient`) is server-side only — only used inside the callback route handler, never a client component.
- Open-redirect guard for `next`: accept only when it `startsWith('/')` AND not `startsWith('//')` AND not `startsWith('/\\')`. Otherwise fall back to the role default.
- Base URL: `process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin` (match `src/app/auth/confirm/verify/route.ts`).
- `/auth/*` is already a public prefix in `src/proxy.ts` — do NOT modify proxy.
- Role values: `'platform_admin' | 'company_admin' | 'campaign_manager' | 'scanner'` (`JwtAppMetadata`, `src/types/index.ts:74`).
- All redirects from the callback use HTTP status **303**.
- User-facing copy goes through `useT` i18n (login page).

---

### Task 1: Shared role→path helper

**Files:**
- Create: `src/lib/auth/default-path.ts`
- Test: `tests/lib/default-path.test.ts`
- Modify: `src/app/(auth)/login/page.tsx` (replace inline mapping)

**Interfaces:**
- Produces: `defaultPathForRole(roleName?: string): string` — returns `/scan/campaigns` for `scanner`, `/platform` for `platform_admin`, otherwise `/admin`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/default-path.test.ts
import { describe, it, expect } from 'vitest'
import { defaultPathForRole } from '@/lib/auth/default-path'

describe('defaultPathForRole', () => {
  it('routes scanner to the campaigns list', () => {
    expect(defaultPathForRole('scanner')).toBe('/scan/campaigns')
  })
  it('routes platform_admin to the platform home', () => {
    expect(defaultPathForRole('platform_admin')).toBe('/platform')
  })
  it('routes company_admin to /admin', () => {
    expect(defaultPathForRole('company_admin')).toBe('/admin')
  })
  it('defaults unknown/undefined role to /admin', () => {
    expect(defaultPathForRole(undefined)).toBe('/admin')
    expect(defaultPathForRole('mystery')).toBe('/admin')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/default-path.test.ts`
Expected: FAIL — cannot resolve `@/lib/auth/default-path`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/auth/default-path.ts
// Single source of truth for where a signed-in user lands, shared by the
// password sign-in flow and the Google OAuth callback so they cannot drift.
export function defaultPathForRole(roleName?: string): string {
  if (roleName === 'scanner') return '/scan/campaigns'
  if (roleName === 'platform_admin') return '/platform'
  return '/admin'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/default-path.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Use the helper in the login page**

In `src/app/(auth)/login/page.tsx`, add the import at the top with the other `@/lib` imports:

```ts
import { defaultPathForRole } from '@/lib/auth/default-path'
```

Then replace the inline mapping inside `handleSubmit`:

```ts
      const meta = data.user.app_metadata as JwtAppMetadata | undefined
      let defaultPath = '/admin'
      if (meta?.role_name === 'scanner') defaultPath = '/scan/campaigns'
      else if (meta?.role_name === 'platform_admin') defaultPath = '/platform'
      router.push(nextPath ?? defaultPath)
```

with:

```ts
      const meta = data.user.app_metadata as JwtAppMetadata | undefined
      router.push(nextPath ?? defaultPathForRole(meta?.role_name))
```

- [ ] **Step 6: Verify the login page still type-checks and tests pass**

Run: `npx tsc --noEmit && npx vitest run tests/lib/default-path.test.ts`
Expected: no type errors; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth/default-path.ts tests/lib/default-path.test.ts "src/app/(auth)/login/page.tsx"
git commit -m "refactor(auth): extract defaultPathForRole helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: OAuth callback route

**Files:**
- Create: `src/app/auth/callback/route.ts`
- Test: `tests/api/auth-callback.test.ts`

**Interfaces:**
- Consumes: `defaultPathForRole` (Task 1); `createClient`, `createServiceClient` from `@/lib/supabase/server`; `JwtAppMetadata` from `@/types`.
- Produces: `GET(request: NextRequest): Promise<NextResponse>` — a Next.js route handler. Behavior:
  - no `code` → 303 `/login?error=oauth_failed`
  - `exchangeCodeForSession` error → 303 `/login?error=oauth_failed`
  - user has `app_metadata.company_id` → 303 to `next` (if safe) else `defaultPathForRole(role_name)`
  - user missing `company_id` → `service.auth.admin.deleteUser(user.id)` + `supabase.auth.signOut()` + 303 `/login?error=not_invited`

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/auth-callback.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockExchange = vi.fn()
const mockGetUser = vi.fn()
const mockSignOut = vi.fn()
const mockDeleteUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: mockExchange,
      getUser: mockGetUser,
      signOut: mockSignOut,
    },
  }),
  createServiceClient: () => ({
    auth: { admin: { deleteUser: mockDeleteUser } },
  }),
}))

function makeRequest(query: string) {
  return new NextRequest(`http://localhost/auth/callback${query}`)
}

describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    mockExchange.mockResolvedValue({ error: null })
    mockSignOut.mockResolvedValue({ error: null })
    mockDeleteUser.mockResolvedValue({ error: null })
  })

  it('redirects to /login?error=oauth_failed when no code', async () => {
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(makeRequest(''))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=oauth_failed')
  })

  it('redirects to /login?error=oauth_failed when exchange fails', async () => {
    mockExchange.mockResolvedValue({ error: { message: 'bad code' } })
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(makeRequest('?code=abc'))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=oauth_failed')
  })

  it('routes an invited company_admin to /admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', app_metadata: { company_id: 'co-1', role_name: 'company_admin' } } },
    })
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(makeRequest('?code=abc'))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost:3000/admin')
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('routes an invited scanner to /scan/campaigns', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-2', app_metadata: { company_id: 'co-1', role_name: 'scanner' } } },
    })
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(makeRequest('?code=abc'))
    expect(res.headers.get('location')).toBe('http://localhost:3000/scan/campaigns')
  })

  it('honors a safe relative next param', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-3', app_metadata: { company_id: 'co-1', role_name: 'company_admin' } } },
    })
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(makeRequest('?code=abc&next=%2Fadmin%2Fcampaigns'))
    expect(res.headers.get('location')).toBe('http://localhost:3000/admin/campaigns')
  })

  it('ignores an open-redirect next param', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-4', app_metadata: { company_id: 'co-1', role_name: 'company_admin' } } },
    })
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(makeRequest('?code=abc&next=%2F%2Fevil.com'))
    expect(res.headers.get('location')).toBe('http://localhost:3000/admin')
  })

  it('rejects and deletes an uninvited orphan user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'orphan-1', app_metadata: {} } },
    })
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(makeRequest('?code=abc'))
    expect(mockDeleteUser).toHaveBeenCalledWith('orphan-1')
    expect(mockSignOut).toHaveBeenCalled()
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=not_invited')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/auth-callback.test.ts`
Expected: FAIL — cannot resolve `@/app/auth/callback/route`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/auth/callback/route.ts
import { type NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { defaultPathForRole } from '@/lib/auth/default-path'
import type { JwtAppMetadata } from '@/types'

// Standard Supabase PKCE OAuth callback. Unlike the email-confirm flow
// (auth/confirm/verify), the same browser starts and finishes here, so the
// `?code=` exchange is safe from email-link prefetchers.
//
// Google is an alternative login for ALREADY-INVITED users only: an invited
// user always has `app_metadata.company_id` (set by the invite route before
// they can log in). A brand-new Google email exchanges fine but has no
// company_id — that orphan is deleted and rejected.
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const nextParam = url.searchParams.get('next')

  const base = process.env.NEXT_PUBLIC_APP_URL ?? url.origin
  const redirect = (path: string) => NextResponse.redirect(new URL(path, base), 303)

  if (!code) return redirect('/login?error=oauth_failed')

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return redirect('/login?error=oauth_failed')

  const { data: { user } } = await supabase.auth.getUser()
  const meta = user?.app_metadata as JwtAppMetadata | undefined

  // Invited-user gate.
  if (!meta?.company_id) {
    if (user) {
      await createServiceClient().auth.admin.deleteUser(user.id)
    }
    await supabase.auth.signOut()
    return redirect('/login?error=not_invited')
  }

  // Only allow same-origin relative redirects (no open redirect).
  const safeNext =
    nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.startsWith('/\\')
      ? nextParam
      : null

  return redirect(safeNext ?? defaultPathForRole(meta.role_name))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/auth-callback.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/auth/callback/route.ts tests/api/auth-callback.test.ts
git commit -m "feat(auth): Google OAuth callback with invited-user gate

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: "Continue with Google" button + error banners on the login page

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/browser`; `signInWithOAuth` provider flow.
- Produces: no exported symbols — UI only. Adds a Google button that calls `supabase.auth.signInWithOAuth` and an error banner reading `searchParams.get('error')`.

- [ ] **Step 1: Add the OAuth error reader and handler in `LoginForm`**

In `src/app/(auth)/login/page.tsx`, inside `LoginForm`, just after the existing `resetSuccess` line:

```ts
  const resetSuccess = searchParams.get('reset') === 'success'
```

add:

```ts
  const oauthError = searchParams.get('error')
  const oauthErrorMessage =
    oauthError === 'not_invited'
      ? t("This Google account hasn't been invited. Ask your admin for an invite.")
      : oauthError === 'oauth_failed' || oauthError === 'link_expired'
        ? t('Google sign-in failed. Please try again.')
        : null
```

Then add the handler alongside `handleSubmit` / `handleForgot`:

```ts
  async function handleGoogle() {
    setError(null)
    const supabase = createClient()
    const origin = window.location.origin
    const redirectTo = `${origin}/auth/callback${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (oauthErr) setError(oauthErr.message)
  }
```

- [ ] **Step 2: Render the error banner and the Google button**

In the `mode === 'signin'` block, surface the OAuth error next to the existing `{error && ...}` banner. Immediately after the existing `{error && (...)}` JSX inside the signin block, add:

```tsx
          {oauthErrorMessage && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {oauthErrorMessage}
            </p>
          )}
```

Then, immediately after the `</form>` that closes the email/password form (still inside the `mode === 'signin'` block, before the "Forgot password?" button), add the divider + Google button:

```tsx
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-200" />
            <span className="text-xs text-zinc-400">{t('or')}</span>
            <div className="h-px flex-1 bg-zinc-200" />
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-2 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
            </svg>
            {t('Continue with Google')}
          </button>
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint "src/app/(auth)/login/page.tsx"`
Expected: no errors.

- [ ] **Step 4: Verify the existing login renders (build the route)**

Run: `npx vitest run tests/lib/default-path.test.ts tests/api/auth-callback.test.ts`
Expected: PASS (regression guard — login page has no unit test; the helper + callback tests cover the logic it depends on).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/login/page.tsx"
git commit -m "feat(auth): Continue with Google button and OAuth error banners

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Local Supabase Google provider config + env docs

**Files:**
- Modify: `supabase/config.toml`
- Modify: `.env.local.example`

**Interfaces:**
- Produces: no code. Enables the Google provider for local Supabase and documents the two new server-side env vars.

- [ ] **Step 1: Add the Google external-provider block to `supabase/config.toml`**

Append to `supabase/config.toml` (after the existing `[auth]` settings):

```toml
[auth.external.google]
enabled = true
client_id = "env(GOOGLE_OAUTH_CLIENT_ID)"
secret = "env(GOOGLE_OAUTH_CLIENT_SECRET)"
```

- [ ] **Step 2: Add the callback to allowed redirect URLs**

In `supabase/config.toml`, update the existing `additional_redirect_urls` line so it includes the OAuth callback for both localhost schemes:

```toml
additional_redirect_urls = ["https://127.0.0.1:3000", "http://127.0.0.1:3000/auth/callback", "https://127.0.0.1:3000/auth/callback"]
```

- [ ] **Step 3: Document the env vars in `.env.local.example`**

Append to `.env.local.example`:

```bash
# Google OAuth (server-side only; consumed by Supabase Auth). Local dev reads
# these via supabase/config.toml. Production sets the Google provider in the
# Supabase dashboard instead. Authorized redirect URI in Google Cloud Console:
#   https://<project-ref>.supabase.co/auth/v1/callback
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
```

- [ ] **Step 4: Validate the config file parses**

Run: `npx supabase config 2>/dev/null || echo "supabase CLI not available locally — verify TOML by eye"`
Expected: either the command succeeds, or you confirm the `[auth.external.google]` block is well-formed TOML.

- [ ] **Step 5: Commit**

```bash
git add supabase/config.toml .env.local.example
git commit -m "chore(auth): enable Google provider for local Supabase + document env

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests PASS, including the new `tests/lib/default-path.test.ts` and `tests/api/auth-callback.test.ts`.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds; `/auth/callback` appears as a route.

- [ ] **Step 4: Manual smoke test (requires Google creds + running app)**

Document the result of each in the PR description:
1. Invited company admin → "Continue with Google" → lands on `/admin`.
2. Invited scanner → "Continue with Google" → lands on `/scan/campaigns`.
3. Never-invited Google email → rejected with the `not_invited` banner; confirm no lingering user in `auth.users`.

- [ ] **Step 5: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "test(auth): verify Google OAuth login flow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
