# UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign every user-facing screen of QR Gift Delivery to a Modern SaaS aesthetic (indigo/violet on white, dark icon-rail sidebar, two-column campaign detail, full-screen scanner takeover) without touching any API routes or backend logic.

**Architecture:** Pure UI layer change — Tailwind class updates, new layout components, and two behaviour fixes (launch confirmation modal replaces `window.confirm`, scanner tap-to-dismiss replaces auto-timer). All data fetching, API routes, and Supabase logic stay exactly as they are.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4 (CSS-first, `@import "tailwindcss"` + `@theme inline`), Inter font (already loaded).

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/app/globals.css` | Remove dark-mode body override, set Inter as body font |
| Modify | `src/app/layout.tsx` | Switch to Inter, update app title to "GiftFlow" |
| **Create** | `src/components/admin/Sidebar.tsx` | Collapsible icon-rail sidebar (CSS hover, no JS state) |
| Modify | `src/app/admin/layout.tsx` | Wrap children in flex row with Sidebar |
| Modify | `src/app/(auth)/login/page.tsx` | Redesign: logo + card + indigo focus rings |
| Modify | `src/app/admin/page.tsx` | Redesign: campaign cards with stat badges |
| Modify | `src/app/admin/campaigns/new/page.tsx` | Redesign: centred form card |
| **Create** | `src/components/ui/ConfirmModal.tsx` | Reusable backdrop + modal (replaces window.confirm) |
| Modify | `src/components/admin/LaunchButton.tsx` | Use ConfirmModal, remove window.confirm |
| Modify | `src/components/admin/RedemptionProgress.tsx` | Indigo gradient bar, muted styling |
| Modify | `src/components/admin/TokenUploader.tsx` | Drag-and-drop zone, indigo dashed border |
| Modify | `src/components/admin/EmployeeTable.tsx` | Styled table, green row highlight animation |
| Modify | `src/app/admin/campaigns/[id]/page.tsx` | Two-column layout, stat cards, launch in header |
| Modify | `src/app/scan/page.tsx` | Full-screen takeover, tap-to-dismiss, no auto-timer |

---

## Task 1: Global styles + font

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Update globals.css**

Replace the entire file with:

```css
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-inter);
}

body {
  font-family: var(--font-inter), Arial, sans-serif;
  background: #fafafa;
  color: #18181b;
}
```

- [ ] **Step 2: Update layout.tsx**

Replace the entire file with:

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'GiftFlow',
  description: 'Employee gift distribution platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.variable}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Verify dev server starts without errors**

```bash
npm run dev
```

Expected: server starts on `http://localhost:3000` with no compilation errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat: switch to Inter variable font, set GiftFlow title"
```

---

## Task 2: Collapsible sidebar component

**Files:**
- Create: `src/components/admin/Sidebar.tsx`
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: Create Sidebar.tsx**

```tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isCampaigns = pathname.startsWith('/admin')

  return (
    <nav className="group flex flex-col bg-zinc-900 w-14 hover:w-56 transition-all duration-200 overflow-hidden flex-shrink-0 min-h-screen z-10">
      {/* Logo */}
      <div className="flex items-center gap-3 h-14 px-3 border-b border-zinc-800 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex-shrink-0" />
        <span className="text-white font-bold text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
          GiftFlow
        </span>
      </div>

      {/* Nav items */}
      <div className="flex flex-col gap-1 p-2 flex-1">
        <Link
          href="/admin"
          className={`flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${
            isCampaigns
              ? 'bg-indigo-600 text-white'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
          }`}
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
            Campaigns
          </span>
        </Link>
      </div>

      {/* Sign out */}
      <div className="p-2 border-t border-zinc-800 flex-shrink-0">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-2 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors w-full"
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
            Sign out
          </span>
        </button>
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Update admin/layout.tsx to use the sidebar**

Replace the entire file with:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { Sidebar } from '@/components/admin/Sidebar'

const ADMIN_ROLES: JwtAppMetadata['role_name'][] = ['company_admin', 'campaign_manager']

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const meta = user.app_metadata as JwtAppMetadata | undefined
  if (!meta?.role_name || !ADMIN_ROLES.includes(meta.role_name)) redirect('/login')

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-zinc-50">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Visually verify in browser**

Open `http://localhost:3000/admin`. Expected:
- Dark sidebar at 56px wide showing icons only
- Hovering the sidebar expands it smoothly to ~220px with labels appearing
- "Campaigns" item highlighted in indigo
- "Sign out" at the bottom

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/Sidebar.tsx src/app/admin/layout.tsx
git commit -m "feat: add collapsible icon-rail sidebar to admin shell"
```

---

## Task 3: Login page redesign

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Replace login page**

Replace the entire file with:

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

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500" />
          <span className="text-xl font-bold text-zinc-900">GiftFlow</span>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8 flex flex-col gap-5"
        >
          <h1 className="text-lg font-semibold text-zinc-900">Sign in to your account</h1>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

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
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Visually verify in browser**

Open `http://localhost:3000/login`. Expected:
- Gradient logo mark + "GiftFlow" wordmark above the form
- White card with border on zinc-50 background
- Indigo focus ring on inputs when focused
- Gradient button

- [ ] **Step 3: Commit**

```bash
git add src/app/(auth)/login/page.tsx
git commit -m "feat: redesign login page with GiftFlow branding"
```

---

## Task 4: Campaign list redesign

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Replace campaign list page**

Replace the entire file with:

```tsx
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const appMeta = user!.app_metadata as JwtAppMetadata

  const service = createServiceClient()
  const { data: campaigns } = await service
    .from('campaigns')
    .select('id, name, campaign_date, sent_at')
    .eq('company_id', appMeta.company_id)
    .order('created_at', { ascending: false })

  const list = campaigns ?? []

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Campaigns</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{list.length} total</p>
        </div>
        <Link
          href="/admin/campaigns/new"
          className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
        >
          + New Campaign
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-zinc-200">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 mx-auto mb-4" />
          <p className="text-zinc-900 font-semibold mb-1">No campaigns yet</p>
          <p className="text-sm text-zinc-500 mb-6">Create your first campaign to get started</p>
          <Link
            href="/admin/campaigns/new"
            className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
          >
            + New Campaign
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((c) => (
            <Link
              key={c.id}
              href={`/admin/campaigns/${c.id}`}
              className="bg-white border border-zinc-200 rounded-xl p-5 hover:shadow-md transition-shadow flex items-center justify-between group"
            >
              <div>
                <p className="font-semibold text-zinc-900 group-hover:text-indigo-600 transition-colors">
                  {c.name}
                </p>
                <p className="text-sm text-zinc-400 mt-0.5">{c.campaign_date ?? '—'}</p>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                c.sent_at
                  ? 'bg-green-100 text-green-700'
                  : 'bg-violet-100 text-violet-700'
              }`}>
                {c.sent_at ? 'Sent' : 'Draft'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Visually verify in browser**

Open `http://localhost:3000/admin`. Expected:
- "Campaigns" h1 with count subtitle
- "+ New Campaign" gradient button top-right
- Campaign cards with hover shadow and name that turns indigo on hover
- Draft badge in violet, Sent badge in green
- Empty state shows logo mark + description + CTA if no campaigns

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: redesign campaign list with status badges and empty state"
```

---

## Task 5: New campaign form redesign

**Files:**
- Modify: `src/app/admin/campaigns/new/page.tsx`

- [ ] **Step 1: Replace new campaign page**

Replace the entire file with:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewCampaignPage() {
  const [name, setName] = useState('')
  const [campaignDate, setCampaignDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, campaignDate }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create campaign'); return }
      router.push(`/admin/campaigns/${data.id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-lg mx-auto">
      <Link href="/admin" className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors mb-6 inline-block">
        ← Campaigns
      </Link>

      <h1 className="text-2xl font-bold text-zinc-900 mb-8">New Campaign</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 flex flex-col gap-5">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-medium text-zinc-700">Campaign name</label>
          <input
            id="name"
            type="text"
            placeholder="e.g. Passover 2026"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="date" className="text-sm font-medium text-zinc-700">Campaign date</label>
          <input
            id="date"
            type="date"
            value={campaignDate}
            onChange={(e) => setCampaignDate(e.target.value)}
            required
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all mt-1"
        >
          {loading ? 'Creating…' : 'Create Campaign'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Visually verify in browser**

Open `http://localhost:3000/admin/campaigns/new`. Expected:
- Muted "← Campaigns" back link
- White card form matching the login card style
- Indigo focus rings on inputs
- Full-width gradient submit button

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/campaigns/new/page.tsx
git commit -m "feat: redesign new campaign form"
```

---

## Task 6: Confirmation modal component

**Files:**
- Create: `src/components/ui/ConfirmModal.tsx`
- Modify: `src/components/admin/LaunchButton.tsx`

- [ ] **Step 1: Create ConfirmModal.tsx**

```tsx
'use client'

type Props = {
  title: string
  message: string
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative bg-white rounded-2xl shadow-xl border border-zinc-200 p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold text-zinc-900 mb-1.5">{title}</h2>
        <p className="text-sm text-zinc-500 mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-zinc-700 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-500 rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
          >
            {loading ? 'Launching…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Replace LaunchButton.tsx**

Replace the entire file with:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

export function LaunchButton({ campaignId, employeeCount }: { campaignId: string; employeeCount: number }) {
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Launch failed')
        setShowModal(false)
        return
      }
      router.refresh()
    } finally {
      setLoading(false)
      setShowModal(false)
    }
  }

  return (
    <>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-2">
          {error}
        </p>
      )}
      <button
        onClick={() => setShowModal(true)}
        className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:brightness-110 transition-all"
      >
        🚀 Launch Campaign
      </button>
      {showModal && (
        <ConfirmModal
          title="Launch campaign?"
          message={`This will send QR codes via SMS to ${employeeCount} employee${employeeCount === 1 ? '' : 's'}. This cannot be undone.`}
          confirmLabel="Launch"
          loading={loading}
          onConfirm={handleConfirm}
          onCancel={() => setShowModal(false)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 3: Note the prop change**

`LaunchButton` now requires an `employeeCount` prop (used in the modal message). The campaign detail page (Task 9) must pass it: `<LaunchButton campaignId={campaign.id} employeeCount={allTokens.length} />`.

- [ ] **Step 4: Visually verify modal**

On any draft campaign with tokens, click "Launch Campaign". Expected:
- Blurred dark backdrop appears
- White modal with title "Launch campaign?" and correct employee count in message
- Cancel closes the modal without sending
- Clicking outside the modal closes it
- "Launch" button shows "Launching…" while the request is in-flight

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/ConfirmModal.tsx src/components/admin/LaunchButton.tsx
git commit -m "feat: replace window.confirm with ConfirmModal in LaunchButton"
```

---

## Task 7: Redemption progress redesign

**Files:**
- Modify: `src/components/admin/RedemptionProgress.tsx`

- [ ] **Step 1: Replace RedemptionProgress.tsx**

Replace the entire file with:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

export function RedemptionProgress({
  campaignId,
  initialClaimed,
  total,
}: {
  campaignId: string
  initialClaimed: number
  total: number
}) {
  const [claimed, setClaimed] = useState(initialClaimed)

  useEffect(() => {
    if (total === 0) return
    const supabase = createClient()
    const channel = supabase
      .channel(`redemption-${campaignId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'gift_tokens', filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          if (payload.new?.redeemed === true && payload.old?.redeemed === false) {
            setClaimed((c) => Math.min(c + 1, total))
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [campaignId, total])

  const pct = total === 0 ? 0 : Math.round((claimed / total) * 100)
  const pending = total - claimed

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="text-center">
          <p className="text-2xl font-bold text-zinc-900">{total}</p>
          <p className="text-xs text-zinc-400 mt-0.5">Total</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-indigo-600">{claimed}</p>
          <p className="text-xs text-zinc-400 mt-0.5">Claimed</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-amber-500">{pending}</p>
          <p className="text-xs text-zinc-400 mt-0.5">Pending</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-zinc-700">Redemption</span>
        <span className="text-sm font-semibold text-indigo-600">{pct}%</span>
      </div>
      <div className="w-full bg-zinc-100 rounded-full h-2.5">
        <div
          className="bg-gradient-to-r from-indigo-500 to-violet-500 h-2.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Visually verify**

Open a campaign detail page. Expected:
- Three stat cards (Total / Claimed / Pending) with large numbers
- Indigo gradient progress bar below
- Realtime: claim a gift via the scanner; the count should increment and bar should animate

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/RedemptionProgress.tsx
git commit -m "feat: redesign RedemptionProgress with stat cards and gradient bar"
```

---

## Task 8: CSV uploader redesign

**Files:**
- Modify: `src/components/admin/TokenUploader.tsx`

- [ ] **Step 1: Replace TokenUploader.tsx**

Replace the entire file with:

```tsx
'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { read, utils } from 'xlsx'
import { normalizePhone } from '@/lib/phone'

type ParsedRow = { name: string; phone_number: string; department?: string }
type ValidatedRow = ParsedRow & { _status: 'valid' | 'invalid'; _reason?: string }

function validateRows(raw: ParsedRow[]): ValidatedRow[] {
  return raw.map((row) => {
    if (!row.name?.trim()) return { ...row, _status: 'invalid', _reason: 'Missing name' }
    if (!normalizePhone(row.phone_number ?? '')) return { ...row, _status: 'invalid', _reason: 'Invalid phone' }
    return { ...row, _status: 'valid' }
  })
}

export function TokenUploader({ campaignId }: { campaignId: string }) {
  const [rows, setRows] = useState<ValidatedRow[]>([])
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function processFile(file: File) {
    setMessage(null)
    const buf = await file.arrayBuffer()
    const wb = read(buf)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const parsed: ParsedRow[] = utils.sheet_to_json(sheet, { defval: '' })
    setRows(validateRows(parsed))
  }

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await processFile(file)
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const validRows = rows.filter((r) => r._status === 'valid')
  const invalidCount = rows.length - validRows.length

  async function handleConfirm() {
    setUploading(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: validRows.map(({ name, phone_number, department }) => ({ name, phone_number, department })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Upload failed', type: 'error' })
        return
      }
      setMessage({ text: `${data.inserted} employees uploaded`, type: 'success' })
      setRows([])
      router.refresh()
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h2 className="font-semibold text-zinc-900 mb-1">Upload employees</h2>
      <p className="text-xs text-zinc-400 mb-4">
        Accepts .csv or .xlsx — columns: <code className="font-mono bg-zinc-100 px-1 rounded">name</code>,{' '}
        <code className="font-mono bg-zinc-100 px-1 rounded">phone_number</code>,{' '}
        <code className="font-mono bg-zinc-100 px-1 rounded">department</code> (optional)
      </p>

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-indigo-400 bg-indigo-50'
            : 'border-zinc-200 hover:border-indigo-300 hover:bg-zinc-50'
        }`}
      >
        <svg className="w-8 h-8 text-zinc-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm text-zinc-500">
          <span className="font-medium text-indigo-600">Click to browse</span> or drag and drop
        </p>
        <p className="text-xs text-zinc-400 mt-1">.csv or .xlsx</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      {message && (
        <p className={`text-sm mt-3 ${message.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
          {message.type === 'success' ? '✓ ' : '✗ '}{message.text}
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-zinc-600 mb-3">
            <span className="text-green-700 font-medium">{validRows.length} valid</span>
            {invalidCount > 0 && (
              <span className="text-red-600 font-medium"> · {invalidCount} invalid</span>
            )}
          </p>

          <div className="overflow-x-auto border border-zinc-100 rounded-xl mb-4">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="bg-zinc-50 text-zinc-500">
                  <th className="border-b border-zinc-100 px-3 py-2 text-left font-medium">Name</th>
                  <th className="border-b border-zinc-100 px-3 py-2 text-left font-medium">Phone</th>
                  <th className="border-b border-zinc-100 px-3 py-2 text-left font-medium">Department</th>
                  <th className="border-b border-zinc-100 px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i} className={r._status === 'invalid' ? 'bg-red-50' : ''}>
                    <td className="border-b border-zinc-100 px-3 py-1.5 text-zinc-700">
                      {r.name || <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="border-b border-zinc-100 px-3 py-1.5 font-mono text-zinc-600">
                      {r.phone_number || <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="border-b border-zinc-100 px-3 py-1.5 text-zinc-500">
                      {r.department || <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="border-b border-zinc-100 px-3 py-1.5">
                      {r._status === 'invalid'
                        ? <span className="text-red-500">{r._reason}</span>
                        : <span className="text-green-600">✓</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && (
              <p className="text-xs text-zinc-400 px-3 py-2">+{rows.length - 10} more rows not shown</p>
            )}
          </div>

          <button
            onClick={handleConfirm}
            disabled={validRows.length === 0 || uploading}
            className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
          >
            {uploading ? 'Uploading…' : `Confirm Upload (${validRows.length} employees)`}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Visually verify**

On a draft campaign, expected:
- Dashed drop zone with upload icon and "Click to browse or drag and drop"
- Dragging a file over the zone: border turns indigo, background turns indigo-50
- After picking a file: preview table appears with valid/invalid rows
- "Confirm Upload" gradient button at bottom

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/TokenUploader.tsx
git commit -m "feat: redesign TokenUploader with drag-and-drop zone"
```

---

## Task 9: Employee table redesign

**Files:**
- Modify: `src/components/admin/EmployeeTable.tsx`

- [ ] **Step 1: Replace EmployeeTable.tsx**

Replace the entire file with:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

type TokenRow = {
  id: string
  employee_name: string
  phone_number: string
  department: string | null
  sms_sent_at: string | null
  redeemed: boolean
  redeemed_at: string | null
  redeemed_by: string | null
}

function maskPhone(phone: string): string {
  return phone.replace(/\d(?=\d{4})/g, '•')
}

export function EmployeeTable({
  campaignId,
  initialRows,
}: {
  campaignId: string
  initialRows: TokenRow[]
}) {
  const [rows, setRows] = useState(initialRows)
  const [resending, setResending] = useState(false)
  const [resendMsg, setResendMsg] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`employee-table-${campaignId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'gift_tokens', filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const updated = payload.new as TokenRow
          setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [campaignId])

  async function handleResend() {
    setResending(true)
    setResendMsg(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/resend`, { method: 'POST' })
      const data = await res.json()
      setResendMsg(`Resent to ${data.dispatched} employees${data.failed > 0 ? ` · ${data.failed} failed` : ''}`)
      setTimeout(() => setResendMsg(null), 4000)
    } finally {
      setResending(false)
    }
  }

  function handleExport() {
    const a = document.createElement('a')
    a.href = `/api/campaigns/${campaignId}/export`
    a.download = `campaign-${campaignId}.csv`
    a.click()
  }

  const unclaimedCount = rows.filter((r) => !r.redeemed).length

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5 flex flex-col min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-zinc-900">Employees <span className="text-zinc-400 font-normal">({rows.length})</span></h2>
        <div className="flex items-center gap-2">
          {resendMsg && <p className="text-sm text-green-700">{resendMsg}</p>}
          <button
            onClick={handleResend}
            disabled={resending || unclaimedCount === 0}
            className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 disabled:opacity-40 hover:bg-zinc-50 transition-colors"
          >
            {resending ? 'Resending…' : `Resend (${unclaimedCount})`}
          </button>
          <button
            onClick={handleExport}
            className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm w-full border-collapse">
          <thead>
            <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">Department</th>
              <th className="px-3 py-2 font-medium">SMS</th>
              <th className="px-3 py-2 font-medium">Claimed</th>
              <th className="px-3 py-2 font-medium">Claimed At</th>
              <th className="px-3 py-2 font-medium">Distributor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`border-b border-zinc-50 transition-colors duration-500 ${r.redeemed ? 'bg-green-50' : 'hover:bg-zinc-50'}`}
              >
                <td className="px-3 py-2.5 font-medium text-zinc-800">{r.employee_name}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-zinc-500">{maskPhone(r.phone_number)}</td>
                <td className="px-3 py-2.5 text-zinc-500">{r.department ?? <span className="text-zinc-300">—</span>}</td>
                <td className="px-3 py-2.5">
                  {r.sms_sent_at
                    ? <span className="text-green-600 text-xs font-medium">✓ Sent</span>
                    : <span className="text-zinc-300">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  {r.redeemed
                    ? <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">Claimed</span>
                    : <span className="text-zinc-300">—</span>}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-400">
                  {r.redeemed_at ? new Date(r.redeemed_at).toLocaleString() : <span className="text-zinc-300">—</span>}
                </td>
                <td className="px-3 py-2.5 text-xs text-zinc-400">
                  {r.redeemed_by ?? <span className="text-zinc-300">—</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-zinc-400 text-sm">
                  No employees yet. Upload a CSV to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Visually verify**

Expected:
- Clean table with zinc-100 header row, `border-zinc-50` row dividers
- Redeemed rows have `bg-green-50` background (and animate in with `transition-colors duration-500`)
- "Claimed" shown as a green pill badge, not just "✓"
- Empty state: centered muted text

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/EmployeeTable.tsx
git commit -m "feat: redesign EmployeeTable with claim badges and row animation"
```

---

## Task 10: Campaign detail page — two-column layout

**Files:**
- Modify: `src/app/admin/campaigns/[id]/page.tsx`

- [ ] **Step 1: Replace campaign detail page**

Replace the entire file with:

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { TokenUploader } from '@/components/admin/TokenUploader'
import { LaunchButton } from '@/components/admin/LaunchButton'
import { RedemptionProgress } from '@/components/admin/RedemptionProgress'
import { EmployeeTable } from '@/components/admin/EmployeeTable'

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const appMeta = user!.app_metadata as JwtAppMetadata

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, name, campaign_date, sent_at')
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!campaign) notFound()

  const { data: tokens } = await service
    .from('gift_tokens')
    .select('id, employee_name, phone_number, department, sms_sent_at, redeemed, redeemed_at, redeemed_by')
    .eq('campaign_id', campaignId)
    .order('redeemed', { ascending: true })
    .order('employee_name', { ascending: true })

  const allTokens = tokens ?? []
  const claimedCount = allTokens.filter((t) => t.redeemed).length
  const canLaunch = !campaign.sent_at && allTokens.length > 0

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors">
          ← Campaigns
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">{campaign.name}</h1>
          <p className="text-sm text-zinc-400 mt-0.5">{campaign.campaign_date ?? '—'}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            campaign.sent_at ? 'bg-green-100 text-green-700' : 'bg-violet-100 text-violet-700'
          }`}>
            {campaign.sent_at ? 'Sent' : 'Draft'}
          </span>
          {canLaunch && (
            <LaunchButton campaignId={campaign.id} employeeCount={allTokens.length} />
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6 items-start">
        {/* Left rail */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-4">
          <RedemptionProgress
            campaignId={campaign.id}
            initialClaimed={claimedCount}
            total={allTokens.length}
          />
          {!campaign.sent_at && (
            <TokenUploader campaignId={campaign.id} />
          )}
        </div>

        {/* Right column */}
        <div className="flex-1 min-w-0">
          <EmployeeTable
            campaignId={campaign.id}
            initialRows={allTokens}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Visually verify the two-column layout**

Open a campaign detail page. Expected:
- Header: campaign name + date on the left, status badge + Launch button on the right
- Left rail (288px): stat cards + progress bar on top, CSV uploader below (draft only)
- Right: employee table fills remaining width
- After launch (`sent_at` set): left rail shows only stats + progress, no uploader

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/campaigns/[id]/page.tsx
git commit -m "feat: two-column campaign detail with stats rail and launch in header"
```

---

## Task 11: Scanner redesign

**Files:**
- Modify: `src/app/scan/page.tsx`

- [ ] **Step 1: Replace scan/page.tsx**

Replace the entire file with:

```tsx
'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { QrScanner } from '@/components/QrScanner'
import { createClient } from '@/lib/supabase/browser'
import type { TokenVerifyResult } from '@/types'

type ScanState = 'scanning' | 'loading' | 'result'

const TOKEN_PATTERN = /\/verify\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

export default function ScanPage() {
  const [scanState, setScanState] = useState<ScanState>('scanning')
  const [result, setResult] = useState<TokenVerifyResult | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null)
    })
  }, [])

  const handleScan = useCallback(
    async (text: string) => {
      if (scanState !== 'scanning') return
      setScanState('loading')

      const match = text.match(TOKEN_PATTERN)
      if (!match) {
        setResult({ valid: false, reason: 'invalid' })
        setScanState('result')
        return
      }

      const token = match[1]
      try {
        const res = await fetch(`/api/verify/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ distributorId: userId }),
        })
        const data: TokenVerifyResult = await res.json()
        setResult(data)
      } catch {
        setResult({ valid: false, reason: 'invalid' })
      }

      setScanState('result')
    },
    [scanState, userId]
  )

  function handleDismiss() {
    setResult(null)
    setScanState('scanning')
  }

  return (
    <main className="flex flex-col min-h-screen bg-black overflow-hidden">
      <div className="relative flex-1">
        {/* Camera */}
        <QrScanner onResult={handleScan} active={scanState === 'scanning' && userId !== null} />

        {/* Scan frame overlay (visible during scanning) */}
        {scanState === 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="relative w-52 h-52">
              {/* Corner brackets */}
              <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-indigo-400 rounded-tl-lg" />
              <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-indigo-400 rounded-tr-lg" />
              <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-indigo-400 rounded-bl-lg" />
              <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-indigo-400 rounded-br-lg" />
              {/* Animated scan line */}
              <span className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-scan-line" style={{ top: '50%' }} />
            </div>
            <p className="text-white/50 text-sm mt-6">Point camera at QR code</p>
          </div>
        )}

        {/* Loading overlay */}
        {scanState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="w-10 h-10 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Result takeover */}
        {scanState === 'result' && result && (
          <div
            onClick={handleDismiss}
            className={`absolute inset-0 flex flex-col items-center justify-center gap-5 cursor-pointer select-none ${
              result.valid ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            {/* Icon */}
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg">
              <span className="text-4xl">{result.valid ? '✓' : '✗'}</span>
            </div>

            {/* Message */}
            {result.valid ? (
              <>
                <p className="text-white text-4xl font-bold text-center px-8">{result.employeeName}</p>
                <p className="text-white/80 text-lg">Gift collected</p>
              </>
            ) : result.reason === 'already_used' ? (
              <>
                <p className="text-white text-3xl font-bold">Already claimed</p>
                {result.employeeName && (
                  <p className="text-white/80 text-lg">{result.employeeName}</p>
                )}
              </>
            ) : (
              <>
                <p className="text-white text-3xl font-bold">Could not verify</p>
                <p className="text-white/80 text-lg">Try again</p>
              </>
            )}

            <p className="text-white/40 text-sm absolute bottom-10">Tap anywhere to scan next</p>
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Add scan-line animation to globals.css**

Append to `src/app/globals.css`:

```css
@keyframes scan-line {
  0%, 100% { transform: translateY(-48px); opacity: 0.8; }
  50% { transform: translateY(48px); opacity: 1; }
}

.animate-scan-line {
  animation: scan-line 2s ease-in-out infinite;
}
```

- [ ] **Step 3: Visually verify scanner behaviour**

Open `http://localhost:3000/scan`. Expected:
- Full-screen black camera view with indigo corner brackets and animated scan line
- Scan a valid QR: full-screen green overlay, large employee name, department, "Tap anywhere to scan next"
- Tap: returns to scanning immediately (no timer)
- Scan an already-claimed QR: full-screen red overlay, "Already claimed" + name
- Scan an invalid QR: full-screen red overlay, "Could not verify / Try again"
- Auto-dismiss timer is gone — only tap dismisses

- [ ] **Step 4: Commit**

```bash
git add src/app/scan/page.tsx src/app/globals.css
git commit -m "feat: redesign scanner with full-screen takeover and tap-to-dismiss"
```

---

## Task 12: Final pass — run existing tests

**Files:** none

- [ ] **Step 1: Run the full test suite**

```bash
npm run test
```

Expected: all existing API and lib tests pass. These tests cover route logic and do not test UI, so all should be green.

- [ ] **Step 2: Fix any regressions**

If a test fails, it means a file import path or export changed inadvertently. Re-check the modified files for broken exports or renamed functions.

- [ ] **Step 3: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve any test regressions from UI redesign"
```

---

## Self-review notes

- **LaunchButton prop change:** `employeeCount` is a new required prop. Task 10 already passes it correctly: `<LaunchButton campaignId={campaign.id} employeeCount={allTokens.length} />`.
- **Scan line animation:** Uses a custom keyframe in globals.css — Tailwind v4 doesn't ship an `animate-scan-line` utility by default, so the CSS class is defined manually.
- **No auto-dismiss removed cleanly:** The `timeoutRef` and all `setTimeout` calls are removed from `scan/page.tsx`. The `useRef` import is also removed.
- **Spec coverage:** Login ✓, Campaign list ✓, New campaign form ✓, Campaign detail (two-col, stat cards, launch modal) ✓, Scanner (full-screen takeover, tap-to-dismiss) ✓, Sidebar (icon-rail, hover expand) ✓.
