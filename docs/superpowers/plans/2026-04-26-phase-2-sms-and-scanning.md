# Phase 2 — SMS & Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bulk QR + SMS dispatch (with dev mock mode), atomic token redemption, auth proxy, login page, dev preview page, and a mobile QR scanner.

**Architecture:** Next.js 16 App Router. Auth is enforced by `src/proxy.ts` (the Next.js 16 rename of `middleware.ts` — function name is `proxy`, not `middleware`). API routes double-check auth server-side per the Next.js 16 proxy docs. The send route checks `TWILIO_MOCK=true` at call time — when set, it skips Twilio but still generates QR images and writes `sms_sent_at` to the DB. The verify endpoint uses an atomic `UPDATE ... WHERE redeemed = false RETURNING *` — never read-then-write. Route handler and page component `params` are `Promise<{ ... }>` in Next.js 16 and must be awaited.

**Tech Stack:** Next.js 16.2.4 (App Router) · TypeScript · Tailwind CSS · Supabase (`@supabase/ssr`) · `twilio` npm · `@zxing/browser` + `@zxing/library` · Vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `.env.local.example` | Modify | Add `TWILIO_MOCK=true` |
| `src/lib/twilio.ts` | Create | `sendGiftMMS()` with mock branch |
| `src/app/api/verify/[token]/route.ts` | Create | Atomic token redemption |
| `src/app/api/campaigns/[id]/send/route.ts` | Create | Bulk QR + dispatch |
| `src/proxy.ts` | Create | Auth gate for `/scan`, `/admin/*`, `/api/campaigns/*` |
| `src/app/(auth)/login/page.tsx` | Create | Email+password sign-in, redirect by role |
| `src/app/(dev)/dev/preview/[campaignId]/page.tsx` | Create | Dev QR grid (notFound in production) |
| `src/components/QrScanner.tsx` | Create | Camera QR decoder client component |
| `src/app/scan/page.tsx` | Create | Scanner page — calls verify, shows result overlay |
| `tests/lib/twilio.test.ts` | Create | Unit tests for twilio helper |
| `tests/api/verify.test.ts` | Create | Unit tests for verify route |
| `tests/api/send.test.ts` | Create | Unit tests for send route |

---

## Task 1: Install packages and update env template

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `.env.local.example`

- [ ] **Step 1: Install runtime packages**

```bash
npm install twilio @zxing/browser @zxing/library
```

Expected: packages added to `node_modules/`, `package-lock.json` updated.

- [ ] **Step 2: Install type declarations**

```bash
npm install --save-dev @types/twilio 2>/dev/null; true
```

(Twilio ships its own types — this may be a no-op. Either way is fine.)

- [ ] **Step 3: Update .env.local.example**

Open `.env.local.example` and add two lines after `TWILIO_PHONE_NUMBER=`:

```
# Set to true locally to skip Twilio and use the dev preview page instead
TWILIO_MOCK=true
```

Also add `TWILIO_MOCK=true` to your local `.env.local`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.local.example
git commit -m "chore: install twilio and @zxing/browser packages"
```

---

## Task 2: Twilio helper with mock mode

**Files:**
- Create: `src/lib/twilio.ts`
- Create: `tests/lib/twilio.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/twilio.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'

const mockCreate = vi.fn().mockResolvedValue({ sid: 'SM_real_123' })

vi.mock('twilio', () => ({
  default: vi.fn(() => ({ messages: { create: mockCreate } })),
}))

describe('sendGiftMMS', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('returns mock sid and skips Twilio when TWILIO_MOCK=true', async () => {
    vi.stubEnv('TWILIO_MOCK', 'true')
    const { sendGiftMMS } = await import('@/lib/twilio')
    const result = await sendGiftMMS({
      to: '+972501234567',
      employeeName: 'Omer',
      holidayName: 'Passover',
      qrImageUrl: 'https://example.com/qr.png',
    })
    expect(result.sid).toBe('mock')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('calls Twilio and returns real sid when TWILIO_MOCK is not set', async () => {
    vi.stubEnv('TWILIO_MOCK', '')
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest')
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'auth_token')
    vi.stubEnv('TWILIO_PHONE_NUMBER', '+1234567890')
    const { sendGiftMMS } = await import('@/lib/twilio')
    const result = await sendGiftMMS({
      to: '+972501234567',
      employeeName: 'Omer',
      holidayName: 'Passover',
      qrImageUrl: 'https://example.com/qr.png',
    })
    expect(result.sid).toBe('SM_real_123')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '+972501234567',
        body: expect.stringContaining('Omer'),
        mediaUrl: ['https://example.com/qr.png'],
      })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lib/twilio.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/twilio'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/twilio.ts`:

```ts
import twilio from 'twilio'

export async function sendGiftMMS(params: {
  to: string
  employeeName: string
  holidayName: string
  qrImageUrl: string
}): Promise<{ sid: string }> {
  if (process.env.TWILIO_MOCK === 'true') {
    console.log(`[MOCK SMS] To: ${params.to} | Employee: ${params.employeeName}`)
    return { sid: 'mock' }
  }

  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  )

  const message = await client.messages.create({
    from: process.env.TWILIO_PHONE_NUMBER!,
    to: params.to,
    body: `Hi ${params.employeeName}, your ${params.holidayName} gift is ready. Show this QR code to collect it.`,
    mediaUrl: [params.qrImageUrl],
  })

  return { sid: message.sid }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/lib/twilio.test.ts
```

Expected: PASS — 2 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/twilio.ts tests/lib/twilio.test.ts
git commit -m "feat: add Twilio MMS helper with TWILIO_MOCK dev bypass"
```

---

## Task 3: `POST /api/verify/[token]` — atomic redemption

**Files:**
- Create: `src/app/api/verify/[token]/route.ts`
- Create: `tests/api/verify.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/api/verify.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Two mock functions for the two Supabase query shapes used by the verify route.
// mockUpdateSingle: used by the atomic UPDATE chain
// mockSelectSingle: used by the fallback SELECT chain
const mockUpdateSingle = vi.fn()
const mockSelectSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({ single: mockUpdateSingle }),
          }),
        }),
      }),
      select: () => ({
        eq: () => ({ single: mockSelectSingle }),
      }),
    }),
  }),
}))

function makeRequest(token: string, distributorId: string | null = null) {
  return new NextRequest(`http://localhost/api/verify/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ distributorId }),
  })
}

describe('POST /api/verify/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns valid:true and employee name on first successful scan', async () => {
    mockUpdateSingle.mockResolvedValue({ data: { employee_name: 'Omer Melamed' }, error: null })

    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(
      makeRequest('valid-token-uuid'),
      { params: Promise.resolve({ token: 'valid-token-uuid' }) }
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.valid).toBe(true)
    expect(body.employeeName).toBe('Omer Melamed')
  })

  it('returns already_used when token was already redeemed', async () => {
    // UPDATE returns null (no unredeemed row matched)
    mockUpdateSingle.mockResolvedValue({ data: null, error: { message: 'no row' } })
    // SELECT finds the token (it exists but redeemed=true)
    mockSelectSingle.mockResolvedValue({
      data: { employee_name: 'Dana Cohen', redeemed: true },
      error: null,
    })

    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(
      makeRequest('used-token-uuid'),
      { params: Promise.resolve({ token: 'used-token-uuid' }) }
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('already_used')
    expect(body.employeeName).toBe('Dana Cohen')
  })

  it('returns invalid when token does not exist in DB', async () => {
    mockUpdateSingle.mockResolvedValue({ data: null, error: { message: 'no row' } })
    mockSelectSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(
      makeRequest('nonexistent-token'),
      { params: Promise.resolve({ token: 'nonexistent-token' }) }
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('invalid')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/api/verify.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/verify/[token]/route'`

- [ ] **Step 3: Write the implementation**

Create directory: `src/app/api/verify/[token]/`

Create `src/app/api/verify/[token]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = await request.json().catch(() => ({}))
  const distributorId: string | null = body.distributorId ?? null

  const supabase = createServiceClient()

  // Atomic write: first writer wins, second writer gets 0 rows back
  const { data: redeemed } = await supabase
    .from('gift_tokens')
    .update({
      redeemed: true,
      redeemed_at: new Date().toISOString(),
      redeemed_by: distributorId,
    })
    .eq('token', token)
    .eq('redeemed', false)
    .select('employee_name')
    .single()

  if (redeemed) {
    return NextResponse.json({ valid: true, employeeName: redeemed.employee_name })
  }

  // UPDATE hit 0 rows — find out whether the token exists at all
  const { data: existing } = await supabase
    .from('gift_tokens')
    .select('employee_name, redeemed')
    .eq('token', token)
    .single()

  if (!existing) {
    return NextResponse.json({ valid: false, reason: 'invalid' })
  }

  return NextResponse.json({
    valid: false,
    reason: 'already_used',
    employeeName: existing.employee_name,
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/api/verify.test.ts
```

Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/app/api/verify tests/api/verify.test.ts
git commit -m "feat: add atomic POST /api/verify/[token] endpoint"
```

---

## Task 4: `POST /api/campaigns/[id]/send` — bulk dispatch

**Files:**
- Create: `src/app/api/campaigns/[id]/send/route.ts`
- Create: `tests/api/send.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/api/send.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()
const mockUpload = vi.fn()
const mockGetPublicUrl = vi.fn()
const mockSendGiftMMS = vi.fn().mockResolvedValue({ sid: 'mock' })

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
  createServiceClient: () => ({
    from: mockFromService,
    storage: {
      from: () => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
  }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['campaigns:launch']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/twilio', () => ({
  sendGiftMMS: mockSendGiftMMS,
}))

vi.mock('@/lib/qr', () => ({
  generateQrBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
}))

function makeRequest(campaignId: string) {
  return new NextRequest(`http://localhost/api/campaigns/${campaignId}/send`, {
    method: 'POST',
  })
}

describe('POST /api/campaigns/[id]/send', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('TWILIO_MOCK', 'true')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000')

    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          app_metadata: {
            company_id: 'company-1',
            role_id: 'role-1',
            role_name: 'company_admin',
          },
        },
      },
    })

    mockUpload.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://example.com/qr/token-1.png' },
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const { POST } = await import('@/app/api/campaigns/[id]/send/route')
    const res = await POST(makeRequest('campaign-1'), {
      params: Promise.resolve({ id: 'campaign-1' }),
    })

    expect(res.status).toBe(401)
  })

  it('returns 403 when user lacks campaigns:launch permission', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)

    const { POST } = await import('@/app/api/campaigns/[id]/send/route')
    const res = await POST(makeRequest('campaign-1'), {
      params: Promise.resolve({ id: 'campaign-1' }),
    })

    expect(res.status).toBe(403)
  })

  it('returns 404 when campaign not found', async () => {
    mockFromService.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: { message: 'not found' } }),
          }),
        }),
      }),
    })

    const { POST } = await import('@/app/api/campaigns/[id]/send/route')
    const res = await POST(makeRequest('bad-campaign'), {
      params: Promise.resolve({ id: 'bad-campaign' }),
    })

    expect(res.status).toBe(404)
  })

  it('dispatches tokens in mock mode and returns devPreviewUrl', async () => {
    let fromCallCount = 0
    mockFromService.mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) {
        // Campaign lookup
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: 'campaign-1', name: 'Passover 2026', company_id: 'company-1' },
                    error: null,
                  }),
              }),
            }),
          }),
        }
      }
      if (fromCallCount === 2) {
        // Fetch unsent tokens
        return {
          select: () => ({
            eq: () => ({
              is: () =>
                Promise.resolve({
                  data: [
                    { id: 'token-row-1', token: 'uuid-1', employee_name: 'Omer', phone_number: '+972501234567', qr_image_url: null },
                  ],
                  error: null,
                }),
            }),
          }),
        }
      }
      // Subsequent calls: gift_tokens update (qr_image_url) + gift_tokens update (sms_sent_at) + campaigns update
      return {
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }
    })

    const { POST } = await import('@/app/api/campaigns/[id]/send/route')
    const res = await POST(makeRequest('campaign-1'), {
      params: Promise.resolve({ id: 'campaign-1' }),
    })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.dispatched).toBe(1)
    expect(body.failed).toBe(0)
    expect(body.devPreviewUrl).toBe('http://localhost:3000/dev/preview/campaign-1')
  })

  it('skips QR generation when qr_image_url already set on token', async () => {
    let fromCallCount = 0
    mockFromService.mockImplementation(() => {
      fromCallCount++
      if (fromCallCount === 1) {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: 'campaign-1', name: 'Passover 2026', company_id: 'company-1' },
                    error: null,
                  }),
              }),
            }),
          }),
        }
      }
      if (fromCallCount === 2) {
        return {
          select: () => ({
            eq: () => ({
              is: () =>
                Promise.resolve({
                  data: [
                    {
                      id: 'token-row-1',
                      token: 'uuid-1',
                      employee_name: 'Omer',
                      phone_number: '+972501234567',
                      qr_image_url: 'https://existing-url.com/qr.png',
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        }
      }
      return {
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      }
    })

    const { generateQrBuffer } = await import('@/lib/qr')

    const { POST } = await import('@/app/api/campaigns/[id]/send/route')
    await POST(makeRequest('campaign-1'), {
      params: Promise.resolve({ id: 'campaign-1' }),
    })

    expect(vi.mocked(generateQrBuffer)).not.toHaveBeenCalled()
    expect(mockUpload).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/api/send.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/campaigns/[id]/send/route'`

- [ ] **Step 3: Write the implementation**

Create directory: `src/app/api/campaigns/[id]/send/`

Create `src/app/api/campaigns/[id]/send/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { sendGiftMMS } from '@/lib/twilio'
import { generateQrBuffer } from '@/lib/qr'
import type { JwtAppMetadata } from '@/types'

const BATCH_SIZE = 50
const DELAY_MS = 1000

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'campaigns:launch')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: campaign, error: campaignError } = await service
    .from('campaigns')
    .select('id, name, company_id')
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const { data: tokens, error: tokensError } = await service
    .from('gift_tokens')
    .select('id, token, employee_name, phone_number, qr_image_url')
    .eq('campaign_id', campaignId)
    .is('sms_sent_at', null)

  if (tokensError || !tokens) {
    return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 })
  }

  let dispatched = 0
  let failed = 0

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (token) => {
        let qrImageUrl = token.qr_image_url

        if (!qrImageUrl) {
          const buf = await generateQrBuffer(token.token)
          const filePath = `${campaignId}/${token.token}.png`
          const { error: uploadError } = await service.storage
            .from('qr-codes')
            .upload(filePath, buf, { contentType: 'image/png', upsert: true })
          if (uploadError) throw new Error(uploadError.message)
          const { data: { publicUrl } } = service.storage
            .from('qr-codes')
            .getPublicUrl(filePath)
          qrImageUrl = publicUrl
          await service
            .from('gift_tokens')
            .update({ qr_image_url: qrImageUrl })
            .eq('id', token.id)
        }

        await sendGiftMMS({
          to: token.phone_number,
          employeeName: token.employee_name,
          holidayName: campaign.name,
          qrImageUrl,
        })

        await service
          .from('gift_tokens')
          .update({ sms_sent_at: new Date().toISOString() })
          .eq('id', token.id)
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled') dispatched++
      else {
        failed++
        console.error('[send] token failed:', result.reason)
      }
    }

    if (i + BATCH_SIZE < tokens.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS))
    }
  }

  await service
    .from('campaigns')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', campaignId)

  const devPreviewUrl =
    process.env.TWILIO_MOCK === 'true'
      ? `${process.env.NEXT_PUBLIC_APP_URL}/dev/preview/${campaignId}`
      : undefined

  return NextResponse.json({ dispatched, failed, campaignId, devPreviewUrl })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/api/send.test.ts
```

Expected: PASS — 5 tests

- [ ] **Step 5: Run all tests to check for regressions**

```bash
npm test
```

Expected: all 17 Phase 1 tests + 3 verify tests + 5 send tests + 2 twilio tests = 27 tests passing

- [ ] **Step 6: Commit**

```bash
git add src/app/api/campaigns tests/api/send.test.ts
git commit -m "feat: add POST /api/campaigns/[id]/send with mock dev mode"
```

---

## Task 5: Auth proxy (`src/proxy.ts`)

**Files:**
- Create: `src/proxy.ts`

> **Next.js 16 note:** `middleware.ts` is deprecated. The file is now `proxy.ts` and the exported function is named `proxy` (not `middleware`). Same cookie/session pattern as before via `@supabase/ssr`.

- [ ] **Step 1: Create `src/proxy.ts`**

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let proxyResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          proxyResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            proxyResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  if (!user) {
    if (pathname.startsWith('/api/campaigns')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (pathname.startsWith('/scan') || pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return proxyResponse
}

export const config = {
  matcher: ['/scan', '/admin/:path*', '/api/campaigns/:path*'],
}
```

- [ ] **Step 2: Verify the dev server still starts**

```bash
npm run dev
```

Expected: server starts on port 3000 with no TypeScript errors in terminal.

- [ ] **Step 3: Test auth redirect manually**

Open `http://localhost:3000/scan` in your browser.
Expected: redirects to `http://localhost:3000/login`.

- [ ] **Step 4: Commit**

```bash
git add src/proxy.ts
git commit -m "feat: add auth proxy protecting /scan and /admin/* routes"
```

---

## Task 6: Login page (`/login`)

**Files:**
- Create: `src/app/(auth)/login/page.tsx`

The `(auth)` is a route group — it doesn't appear in the URL. The page lives at `/login`.

- [ ] **Step 1: Create the login page**

Create directory: `src/app/(auth)/login/`

Create `src/app/(auth)/login/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import type { JwtAppMetadata } from '@/types'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError || !data.user) {
      setError(authError?.message ?? 'Sign in failed')
      setLoading(false)
      return
    }

    const meta = data.user.app_metadata as JwtAppMetadata | undefined
    if (meta?.role_name === 'scanner') {
      router.push('/scan')
    } else {
      router.push('/admin')
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 w-full max-w-sm bg-white rounded-xl shadow p-8"
      >
        <h1 className="text-2xl font-bold">Sign in</h1>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />

        <button
          type="submit"
          disabled={loading}
          className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-gray-800 transition-colors"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 2: Verify the login page renders**

Open `http://localhost:3000/login` in the browser.
Expected: a centered sign-in form with email and password fields.

- [ ] **Step 3: Run tests to check for regressions**

```bash
npm test
```

Expected: all 27 tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/'(auth)'
git commit -m "feat: add /login page with Supabase email+password auth"
```

---

## Task 7: Dev preview page (`/dev/preview/[campaignId]`)

**Files:**
- Create: `src/app/(dev)/dev/preview/[campaignId]/page.tsx`

The `(dev)` route group organises dev-only pages without affecting the URL. The page lives at `/dev/preview/[campaignId]`.

- [ ] **Step 1: Create the dev preview page**

Create directory: `src/app/(dev)/dev/preview/[campaignId]/`

Create `src/app/(dev)/dev/preview/[campaignId]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'

export default async function DevPreviewPage({
  params,
}: {
  params: Promise<{ campaignId: string }>
}) {
  if (process.env.NODE_ENV === 'production') notFound()

  const { campaignId } = await params
  const supabase = createServiceClient()

  const { data: tokens } = await supabase
    .from('gift_tokens')
    .select('id, employee_name, phone_number, qr_image_url, token')
    .eq('campaign_id', campaignId)
    .order('employee_name')

  if (!tokens || tokens.length === 0) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold mb-2">Dev Preview</h1>
        <p className="text-gray-500">No tokens found for campaign {campaignId}</p>
      </main>
    )
  }

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-1">Dev Preview</h1>
      <p className="text-gray-500 mb-8 text-sm">
        {tokens.length} tokens · Campaign {campaignId}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {tokens.map((t) => (
          <div
            key={t.id}
            className="border rounded-xl p-4 flex flex-col items-center gap-3 bg-white shadow-sm"
          >
            <p className="font-semibold">{t.employee_name}</p>
            <p className="text-xs text-gray-400">{t.phone_number}</p>
            {t.qr_image_url ? (
              <img
                src={t.qr_image_url}
                alt={`QR for ${t.employee_name}`}
                width={160}
                height={160}
                className="rounded"
              />
            ) : (
              <div className="w-40 h-40 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-400">
                QR pending
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Run tests to check for regressions**

```bash
npm test
```

Expected: all 27 tests still pass.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dev)"
git commit -m "feat: add /dev/preview/[campaignId] QR grid page (dev-only)"
```

---

## Task 8: QR Scanner component + `/scan` page

**Files:**
- Create: `src/components/QrScanner.tsx`
- Create: `src/app/scan/page.tsx`

- [ ] **Step 1: Create the QrScanner client component**

Create directory: `src/components/`

Create `src/components/QrScanner.tsx`:

```tsx
'use client'

import { useEffect, useRef } from 'react'

type Props = {
  onResult: (text: string) => void
  active: boolean
}

export function QrScanner({ onResult, active }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onResultRef = useRef(onResult)
  onResultRef.current = onResult

  useEffect(() => {
    if (!active || !videoRef.current) return

    let stopped = false
    let stopControls: (() => void) | null = null

    async function startScanner() {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      if (stopped) return
      const reader = new BrowserMultiFormatReader()
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current!,
        (result) => {
          if (result) onResultRef.current(result.getText())
        }
      )
      stopControls = () => controls.stop()
    }

    startScanner().catch(console.error)

    return () => {
      stopped = true
      stopControls?.()
    }
  }, [active])

  return (
    <video
      ref={videoRef}
      className="w-full h-full object-cover"
      playsInline
      muted
    />
  )
}
```

- [ ] **Step 2: Create the scan page**

Create `src/app/scan/page.tsx`:

```tsx
'use client'

import { useState, useCallback } from 'react'
import { QrScanner } from '@/components/QrScanner'
import type { TokenVerifyResult } from '@/types'

type ScanState = 'scanning' | 'loading' | 'result'

const RESULT_DISPLAY_MS = 3000
const TOKEN_PATTERN = /\/verify\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

export default function ScanPage() {
  const [scanState, setScanState] = useState<ScanState>('scanning')
  const [result, setResult] = useState<TokenVerifyResult | null>(null)

  const handleScan = useCallback(
    async (text: string) => {
      if (scanState !== 'scanning') return
      setScanState('loading')

      const match = text.match(TOKEN_PATTERN)
      if (!match) {
        setResult({ valid: false, reason: 'invalid' })
        setScanState('result')
        setTimeout(() => { setResult(null); setScanState('scanning') }, RESULT_DISPLAY_MS)
        return
      }

      const token = match[1]
      try {
        const res = await fetch(`/api/verify/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ distributorId: null }),
        })
        const data: TokenVerifyResult = await res.json()
        setResult(data)
      } catch {
        setResult({ valid: false, reason: 'invalid' })
      }

      setScanState('result')
      setTimeout(() => { setResult(null); setScanState('scanning') }, RESULT_DISPLAY_MS)
    },
    [scanState]
  )

  return (
    <main className="flex flex-col min-h-screen bg-black overflow-hidden">
      <div className="relative flex-1">
        <QrScanner onResult={handleScan} active={scanState === 'scanning'} />

        {scanState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <p className="text-white text-xl font-medium">Checking…</p>
          </div>
        )}

        {scanState === 'result' && result && (
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center gap-4 ${
              result.valid ? 'bg-green-600/95' : 'bg-red-600/95'
            }`}
          >
            <span className="text-7xl">{result.valid ? '✓' : '✗'}</span>

            {result.valid ? (
              <>
                <p className="text-white text-3xl font-bold">{result.employeeName}</p>
                <p className="text-white/80 text-lg">Gift collected</p>
              </>
            ) : result.reason === 'already_used' ? (
              <>
                <p className="text-white text-2xl font-bold">Already claimed</p>
                <p className="text-white/80 text-lg">{result.employeeName}</p>
              </>
            ) : (
              <p className="text-white text-2xl font-bold">Invalid QR code</p>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all 27 tests pass (no tests for UI components — camera access requires a real browser).

- [ ] **Step 4: Verify the scan page loads**

Ensure the dev server is running (`npm run dev`), then open `http://localhost:3000/scan`.
Expected: redirected to `/login` (because not authenticated yet).

- [ ] **Step 5: Commit**

```bash
git add src/components/QrScanner.tsx src/app/scan
git commit -m "feat: add /scan page with camera QR reader and result overlay"
```

---

## Task 9: Manual verification

> These steps require real Supabase data and cannot be automated in Vitest.

- [ ] **Step 1: Apply migrations in Supabase SQL Editor**

If not done in Phase 1: run `supabase/migrations/001_initial_schema.sql` through `004_storage_bucket.sql` in the Supabase SQL Editor in order.

- [ ] **Step 2: Create test users**

In Supabase → Auth → Users, create:
- `scanner@test.com` (password: `testpass123`)
- `admin@test.com` (password: `testpass123`)

- [ ] **Step 3: Set app_metadata for test users**

In Supabase SQL Editor, run (replace UUIDs from the actual companies/roles rows):

```sql
-- First, check the IDs you need:
SELECT id, name FROM companies LIMIT 5;
SELECT id, name FROM roles WHERE name IN ('scanner', 'company_admin') LIMIT 10;

-- Then set metadata (replace the UUIDs):
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
  'company_id', '<your-company-uuid>',
  'role_id', '<scanner-role-uuid>',
  'role_name', 'scanner'
)
WHERE email = 'scanner@test.com';

UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
  'company_id', '<your-company-uuid>',
  'role_id', '<company-admin-role-uuid>',
  'role_name', 'company_admin'
)
WHERE email = 'admin@test.com';
```

- [ ] **Step 4: Test login flow**

1. Open `http://localhost:3000/login`
2. Sign in as `scanner@test.com` → should redirect to `/scan`
3. Sign out (clear cookies), sign in as `admin@test.com` → should redirect to `/admin` (404 expected — not built yet)

- [ ] **Step 5: Test the send + dev preview flow**

Insert a test campaign and token in Supabase SQL Editor:

```sql
INSERT INTO campaigns (company_id, name)
VALUES ('<your-company-uuid>', 'Test Passover 2026')
RETURNING id;

-- Use the returned campaign id:
INSERT INTO gift_tokens (campaign_id, employee_name, phone_number)
VALUES ('<campaign-id>', 'Test Employee', '+972501234567');
```

Then call the send API (replace the campaign id):

```bash
# First, get a valid session cookie by logging in via the browser, then:
curl -X POST http://localhost:3000/api/campaigns/<campaign-id>/send \
  -H "Cookie: <your-session-cookie>"
```

Expected response: `{ "dispatched": 1, "failed": 0, "devPreviewUrl": "http://localhost:3000/dev/preview/<campaign-id>" }`

Open the `devPreviewUrl` — expected: QR code image rendered for "Test Employee".

- [ ] **Step 6: Test QR scan on mobile**

1. On your computer, note the local network URL shown by `npm run dev` (e.g. `http://192.168.68.107:3000`)
2. On your phone (same WiFi), open that URL and navigate to `/login`
3. Sign in as `scanner@test.com` → arrives at `/scan`
4. Allow camera access
5. Point camera at the QR image shown in the dev preview page
6. Expected: green overlay with "Test Employee" and "Gift collected"
7. Scan again → expected: red overlay with "Already claimed"
