# GiftFlow Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare `/` → `/login` redirect with a bilingual (EN/HE, RTL-aware) marketing landing page that captures leads into a new `leads` table via `POST /api/leads`, with optional Resend email notification.

**Architecture:** One public page at `src/app/page.tsx` composing client components in `src/components/landing/`. One new unauthenticated API route using the existing service-role client, rate limiter, and honeypot spam protection. One migration adding an RLS-locked `leads` table. The proxy middleware gets an exact-match exemption for `/`.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4, Supabase (service role), Vitest 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-05-landing-page-design.md`

## Global Constraints

- i18n convention: **the English string is the translation key.** `useT()` returns the key in EN and `he[key]` in HE (`src/lib/i18n/useT.ts`).
- **Before adding any key to `src/lib/i18n/translations.he.ts`, grep for it first** (`grep -n "'<key>'" src/lib/i18n/translations.he.ts`). Duplicate keys have broken the Vercel build before (commit cf3ff22). If a key exists, reuse it — do not re-add.
- RTL: use logical Tailwind utilities (`start-*`/`end-*`/`ms-*`/`me-*`, `rtl:` variant) — never `left`/`right` physical values in new landing code.
- Service-role key stays server-side only (`createServiceClient` from `src/lib/supabase/server.ts`, imported only in the API route).
- Never log lead PII beyond error messages; never log tokens.
- The global floating `LanguageToggle` is already rendered by the root layout — do not add a second toggle.
- Brand utilities `.bg-brand` / `.text-brand` / `.hover-brand` (from `globals.css`, `--brand: #6366f1`) are available.
- Commit after every task. **Do not push** — the user reviews locally first.

## Design tokens (from frontend-design pass)

- **Palette:** white `#ffffff` base, `zinc-50` section wash, `zinc-900` ink, brand indigo `#6366f1`, deep band `indigo-950` (`#1e1b4b`) for the contact section, `emerald-500` only for the "Live" pulse.
- **Type:** Space Grotesk (new, EN display headlines only, weights 500/700) via a `.font-display` utility; Inter body; Heebo replaces the display face under `:lang(he)`.
- **Signature:** the QR finder-pattern glyph (`QrMark`) as eyebrow/logo mark, and a hero mockup of SMS-with-QR being scanned (reuses the existing `.animate-scan-line` keyframe) with a floating live-dashboard card.
- **Motion:** scan-line sweep + pulsing live dot only, both wrapped in `motion-reduce:hidden`.

---

### Task 1: `leads` table migration

**Files:**
- Create: `supabase/migrations/20240705000034_leads.sql`

**Interfaces:**
- Produces: table `public.leads` (columns below) that Task 2's route inserts into via the service role.

- [ ] **Step 1: Write the migration**

```sql
-- Landing-page contact-form leads.
-- RLS is enabled with NO policies on purpose: anon and authenticated roles get
-- zero access. Only the service-role key (server-side /api/leads route) writes,
-- and the service role bypasses RLS.
CREATE TABLE leads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name       TEXT NOT NULL,
  company    TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  message    TEXT,
  locale     TEXT,
  status     TEXT NOT NULL DEFAULT 'new'
);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE INDEX leads_created_idx ON leads (created_at DESC);
```

- [ ] **Step 2: Sanity-check ordering**

Run: `ls supabase/migrations | tail -3`
Expected: `20240705000034_leads.sql` sorts last (after `20240701000033_campaign_wizard_step.sql`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20240705000034_leads.sql
git commit -m "feat(db): add RLS-locked leads table for landing page contact form"
```

---

### Task 2: `POST /api/leads` route (TDD)

**Files:**
- Test: `tests/api/leads.test.ts`
- Create: `src/app/api/leads/route.ts`

**Interfaces:**
- Consumes: `leads` table (Task 1); `rateLimit`/`clientIp` from `src/lib/rate-limit.ts`; `createServiceClient` from `src/lib/supabase/server.ts`.
- Produces: `POST /api/leads` accepting JSON `{ name, company, email, phone?, message?, website?, locale? }`; responses `200 {ok:true}`, `400 {error:'invalid_input'}`, `429 {error:'too_many_requests'}`, `500 {error:'server_error'}`. Task 6's form and Task 7's e2e depend on exactly these shapes.
- Env (all optional): `RESEND_API_KEY`, `LEADS_NOTIFY_EMAIL`, `LEADS_FROM_EMAIL`. Email only sent when the first two are set; failures never affect the response.

- [ ] **Step 1: Write the failing tests**

`tests/api/leads.test.ts` — follows the project's mock pattern (see `tests/api/gift-rsvp.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockInsert = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({ from: () => ({ insert: mockInsert }) }),
}))

const mockRateLimit = vi.fn(() => ({ ok: true, retryAfter: 0 }))
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: (...args: unknown[]) => mockRateLimit(...args),
  clientIp: () => '1.2.3.4',
}))

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validLead = {
  name: 'Dana Levi',
  company: 'Acme',
  email: 'dana@acme.co.il',
  phone: '050-1234567',
  message: 'We have 500 employees',
  locale: 'he',
}

describe('POST /api/leads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimit.mockReturnValue({ ok: true, retryAfter: 0 })
    mockInsert.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('429 when rate limited, without touching the database', async () => {
    mockRateLimit.mockReturnValue({ ok: false, retryAfter: 30 })
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest(validLead))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('400 when a required field is missing', async () => {
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest({ ...validLead, company: '' }))
    expect(res.status).toBe(400)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('400 when the email is malformed', async () => {
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest({ ...validLead, email: 'not-an-email' }))
    expect(res.status).toBe(400)
  })

  it('400 when a field exceeds its length cap', async () => {
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest({ ...validLead, name: 'x'.repeat(121) }))
    expect(res.status).toBe(400)
  })

  it('answers success-shaped on honeypot without storing anything', async () => {
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest({ ...validLead, website: 'http://spam.example' }))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('stores a valid lead and returns ok without emailing when unconfigured', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest(validLead))
    expect(res.status).toBe(200)
    expect(mockInsert).toHaveBeenCalledWith({
      name: 'Dana Levi',
      company: 'Acme',
      email: 'dana@acme.co.il',
      phone: '050-1234567',
      message: 'We have 500 employees',
      locale: 'he',
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('normalizes empty optional fields to null and unknown locale to en', async () => {
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest({ name: 'A', company: 'B', email: 'a@b.co', phone: '', message: '  ', locale: 'fr' }))
    expect(res.status).toBe(200)
    expect(mockInsert).toHaveBeenCalledWith({
      name: 'A', company: 'B', email: 'a@b.co', phone: null, message: null, locale: 'en',
    })
  })

  it('500 when the insert fails', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'boom' } })
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest(validLead))
    expect(res.status).toBe(500)
  })

  it('sends the notification email when Resend is configured', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('LEADS_NOTIFY_EMAIL', 'omer.melamed@gmail.com')
    const mockFetch = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', mockFetch)
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest(validLead))
    expect(res.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('still returns ok when the notification email fails', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('LEADS_NOTIFY_EMAIL', 'omer.melamed@gmail.com')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('resend down')))
    const { POST } = await import('@/app/api/leads/route')
    const res = await POST(makeRequest(validLead))
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/api/leads.test.ts`
Expected: FAIL — cannot resolve `@/app/api/leads/route`.

- [ ] **Step 3: Implement the route**

`src/app/api/leads/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'

const MAX = { name: 120, company: 120, email: 254, phone: 32, message: 2000 }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Returns the trimmed string, or null when it isn't a string / exceeds max.
function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.length > max ? null : s
}

export async function POST(request: NextRequest) {
  // Public, unauthenticated endpoint — rate-limit to curb form spam.
  const rl = rateLimit(`leads:${clientIp(request)}`, 5, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'too_many_requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    )
  }

  const body = await request.json().catch(() => ({}))

  // Honeypot: real users never see this field. Answer success-shaped so bots
  // learn nothing from the response.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ ok: true })
  }

  const name = str(body.name, MAX.name)
  const company = str(body.company, MAX.company)
  const email = str(body.email, MAX.email)
  const phone = str(body.phone ?? '', MAX.phone)
  const message = str(body.message ?? '', MAX.message)
  const locale = body.locale === 'he' ? 'he' : 'en'

  if (!name || !company || !email || phone === null || message === null || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service.from('leads').insert({
    name,
    company,
    email,
    phone: phone || null,
    message: message || null,
    locale,
  })
  if (error) {
    console.error('leads insert failed:', error.message)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }

  // The lead is stored — notification failures must never fail the request.
  try {
    await notifyByEmail({ name, company, email, phone, message })
  } catch (e) {
    console.error('lead email notification failed:', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ ok: true })
}

async function notifyByEmail(lead: {
  name: string
  company: string
  email: string
  phone: string
  message: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.LEADS_NOTIFY_EMAIL
  if (!apiKey || !to) return

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.LEADS_FROM_EMAIL ?? 'GiftFlow <onboarding@resend.dev>',
      to: [to],
      subject: `New GiftFlow lead: ${lead.name} (${lead.company})`,
      text: [
        `Name: ${lead.name}`,
        `Company: ${lead.company}`,
        `Email: ${lead.email}`,
        lead.phone && `Phone: ${lead.phone}`,
        lead.message && `\n${lead.message}`,
      ]
        .filter(Boolean)
        .join('\n'),
    }),
  })
  if (!res.ok) throw new Error(`Resend responded ${res.status}`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/leads.test.ts`
Expected: 10 passed.

- [ ] **Step 5: Commit**

```bash
git add tests/api/leads.test.ts src/app/api/leads/route.ts
git commit -m "feat(api): add rate-limited, honeypot-protected POST /api/leads with optional Resend notification"
```

---

### Task 3: Make `/` public in the proxy

**Files:**
- Modify: `src/proxy.ts:12-15`

**Interfaces:**
- Produces: unauthenticated GET `/` passes through the middleware (today it redirects to `/login`). `/api/*` is already excluded by the matcher, so `/api/leads` needs nothing.

- [ ] **Step 1: Add an exact-match pass-through**

In `src/proxy.ts`, immediately before the `PUBLIC_PREFIXES` check inside `proxy()`:

```ts
  // The marketing landing page is public. Exact match — a '/' prefix would
  // open every route.
  if (pathname === '/') {
    return NextResponse.next()
  }
```

- [ ] **Step 2: Verify no other behavior changed**

Run: `npx vitest run tests`
Expected: full suite passes (no proxy tests exist; this confirms nothing else regressed).

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(landing): allow unauthenticated access to /"
```

---

### Task 4: Landing scaffold — page, nav, hero, mockup, footer

**Files:**
- Modify: `src/app/page.tsx` (replace redirect)
- Modify: `src/app/globals.css` (add `.font-display`)
- Create: `src/components/landing/LandingPage.tsx`
- Create: `src/components/landing/HeroMockup.tsx`
- Modify: `src/lib/i18n/translations.he.ts` (append landing keys)

**Interfaces:**
- Consumes: `useT` / `useLocale` from `src/lib/i18n`; `.animate-scan-line` keyframe from `globals.css`; brand utilities.
- Produces: `LandingPage` (default landing composition) with section anchors `#how-it-works`, `#why`, `#contact` that Tasks 5–6 fill; exported helpers `QrMark` and `Eyebrow` inside `LandingPage.tsx` used by later sections; `HeroMockup` component.

- [ ] **Step 1: Add the display-face utility to `globals.css`**

Append after the `:lang(he)` block:

```css
/* Landing display face: Space Grotesk for English headlines; Hebrew headlines
   fall back to Heebo so RTL pages keep one coherent voice. */
.font-display {
  font-family: var(--font-display, var(--font-inter)), sans-serif;
  letter-spacing: -0.01em;
}
:lang(he) .font-display {
  font-family: var(--font-heebo), sans-serif;
}
```

- [ ] **Step 2: Replace `src/app/page.tsx`**

```tsx
import type { Metadata } from 'next'
import { Space_Grotesk } from 'next/font/google'
import { LandingPage } from '@/components/landing/LandingPage'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'GiftFlow — employee gift distribution, scanned',
  description:
    'Send every employee a personal QR code by SMS, scan at the event, and track redemptions live.',
}

export default function Home() {
  return (
    <div className={spaceGrotesk.variable}>
      <LandingPage />
    </div>
  )
}
```

- [ ] **Step 3: Create `src/components/landing/HeroMockup.tsx`**

```tsx
'use client'

import { useT } from '@/lib/i18n/useT'

// Deterministic decorative "QR" — three finder patterns plus scattered modules.
const MODULES: Array<[number, number]> = [
  [8, 1], [9, 2], [8, 3], [10, 4], [4, 4], [5, 4], [4, 5], [6, 6], [5, 7],
  [9, 8], [10, 9], [8, 9], [4, 9], [5, 10], [2, 8], [1, 9], [6, 9], [9, 5],
  [10, 6], [6, 4], [4, 7], [7, 7],
]

function Finder({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="3" height="3" fill="currentColor" />
      <rect x={x + 0.6} y={y + 0.6} width="1.8" height="1.8" fill="white" />
      <rect x={x + 1.1} y={y + 1.1} width="0.8" height="0.8" fill="currentColor" />
    </g>
  )
}

function FakeQr() {
  return (
    <svg viewBox="0 0 11 11" className="h-24 w-24" aria-hidden="true">
      <Finder x={0} y={0} />
      <Finder x={8} y={0} />
      <Finder x={0} y={8} />
      {MODULES.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
      ))}
    </svg>
  )
}

export function HeroMockup() {
  const t = useT()
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
      {/* Phone showing the SMS every employee receives */}
      <div className="rounded-[2rem] border border-zinc-200 bg-white p-4 shadow-xl">
        <div className="rounded-2xl bg-zinc-50 p-4">
          <p className="text-xs font-medium text-zinc-400">GiftFlow</p>
          <div className="mt-2 rounded-2xl rounded-ss-sm bg-white p-4 shadow-sm">
            <p className="text-sm text-zinc-800">{t('Hi Dana! Your holiday gift is waiting 🎁')}</p>
            <p className="mt-1 text-sm text-zinc-500">{t('Show this code at the event:')}</p>
            <div className="relative mt-3 flex justify-center overflow-hidden py-2 text-zinc-900">
              <FakeQr />
              <div className="animate-scan-line absolute inset-x-6 top-1/2 h-0.5 rounded bg-brand/70 motion-reduce:hidden" />
            </div>
          </div>
        </div>
      </div>
      {/* Floating live-dashboard card — the HR side of the same moment */}
      <div className="absolute -bottom-6 -end-2 w-56 rounded-2xl border border-zinc-100 bg-white p-4 shadow-2xl sm:-end-8">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-500">{t('Holiday campaign')}</p>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {t('Live')}
          </span>
        </div>
        <p className="font-display mt-2 text-2xl font-bold">
          312<span className="text-base font-medium text-zinc-400"> / 500</span>
        </p>
        <p className="text-xs text-zinc-500">{t('gifts redeemed')}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full w-[62%] rounded-full bg-brand" />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `src/components/landing/LandingPage.tsx`** (nav + hero + footer; `#how-it-works`, `#why`, `#contact` sections are added by Tasks 5–6)

```tsx
'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useT } from '@/lib/i18n/useT'
import { HeroMockup } from './HeroMockup'

// The QR finder pattern — the square-in-square corner mark of every QR code —
// is the landing page's signature glyph.
export function QrMark({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-3 w-3 shrink-0 border-2 border-current p-[2px] ${className}`}
    >
      <span className="block h-full w-full bg-current" />
    </span>
  )
}

export function Eyebrow({
  children,
  className = 'text-brand',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-widest ${className}`}>
      <QrMark />
      {children}
    </p>
  )
}

export function LandingPage() {
  const t = useT()
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="sticky top-0 z-40 border-b border-zinc-100 bg-white/80 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#top" className="font-display flex items-center gap-2 text-lg font-bold tracking-tight">
            <QrMark className="text-brand" />
            GiftFlow
          </a>
          <div className="flex items-center gap-3 sm:gap-6">
            <a href="#how-it-works" className="hidden text-sm font-medium text-zinc-600 hover:text-zinc-900 sm:block">
              {t('How it works')}
            </a>
            <a href="#why" className="hidden text-sm font-medium text-zinc-600 hover:text-zinc-900 sm:block">
              {t('Why GiftFlow')}
            </a>
            <Link href="/login" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
              {t('Log in')}
            </Link>
            <a
              href="#contact"
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            >
              {t('Book a demo')}
            </a>
          </div>
        </nav>
      </header>

      <main id="top">
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div>
            <Eyebrow>{t('Employee gifting, scanned')}</Eyebrow>
            <h1 className="font-display mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
              {t('Gift day without the spreadsheet chaos')}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600">
              {t(
                'GiftFlow sends every employee a personal QR code by SMS. Your team scans at the event, and you watch redemptions live — no double handouts, no guesswork.'
              )}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <a
                href="#contact"
                className="rounded-full bg-brand px-6 py-3 text-base font-semibold text-white shadow-md transition-opacity hover:opacity-90"
              >
                {t('Book a demo')}
              </a>
              <a href="#how-it-works" className="text-base font-semibold text-zinc-700 hover:text-zinc-900">
                {t('See how it works')} <span className="inline-block rtl:rotate-180">→</span>
              </a>
            </div>
          </div>
          <HeroMockup />
        </section>

        {/* Tasks 5–6 insert #how-it-works, #why and #contact sections here */}
      </main>

      <footer className="border-t border-zinc-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <p className="font-display flex items-center gap-2 text-sm font-bold">
            <QrMark className="text-brand" />
            GiftFlow
          </p>
          <p className="text-sm text-zinc-500">{t('Employee gift distribution, scanned.')}</p>
          <div className="flex items-center gap-4 text-sm">
            <a href="#contact" className="text-zinc-600 hover:text-zinc-900">
              {t('Contact')}
            </a>
            <Link href="/login" className="text-zinc-600 hover:text-zinc-900">
              {t('Log in')}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
```

- [ ] **Step 5: Add Hebrew translations**

Grep each key first (Global Constraints). Expected pre-existing: `'Log in'`, possibly `'Live'` — reuse those. Append to `src/lib/i18n/translations.he.ts` (inside the `he` object, with a `// Landing page` comment header):

```ts
  // Landing page
  'Employee gifting, scanned': 'חלוקת מתנות לעובדים, בסריקה',
  'Gift day without the spreadsheet chaos': 'יום חלוקת מתנות בלי כאוס של אקסלים',
  'GiftFlow sends every employee a personal QR code by SMS. Your team scans at the event, and you watch redemptions live — no double handouts, no guesswork.':
    'GiftFlow שולחת לכל עובד קוד QR אישי ב-SMS. הצוות שלכם סורק באירוע, ואתם רואים את המימושים בזמן אמת — בלי חלוקות כפולות, בלי ניחושים.',
  'Book a demo': 'קבעו הדגמה',
  'See how it works': 'איך זה עובד',
  'How it works': 'איך זה עובד',
  'Why GiftFlow': 'למה GiftFlow',
  'Hi Dana! Your holiday gift is waiting 🎁': 'היי דנה! מתנת החג שלך מחכה 🎁',
  'Show this code at the event:': 'הציגו את הקוד הזה באירוע:',
  'Holiday campaign': 'קמפיין חג',
  'gifts redeemed': 'מתנות מומשו',
  'Employee gift distribution, scanned.': 'חלוקת מתנות לעובדים, בסריקה.',
  'Contact': 'צור קשר',
```

(Add `'Log in': 'התחברות'` and `'Live': 'חי'` ONLY if the greps show they don't already exist.)

- [ ] **Step 6: Verify it renders**

Run: `npm run build`
Expected: build succeeds. (Full visual check happens in Task 7.)

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx src/app/globals.css src/components/landing/ src/lib/i18n/translations.he.ts
git commit -m "feat(landing): replace login redirect with landing scaffold — nav, hero with SMS/QR mockup, footer"
```

---

### Task 5: How-it-works and Why-GiftFlow sections

**Files:**
- Modify: `src/components/landing/LandingPage.tsx` (replace the `{/* Tasks 5–6 insert ... */}` placeholder)
- Modify: `src/lib/i18n/translations.he.ts`

**Interfaces:**
- Consumes: `Eyebrow`, `QrMark` from Task 4.
- Produces: sections with anchors `#how-it-works` and `#why` (nav links from Task 4 resolve).

- [ ] **Step 1: Add the two sections** inside `<main>` after the hero section:

```tsx
        <section id="how-it-works" className="border-y border-zinc-100 bg-zinc-50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <Eyebrow>{t('How it works')}</Eyebrow>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight">
              {t('From employee list to gift day in three steps')}
            </h2>
            <ol className="mt-10 grid gap-6 lg:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title} className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
                  <p className="font-display text-sm font-bold text-brand">{i + 1}</p>
                  <h3 className="mt-2 text-lg font-semibold">{t(step.title)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{t(step.body)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="why" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <Eyebrow>{t('Why GiftFlow')}</Eyebrow>
          <h2 className="font-display mt-3 text-3xl font-bold tracking-tight">
            {t('Built for the day itself')}
          </h2>
          <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <QrMark className="text-brand" />
                  {t(f.title)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{t(f.body)}</p>
              </div>
            ))}
          </div>
        </section>
```

And at module scope (above `LandingPage`):

```tsx
const STEPS = [
  {
    title: 'Upload your employee list',
    body: 'A CSV file is all it takes — your campaign is ready in minutes.',
  },
  {
    title: 'Everyone gets a personal QR',
    body: 'Sent by SMS. Nothing to install, nothing to print.',
  },
  {
    title: 'Scan and watch it live',
    body: 'Each code redeems exactly once, and the dashboard updates as gifts are handed out.',
  },
]

const FEATURES = [
  {
    title: 'One scan, one gift',
    body: 'A code can never be redeemed twice — validation is atomic at the database level.',
  },
  {
    title: 'Live dashboard',
    body: 'See every redemption the moment it happens, from any device.',
  },
  {
    title: 'Nothing to install',
    body: 'Employees just open a text message. Scanners use any phone camera.',
  },
  {
    title: 'Scan as a team',
    body: 'The whole team can scan in parallel — everyone sees the same live state.',
  },
  {
    title: 'Hebrew and English',
    body: 'Full right-to-left support across the product, for employees and admins alike.',
  },
  {
    title: 'Per-campaign reports',
    body: 'Export exactly who picked up what, when, and who handed it out.',
  },
]
```

- [ ] **Step 2: Add Hebrew translations** (grep-first rule applies; `'How it works'` and `'Why GiftFlow'` were added in Task 4 — do not re-add):

```ts
  'From employee list to gift day in three steps': 'מרשימת עובדים ליום חלוקה בשלושה צעדים',
  'Upload your employee list': 'מעלים את רשימת העובדים',
  'A CSV file is all it takes — your campaign is ready in minutes.': 'קובץ CSV אחד וזהו — הקמפיין מוכן תוך דקות.',
  'Everyone gets a personal QR': 'כל עובד מקבל QR אישי',
  'Sent by SMS. Nothing to install, nothing to print.': 'נשלח ב-SMS. בלי להתקין כלום, בלי להדפיס כלום.',
  'Scan and watch it live': 'סורקים ורואים הכול בזמן אמת',
  'Each code redeems exactly once, and the dashboard updates as gifts are handed out.': 'כל קוד ממומש פעם אחת בדיוק, והדשבורד מתעדכן עם כל מתנה שנמסרת.',
  'Built for the day itself': 'נבנה בשביל היום עצמו',
  'One scan, one gift': 'סריקה אחת, מתנה אחת',
  'A code can never be redeemed twice — validation is atomic at the database level.': 'קוד לא יכול להיות ממומש פעמיים — האימות אטומי ברמת בסיס הנתונים.',
  'Live dashboard': 'דשבורד חי',
  'See every redemption the moment it happens, from any device.': 'רואים כל מימוש ברגע שהוא קורה, מכל מכשיר.',
  'Nothing to install': 'אין מה להתקין',
  'Employees just open a text message. Scanners use any phone camera.': 'העובדים פשוט פותחים הודעת SMS. הסורקים משתמשים במצלמה של כל טלפון.',
  'Scan as a team': 'סורקים כצוות',
  'The whole team can scan in parallel — everyone sees the same live state.': 'כל הצוות סורק במקביל — וכולם רואים את אותו מצב עדכני.',
  'Hebrew and English': 'עברית ואנגלית',
  'Full right-to-left support across the product, for employees and admins alike.': 'תמיכה מלאה בכיווניות ימין-לשמאל בכל המוצר, לעובדים ולמנהלים כאחד.',
  'Per-campaign reports': 'דוחות לכל קמפיין',
  'Export exactly who picked up what, when, and who handed it out.': 'ייצוא מדויק של מי קיבל מה, מתי, ומי מסר.',
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds (duplicate translation keys would fail here via lint/TS — they show up as object-literal duplicate warnings; also visually confirm no duplicates were added).

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/LandingPage.tsx src/lib/i18n/translations.he.ts
git commit -m "feat(landing): add how-it-works and why-giftflow sections"
```

---

### Task 6: Contact form and demo section

**Files:**
- Create: `src/components/landing/ContactForm.tsx`
- Modify: `src/components/landing/LandingPage.tsx` (add `#contact` section before `</main>`)
- Modify: `src/lib/i18n/translations.he.ts`

**Interfaces:**
- Consumes: `POST /api/leads` contract from Task 2 (JSON body, `res.ok` on success); `Eyebrow` from Task 4; `useLocale` for the `locale` field.
- Produces: `#contact` anchor (nav/footer links resolve); form labels used verbatim by Task 7's e2e: `Full name`, `Company`, `Work email`, button `Send`, success text `Thanks! We'll be in touch within one business day.`

- [ ] **Step 1: Create `src/components/landing/ContactForm.tsx`**

```tsx
'use client'

import { useState, type FormEvent } from 'react'
import { useT } from '@/lib/i18n/useT'
import { useLocale } from '@/lib/i18n/LanguageContext'

type Status = 'idle' | 'sending' | 'success' | 'error'

const inputClass =
  'w-full rounded-xl border border-indigo-800 bg-indigo-900/50 px-4 py-2.5 text-white placeholder:text-indigo-300/50 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40'

export function ContactForm() {
  const t = useT()
  const { locale } = useLocale()
  const [status, setStatus] = useState<Status>('idle')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (status === 'sending') return
    const data = new FormData(e.currentTarget)
    setStatus('sending')
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          company: data.get('company'),
          email: data.get('email'),
          phone: data.get('phone'),
          message: data.get('message'),
          website: data.get('website'),
          locale,
        }),
      })
      if (!res.ok) throw new Error(`leads responded ${res.status}`)
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-indigo-800 bg-indigo-900/50 p-10 text-center">
        <p className="text-lg font-medium">{t("Thanks! We'll be in touch within one business day.")}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="relative grid gap-4">
      {/* Honeypot — invisible to real users; the API drops submissions that fill it. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute h-0 w-0 overflow-hidden opacity-0"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-indigo-100">
          {t('Full name')}
          <input name="name" required maxLength={120} className={inputClass} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-indigo-100">
          {t('Company')}
          <input name="company" required maxLength={120} className={inputClass} />
        </label>
      </div>
      <label className="grid gap-1.5 text-sm font-medium text-indigo-100">
        {t('Work email')}
        <input type="email" name="email" required maxLength={254} className={inputClass} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-indigo-100">
        {t('Phone (optional)')}
        <input type="tel" name="phone" maxLength={32} className={inputClass} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-indigo-100">
        {t('Message (optional)')}
        <textarea name="message" rows={4} maxLength={2000} className={inputClass} />
      </label>
      {status === 'error' && (
        <p role="alert" className="text-sm font-medium text-rose-300">
          {t("Something went wrong. Your message wasn't sent — please try again.")}
        </p>
      )}
      <button
        type="submit"
        disabled={status === 'sending'}
        className="rounded-full bg-white px-6 py-3 text-base font-semibold text-indigo-950 transition-colors hover:bg-indigo-100 disabled:opacity-60"
      >
        {status === 'sending' ? t('Sending…') : t('Send')}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Add the contact section** in `LandingPage.tsx`, after `#why`, before `</main>` (and add `import { ContactForm } from './ContactForm'`):

```tsx
        <section id="contact" className="bg-indigo-950 text-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
            <div>
              <Eyebrow className="text-indigo-300">{t('Book a demo')}</Eyebrow>
              <h2 className="font-display mt-3 text-3xl font-bold tracking-tight">
                {t('See your next gift day in GiftFlow')}
              </h2>
              <p className="mt-4 max-w-md leading-relaxed text-indigo-200/90">
                {t("Tell us about your next gift day and we'll show you GiftFlow in action.")}
              </p>
            </div>
            <ContactForm />
          </div>
        </section>
```

- [ ] **Step 3: Add Hebrew translations** (grep-first; `'Book a demo'` exists from Task 4):

```ts
  'See your next gift day in GiftFlow': 'ככה ייראה יום חלוקת המתנות הבא שלכם',
  "Tell us about your next gift day and we'll show you GiftFlow in action.": 'ספרו לנו על יום חלוקת המתנות הבא שלכם ונראה לכם את GiftFlow בפעולה.',
  'Full name': 'שם מלא',
  'Company': 'חברה',
  'Work email': 'אימייל עבודה',
  'Phone (optional)': 'טלפון (לא חובה)',
  'Message (optional)': 'הודעה (לא חובה)',
  'Send': 'שליחה',
  'Sending…': 'שולח…',
  "Thanks! We'll be in touch within one business day.": 'תודה! נחזור אליכם תוך יום עסקים.',
  "Something went wrong. Your message wasn't sent — please try again.": 'משהו השתבש. ההודעה לא נשלחה — נסו שוב.',
```

(`'Company'`, `'Send'`, `'Full name'` may already exist — grep first, reuse if so.)

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/ContactForm.tsx src/components/landing/LandingPage.tsx src/lib/i18n/translations.he.ts
git commit -m "feat(landing): add book-a-demo contact section wired to /api/leads"
```

---

### Task 7: E2E test and full validation

**Files:**
- Create: `e2e/landing.spec.ts`

**Interfaces:**
- Consumes: form labels and success copy from Task 6, exactly as written there.

- [ ] **Step 1: Write the e2e test**

```ts
import { test, expect } from '@playwright/test'

test.describe('landing page', () => {
  test('renders the marketing page for anonymous visitors', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/') // no redirect to /login
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Gift day')
    await expect(page.getByRole('link', { name: 'Log in' }).first()).toBeVisible()
  })

  test('contact form submits and shows the success state', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel('Full name').fill('Playwright Test')
    await page.getByLabel('Company').fill('E2E Corp')
    await page.getByLabel('Work email').fill('e2e@example.com')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText("Thanks! We'll be in touch within one business day.")).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the full validation suite**

```bash
npm run lint        # expected: clean
npm run test        # expected: all vitest suites pass, incl. tests/api/leads.test.ts
npm run build       # expected: compiles, / listed as a static or dynamic route
```

- [ ] **Step 3: Run e2e if the local Supabase stack is available**

The e2e suite needs local Supabase (`node scripts/e2e-db.mjs` per `playwright.config.ts`) so the `leads` migration is applied. If Docker/local stack is unavailable, note it as deferred validation for the user.

Run: `npx playwright test e2e/landing.spec.ts`
Expected: 2 passed.

- [ ] **Step 4: Manual bilingual check**

Start `npm run dev`, open `/`: verify EN layout, toggle to HE via the floating button, verify RTL flips (nav order, hero arrow, dashboard card position) and Hebrew copy renders in Heebo.

- [ ] **Step 5: Commit**

```bash
git add e2e/landing.spec.ts
git commit -m "test(landing): e2e coverage for landing render and contact form submission"
```

---

## Post-plan notes

- **Env to configure later (Vercel + `.env.local`):** `RESEND_API_KEY`, `LEADS_NOTIFY_EMAIL` (e.g. omer.melamed@gmail.com), optional `LEADS_FROM_EMAIL` (defaults to `GiftFlow <onboarding@resend.dev>`). Until set, leads are stored but no email is sent.
- **Do not push** any of these commits; the user reviews first.
- Deferred: applying the migration to the remote Supabase project (user action or explicit approval).
