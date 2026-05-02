# Employee Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public `/gift` page where employees enter their phone number and see any unclaimed gifts waiting for them, with campaign name and instructions to find a distributor.

**Architecture:** A new public page at `/gift` with a client-side phone input form. It calls `POST /api/gift/lookup` which uses the service role to query `gift_tokens` by phone number. The route never returns token UUIDs — only campaign metadata. The middleware already excludes `/api/` routes so no middleware changes are needed; the `/gift` page itself needs to be excluded from the auth redirect.

**Tech Stack:** Next.js 15 App Router, Supabase service role client, `normalizePhone` utility (already exists at `src/lib/phone.ts`).

---

## File Map

- **Modify:** `src/middleware.ts` — add `/gift` to public prefixes
- **Create:** `src/app/api/gift/lookup/route.ts` — phone lookup API
- **Create:** `src/app/gift/page.tsx` — public self-check page

---

### Task 1: Exclude `/gift` from auth middleware

**Files:**
- Modify: `src/middleware.ts`

- [ ] **Step 1: Add `/gift` to PUBLIC_PREFIXES**

In `src/middleware.ts`, update the constant:
```typescript
const PUBLIC_PREFIXES = ['/login', '/reset-password', '/verify', '/gift']
```

- [ ] **Step 2: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: allow /gift page without authentication"
```

---

### Task 2: Gift lookup API route

**Files:**
- Create: `src/app/api/gift/lookup/route.ts`

- [ ] **Step 1: Create the lookup route**

Create `src/app/api/gift/lookup/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const raw: string = body.phone ?? ''

  const phone = normalizePhone(raw)
  if (!phone) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
  }

  const service = createServiceClient()

  // Find unredeemed tokens for this phone across all open campaigns
  const { data: tokens } = await service
    .from('gift_tokens')
    .select('campaign_id, employee_name, campaigns(name, campaign_date, closed_at, companies(name))')
    .eq('phone_number', phone)
    .eq('redeemed', false)

  const gifts = (tokens ?? [])
    .filter((t) => {
      const campaign = t.campaigns as unknown as { closed_at: string | null } | null
      return !campaign?.closed_at
    })
    .map((t) => {
      const campaign = t.campaigns as unknown as {
        name: string
        campaign_date: string | null
        companies: { name: string } | null
      } | null
      return {
        campaignName: campaign?.name ?? 'Gift',
        campaignDate: campaign?.campaign_date ?? null,
        companyName: campaign?.companies?.name ?? '',
        employeeName: t.employee_name,
      }
    })

  return NextResponse.json({ gifts })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/gift/lookup/route.ts
git commit -m "feat: add /api/gift/lookup endpoint for employee self-check"
```

---

### Task 3: Public `/gift` page

**Files:**
- Create: `src/app/gift/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/gift/page.tsx`:

```tsx
'use client'

import { useState } from 'react'

type Gift = {
  campaignName: string
  campaignDate: string | null
  companyName: string
  employeeName: string
}

export default function GiftPage() {
  const [phone, setPhone] = useState('')
  const [gifts, setGifts] = useState<Gift[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setGifts(null)
    try {
      const res = await fetch('/api/gift/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }
      setGifts(data.gifts)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-start pt-16 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-zinc-900">Check Your Gift</h1>
          <p className="text-sm text-zinc-500 mt-1">Enter your phone number to see if you have an unclaimed gift.</p>
        </div>

        <form onSubmit={handleLookup} className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="phone" className="text-sm font-medium text-zinc-700">Phone number</label>
            <input
              id="phone"
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
          >
            {loading ? 'Looking up…' : 'Check'}
          </button>
        </form>

        {gifts !== null && (
          <div className="mt-6">
            {gifts.length === 0 ? (
              <div className="text-center bg-white rounded-2xl border border-zinc-200 p-8">
                <p className="text-zinc-500 text-sm">No unclaimed gifts found for this number.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {gifts.map((gift, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-zinc-200 p-5">
                    <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide mb-1">{gift.companyName}</p>
                    <p className="font-semibold text-zinc-900">{gift.campaignName}</p>
                    {gift.campaignDate && (
                      <p className="text-sm text-zinc-400 mt-0.5">{gift.campaignDate}</p>
                    )}
                    <div className="mt-4 p-3 bg-indigo-50 rounded-lg">
                      <p className="text-sm text-indigo-700 font-medium">Hi {gift.employeeName}!</p>
                      <p className="text-sm text-indigo-600 mt-0.5">
                        You have an unclaimed gift. Find a gift distributor and show them this screen to claim it.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify**

Navigate to `/gift` without being logged in — should load without redirecting to login. Enter a phone number of an employee with an unredeemed token — should show their gift. Enter an unknown number — should show "No unclaimed gifts found."

- [ ] **Step 3: Commit**

```bash
git add src/app/gift/page.tsx
git commit -m "feat: add public /gift self-check page for employees"
```
