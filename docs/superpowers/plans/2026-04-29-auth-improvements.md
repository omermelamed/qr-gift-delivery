# Auth Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add forgot-password inline flow on the login page, a `/reset-password` page, and a "Resend invite" button on the Team page for pending members.

**Architecture:** Forgot-password toggles the login card into a new UI mode (no page navigation) and calls Supabase Auth directly from the browser client. The reset-password page listens for Supabase's `PASSWORD_RECOVERY` auth-state event on mount. Resend invite is a thin API route that re-calls `inviteUserByEmail` using the service-role client, surfaced as a `ResendInviteButton` client component on the existing team page.

**Tech Stack:** Next.js 15 App Router, React 19, Supabase Auth (`resetPasswordForEmail`, `onAuthStateChange`, `updateUser`), Tailwind v4, Vitest.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `src/app/(auth)/login/page.tsx` |
| Create | `src/app/(auth)/reset-password/page.tsx` |
| Create | `src/app/api/team/resend/route.ts` |
| Create | `src/components/admin/ResendInviteButton.tsx` |
| Modify | `src/app/admin/team/page.tsx` |
| Create | `tests/api/team-resend.test.ts` |

---

### Task 1: Forgot-password flow on login page

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`

The login page currently has a single `'signin'` mode. Add two new modes: `'forgot'` (shows email input + send button) and `'sent'` (shows confirmation). Toggle between them via a "Forgot password?" link below the sign-in button.

- [ ] **Step 1: Add mode state and forgot-password handler to login page**

Replace the entire content of `src/app/(auth)/login/page.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import type { JwtAppMetadata } from '@/types'

type Mode = 'signin' | 'forgot' | 'sent'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const resetSuccess = searchParams.get('reset') === 'success'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError || !data.user) {
        setError(authError?.message ?? 'Sign in failed')
        return
      }
      const meta = data.user.app_metadata as JwtAppMetadata | undefined
      router.push(meta?.role_name === 'scanner' ? '/scan' : '/admin')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
      })
      if (resetError) {
        setError(resetError.message)
        return
      }
      setMode('sent')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500" />
          <span className="text-xl font-bold text-zinc-900">GiftFlow</span>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8 flex flex-col gap-5">
          {mode === 'signin' && (
            <>
              <h1 className="text-lg font-semibold text-zinc-900">Sign in to your account</h1>

              {resetSuccess && (
                <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                  Password updated — sign in with your new password.
                </p>
              )}

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email" className="text-sm font-medium text-zinc-700">Email</label>
                  <input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-zinc-700">Password</label>
                  <input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all mt-1"
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>

              <button
                onClick={() => { setError(null); setForgotEmail(email); setMode('forgot') }}
                className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors text-center"
              >
                Forgot password?
              </button>
            </>
          )}

          {mode === 'forgot' && (
            <>
              <h1 className="text-lg font-semibold text-zinc-900">Reset your password</h1>
              <p className="text-sm text-zinc-500">Enter your email and we'll send a reset link.</p>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <form onSubmit={handleForgot} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="forgot-email" className="text-sm font-medium text-zinc-700">Email</label>
                  <input
                    id="forgot-email"
                    type="email"
                    placeholder="you@company.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                    className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <button
                onClick={() => { setError(null); setMode('signin') }}
                className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors text-center"
              >
                ← Back to sign in
              </button>
            </>
          )}

          {mode === 'sent' && (
            <>
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-lg font-semibold text-zinc-900">Check your email</h1>
              <p className="text-sm text-zinc-500">
                We sent a reset link to <span className="font-medium text-zinc-700">{forgotEmail}</span>.
                Click the link in the email to set a new password.
              </p>
              <button
                onClick={() => setMode('signin')}
                className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors text-center"
              >
                ← Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify the login page renders without TypeScript errors**

```bash
cd /Users/omer.melamed/Desktop/private/qr-gift-delivery
npx tsc --noEmit 2>&1 | grep "login"
```

Expected: no output (no errors in login page).

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/login/page.tsx
git commit -m "feat: add forgot-password inline flow to login page"
```

---

### Task 2: Reset password page

**Files:**
- Create: `src/app/(auth)/reset-password/page.tsx`

Supabase sends a recovery email with a link to `/reset-password#access_token=...&type=recovery`. On page load, `onAuthStateChange` fires with event `PASSWORD_RECOVERY`. At that point the user is temporarily authenticated and can call `updateUser`.

- [ ] **Step 1: Create reset-password page**

Create `src/app/(auth)/reset-password/page.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message)
        return
      }
      router.push('/login?reset=success')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-8">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500" />
          <span className="text-xl font-bold text-zinc-900">GiftFlow</span>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8 flex flex-col gap-5">
          {!ready ? (
            <>
              <h1 className="text-lg font-semibold text-zinc-900">Verifying link…</h1>
              <p className="text-sm text-zinc-500">
                If nothing happens, your link may have expired.{' '}
                <button
                  onClick={() => router.push('/login')}
                  className="text-indigo-600 hover:underline"
                >
                  Request a new one.
                </button>
              </p>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-zinc-900">Set new password</h1>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-zinc-700">New password</label>
                  <input
                    id="password"
                    type="password"
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="confirm" className="text-sm font-medium text-zinc-700">Confirm password</label>
                  <input
                    id="confirm"
                    type="password"
                    placeholder="Repeat new password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
                >
                  {loading ? 'Saving…' : 'Set new password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "reset-password"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/reset-password/page.tsx
git commit -m "feat: add /reset-password page for Supabase password recovery"
```

---

### Task 3: Resend invite API route

**Files:**
- Create: `src/app/api/team/resend/route.ts`
- Create: `tests/api/team-resend.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/team-resend.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockGetUserById = vi.fn()
const mockInviteUser = vi.fn()
const mockFromService = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({
    from: mockFromService,
    auth: { admin: { getUserById: mockGetUserById, inviteUserByEmail: mockInviteUser } },
  }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['users:manage']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/team/resend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/team/resend', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'admin-1',
          app_metadata: { company_id: 'co-1', role_id: 'role-admin', role_name: 'company_admin' },
        },
      },
    })
  })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('@/app/api/team/resend/route')
    const res = await POST(makeRequest({ userId: 'u-1' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when role lacks users:manage', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)
    const { POST } = await import('@/app/api/team/resend/route')
    const res = await POST(makeRequest({ userId: 'u-1' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when userId missing', async () => {
    const { POST } = await import('@/app/api/team/resend/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 404 when user not found', async () => {
    mockGetUserById.mockResolvedValue({ data: { user: null }, error: { message: 'not found' } })
    const { POST } = await import('@/app/api/team/resend/route')
    const res = await POST(makeRequest({ userId: 'ghost' }))
    expect(res.status).toBe(404)
  })

  it('re-invites user and returns success', async () => {
    mockGetUserById.mockResolvedValue({ data: { user: { id: 'u-1', email: 'user@co.com' } }, error: null })
    mockInviteUser.mockResolvedValue({ data: {}, error: null })
    const { POST } = await import('@/app/api/team/resend/route')
    const res = await POST(makeRequest({ userId: 'u-1' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockInviteUser).toHaveBeenCalledWith('user@co.com', expect.objectContaining({
      redirectTo: expect.stringContaining('/admin'),
    }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/api/team-resend.test.ts 2>&1 | tail -20
```

Expected: FAIL — module not found for `@/app/api/team/resend/route`.

- [ ] **Step 3: Implement the route**

Create `src/app/api/team/resend/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'users:manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const userId: string | undefined = body.userId
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const service = createServiceClient()
  const { data: { user: targetUser }, error } = await service.auth.admin.getUserById(userId)
  if (error || !targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  await service.auth.admin.inviteUserByEmail(targetUser.email!, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/admin`,
  })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/api/team-resend.test.ts 2>&1 | tail -20
```

Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/team/resend/route.ts tests/api/team-resend.test.ts
git commit -m "feat: add POST /api/team/resend for re-sending pending invites"
```

---

### Task 4: ResendInviteButton component + team page integration

**Files:**
- Create: `src/components/admin/ResendInviteButton.tsx`
- Modify: `src/app/admin/team/page.tsx`

- [ ] **Step 1: Create ResendInviteButton component**

Create `src/components/admin/ResendInviteButton.tsx`:

```tsx
'use client'

import { useState } from 'react'

export function ResendInviteButton({ userId }: { userId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')

  async function handleResend() {
    setState('loading')
    try {
      const res = await fetch('/api/team/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      setState(res.ok ? 'sent' : 'error')
      if (res.ok) setTimeout(() => setState('idle'), 3000)
    } catch {
      setState('error')
    }
  }

  return (
    <button
      onClick={handleResend}
      disabled={state === 'loading' || state === 'sent'}
      className="border border-zinc-200 rounded-lg px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
    >
      {state === 'loading' ? 'Sending…' : state === 'sent' ? 'Sent!' : state === 'error' ? 'Failed' : 'Resend'}
    </button>
  )
}
```

- [ ] **Step 2: Add ResendInviteButton to the Actions column in the team page**

In `src/app/admin/team/page.tsx`, add the import at the top alongside the other imports:

```typescript
import { ResendInviteButton } from '@/components/admin/ResendInviteButton'
```

Then find the Actions cell in the table row and replace it:

Old:
```tsx
                  <td className="px-5 py-3 text-right">
                    {!m.isSelf && <RemoveMemberButton userId={m.id} name={m.name} />}
                  </td>
```

New:
```tsx
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {m.isPending && !m.isSelf && (
                        <ResendInviteButton userId={m.id} />
                      )}
                      {!m.isSelf && <RemoveMemberButton userId={m.id} name={m.name} />}
                    </div>
                  </td>
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "team|resend"
```

Expected: no output.

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/ResendInviteButton.tsx src/app/admin/team/page.tsx
git commit -m "feat: add Resend invite button for pending team members"
```
