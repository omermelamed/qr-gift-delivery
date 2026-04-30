# Campaign Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add campaign close/expiry (with a `closed_at` DB column), campaign duplication (with a name/date modal), and a department-breakdown toggle in the employee table.

**Architecture:** A new `closed_at TIMESTAMPTZ` column on `campaigns` drives the three-state status badge (Draft → Sent → Closed). The close and duplicate operations each get a dedicated API route. Department breakdown is a pure client-side grouping toggle inside `EmployeeTable`. The verify route gains a `closed_at` guard that returns `campaign_closed` before checking the existing redemption logic. The scan page gets a new full-screen "Campaign closed" state.

**Tech Stack:** Next.js 15 App Router, React 19, Supabase Postgres + browser client, Tailwind v4, Vitest.

**Run tests with:** `npx vitest run`

---

## File Map

| Action | Path |
|--------|------|
| Create | `supabase/migrations/007_campaign_close.sql` |
| Modify | `src/types/index.ts` |
| Create | `src/app/api/campaigns/[id]/close/route.ts` |
| Create | `src/app/api/campaigns/[id]/duplicate/route.ts` |
| Create | `src/components/admin/CloseCampaignButton.tsx` |
| Create | `src/components/admin/DuplicateCampaignButton.tsx` |
| Modify | `src/app/admin/page.tsx` |
| Modify | `src/app/admin/campaigns/[id]/page.tsx` |
| Modify | `src/components/admin/EmployeeTable.tsx` |
| Modify | `src/app/api/verify/[token]/route.ts` |
| Modify | `src/app/scan/page.tsx` |
| Create | `tests/api/campaign-close.test.ts` |
| Create | `tests/api/campaign-duplicate.test.ts` |
| Modify | `tests/api/verify.test.ts` |

---

### Task 1: Migration and types

**Files:**
- Create: `supabase/migrations/007_campaign_close.sql`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/007_campaign_close.sql`:

```sql
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
```

- [ ] **Step 2: Apply migration to Supabase**

Open the Supabase dashboard → SQL editor, paste and run:
```sql
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
```

Verify: in the Table Editor, `campaigns` table now shows a `closed_at` column.

- [ ] **Step 3: Update types**

In `src/types/index.ts`, update the `Campaign` type to include `closed_at`:

Old:
```typescript
export type Campaign = {
  id: string
  company_id: string
  name: string
  campaign_date: string | null
  created_by: string | null
  created_at: string
  sent_at: string | null
}
```

New:
```typescript
export type Campaign = {
  id: string
  company_id: string
  name: string
  campaign_date: string | null
  created_by: string | null
  created_at: string
  sent_at: string | null
  closed_at: string | null
}
```

Also update `TokenVerifyResult` to include `campaign_closed`:

Old:
```typescript
export type TokenVerifyResult =
  | { valid: true; employeeName: string }
  | { valid: false; reason: 'already_used'; employeeName: string }
  | { valid: false; reason: 'invalid' }
```

New:
```typescript
export type TokenVerifyResult =
  | { valid: true; employeeName: string }
  | { valid: false; reason: 'already_used'; employeeName: string }
  | { valid: false; reason: 'invalid' }
  | { valid: false; reason: 'campaign_closed' }
  | { valid: false; reason: 'not_authorized' }
```

(`not_authorized` is added now so Plan 3's distributor work doesn't need to touch types again.)

- [ ] **Step 4: Verify TypeScript**

```bash
cd /Users/omer.melamed/Desktop/private/qr-gift-delivery
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/007_campaign_close.sql src/types/index.ts
git commit -m "feat: add closed_at to campaigns and extend TokenVerifyResult types"
```

---

### Task 2: Campaign close API route

**Files:**
- Create: `src/app/api/campaigns/[id]/close/route.ts`
- Create: `tests/api/campaign-close.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/campaign-close.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({ from: mockFromService }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['campaigns:launch']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

function makeRequest(id: string) {
  return new NextRequest(`http://localhost/api/campaigns/${id}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/campaigns/[id]/close', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'admin-1',
          app_metadata: { company_id: 'co-1', role_id: 'role-1', role_name: 'company_admin' },
        },
      },
    })
  })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('@/app/api/campaigns/[id]/close/route')
    const res = await POST(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 403 when missing campaigns:launch permission', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)
    const { POST } = await import('@/app/api/campaigns/[id]/close/route')
    const res = await POST(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(403)
  })

  it('returns 404 when campaign not found', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/close/route')
    const res = await POST(makeRequest('missing'), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
  })

  it('returns 409 when campaign not yet sent', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null, closed_at: null }, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/close/route')
    const res = await POST(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(409)
  })

  it('returns 409 when campaign already closed', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: '2026-04-01', closed_at: '2026-04-10' }, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/close/route')
    const res = await POST(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(409)
  })

  it('closes a sent campaign and returns success', async () => {
    let updated = false
    mockFromService.mockImplementation((table: string) => {
      if (table === 'campaigns') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: '2026-04-01', closed_at: null }, error: null }) }) }) }),
          update: () => ({ eq: () => ({ eq: () => { updated = true; return Promise.resolve({ error: null }) } }) }),
        }
      }
    })
    const { POST } = await import('@/app/api/campaigns/[id]/close/route')
    const res = await POST(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(updated).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/api/campaign-close.test.ts 2>&1 | tail -10
```

Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the route**

Create `src/app/api/campaigns/[id]/close/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'campaigns:launch')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, sent_at, closed_at')
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (!campaign.sent_at) return NextResponse.json({ error: 'Campaign not yet sent' }, { status: 409 })
  if (campaign.closed_at) return NextResponse.json({ error: 'Campaign already closed' }, { status: 409 })

  await service
    .from('campaigns')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/api/campaign-close.test.ts 2>&1 | tail -10
```

Expected: 6/6 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/\[id\]/close/route.ts tests/api/campaign-close.test.ts
git commit -m "feat: add POST /api/campaigns/[id]/close route"
```

---

### Task 3: Campaign duplicate API route

**Files:**
- Create: `src/app/api/campaigns/[id]/duplicate/route.ts`
- Create: `tests/api/campaign-duplicate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/campaign-duplicate.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({ from: mockFromService }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['campaigns:create']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

function makeRequest(id: string, body: object) {
  return new NextRequest(`http://localhost/api/campaigns/${id}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/campaigns/[id]/duplicate', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'admin-1',
          app_metadata: { company_id: 'co-1', role_id: 'role-1', role_name: 'company_admin' },
        },
      },
    })
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('@/app/api/campaigns/[id]/duplicate/route')
    const res = await POST(makeRequest('c-1', { name: 'Copy', campaign_date: null }), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 403 when missing campaigns:create', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)
    const { POST } = await import('@/app/api/campaigns/[id]/duplicate/route')
    const res = await POST(makeRequest('c-1', { name: 'Copy', campaign_date: null }), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(403)
  })

  it('returns 404 when source campaign not found', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/duplicate/route')
    const res = await POST(makeRequest('missing', { name: 'Copy', campaign_date: null }), { params: Promise.resolve({ id: 'missing' }) })
    expect(res.status).toBe(404)
  })

  it('returns 400 when name is missing', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', company_id: 'co-1' }, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/duplicate/route')
    const res = await POST(makeRequest('c-1', { campaign_date: null }), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(400)
  })

  it('creates new campaign without copying employees when copyEmployees is false', async () => {
    let insertedCampaign: unknown = null
    mockFromService.mockImplementation((table: string) => {
      if (table === 'campaigns') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', company_id: 'co-1' }, error: null }) }) }) }),
          insert: (row: unknown) => { insertedCampaign = row; return { select: () => ({ single: () => Promise.resolve({ data: { id: 'new-c' }, error: null }) }) } },
        }
      }
      return { select: () => ({ eq: () => ({ data: [], error: null }) }) }
    })

    const { POST } = await import('@/app/api/campaigns/[id]/duplicate/route')
    const res = await POST(makeRequest('c-1', { name: 'Copy', campaign_date: '2026-05-01', copyEmployees: false }), { params: Promise.resolve({ id: 'c-1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.id).toBe('new-c')
    expect(insertedCampaign).toMatchObject({ name: 'Copy', campaign_date: '2026-05-01', company_id: 'co-1' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/api/campaign-duplicate.test.ts 2>&1 | tail -10
```

Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the route**

Create `src/app/api/campaigns/[id]/duplicate/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sourceCampaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'campaigns:create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { name, campaign_date, copyEmployees } = body
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const service = createServiceClient()

  const { data: source } = await service
    .from('campaigns')
    .select('id, company_id')
    .eq('id', sourceCampaignId)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!source) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const { data: newCampaign } = await service
    .from('campaigns')
    .insert({ name: name.trim(), campaign_date: campaign_date ?? null, company_id: appMeta.company_id })
    .select('id')
    .single()

  if (!newCampaign) return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })

  if (copyEmployees) {
    const { data: tokens } = await service
      .from('gift_tokens')
      .select('employee_name, phone_number, department')
      .eq('campaign_id', sourceCampaignId)

    if (tokens && tokens.length > 0) {
      await service.from('gift_tokens').insert(
        tokens.map((t) => ({
          campaign_id: newCampaign.id,
          employee_name: t.employee_name,
          phone_number: t.phone_number,
          department: t.department,
        }))
      )
    }
  }

  return NextResponse.json({ id: newCampaign.id })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/api/campaign-duplicate.test.ts 2>&1 | tail -10
```

Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/\[id\]/duplicate/route.ts tests/api/campaign-duplicate.test.ts
git commit -m "feat: add POST /api/campaigns/[id]/duplicate route"
```

---

### Task 4: CloseCampaignButton component

**Files:**
- Create: `src/components/admin/CloseCampaignButton.tsx`

- [ ] **Step 1: Create CloseCampaignButton**

Create `src/components/admin/CloseCampaignButton.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

export function CloseCampaignButton({ campaignId }: { campaignId: string }) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleClose() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/close`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to close campaign')
        return
      }
      setShowConfirm(false)
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
      >
        Close campaign
      </button>

      {showConfirm && (
        <ConfirmModal
          title="Close campaign?"
          description="No further QR codes can be redeemed after closing. This cannot be undone."
          confirmLabel="Close"
          loading={loading}
          error={error}
          onConfirm={handleClose}
          onCancel={() => { setShowConfirm(false); setError(null) }}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Check ConfirmModal accepts an `error` prop**

Read `src/components/ui/ConfirmModal.tsx` and verify it accepts an `error?: string | null` prop. If it doesn't, add it:

The component should have `error?: string | null` in its Props type and render:
```tsx
{error && (
  <p className="text-sm text-red-600 mt-2">{error}</p>
)}
```
above the action buttons.

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "CloseCampaign"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/CloseCampaignButton.tsx
git commit -m "feat: add CloseCampaignButton component"
```

---

### Task 5: DuplicateCampaignButton component

**Files:**
- Create: `src/components/admin/DuplicateCampaignButton.tsx`

- [ ] **Step 1: Create DuplicateCampaignButton**

Create `src/components/admin/DuplicateCampaignButton.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  campaignId: string
  sourceName: string
  sourceDate: string | null
}

export function DuplicateCampaignButton({ campaignId, sourceName, sourceDate }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState(`Copy of ${sourceName}`)
  const [date, setDate] = useState(sourceDate ?? '')
  const [copyEmployees, setCopyEmployees] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleDuplicate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, campaign_date: date || null, copyEmployees }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to duplicate campaign')
        return
      }
      router.push(`/admin/campaigns/${data.id}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={(e) => { e.preventDefault(); setShowModal(true) }}
        aria-label="Duplicate campaign"
        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors opacity-0 group-hover:opacity-100"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>

      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-5">Duplicate campaign</h2>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
                {error}
              </p>
            )}

            <form onSubmit={handleDuplicate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="dup-name" className="text-sm font-medium text-zinc-700">Campaign name</label>
                <input
                  id="dup-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="dup-date" className="text-sm font-medium text-zinc-700">Campaign date</label>
                <input
                  id="dup-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={copyEmployees}
                  onChange={(e) => setCopyEmployees(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-zinc-700">Copy employees from this campaign</span>
              </label>

              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-zinc-200 rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
                >
                  {loading ? 'Duplicating…' : 'Duplicate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "DuplicateCampaign"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/DuplicateCampaignButton.tsx
git commit -m "feat: add DuplicateCampaignButton component with modal"
```

---

### Task 6: Admin list page — three-state badge + duplicate button

**Files:**
- Modify: `src/app/admin/page.tsx`

The list page needs to:
1. Select `closed_at` from campaigns query
2. Show three-state badge: grey "Closed", green "Sent", violet "Draft"
3. Show `DuplicateCampaignButton` on each card (opacity-0, visible on group-hover, positioned right of the card content)

- [ ] **Step 1: Update admin list page**

Replace the full content of `src/app/admin/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { DuplicateCampaignButton } from '@/components/admin/DuplicateCampaignButton'

function StatusBadge({ sentAt, closedAt }: { sentAt: string | null; closedAt: string | null }) {
  if (closedAt) return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-500">Closed</span>
  if (sentAt) return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">Sent</span>
  return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">Draft</span>
}

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const appMeta = user.app_metadata as JwtAppMetadata

  const service = createServiceClient()
  const { data: campaigns } = await service
    .from('campaigns')
    .select('id, name, campaign_date, sent_at, closed_at')
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
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-900 group-hover:text-indigo-600 transition-colors truncate">
                    {c.name}
                  </p>
                  <p className="text-sm text-zinc-400 mt-0.5">{c.campaign_date ?? '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <DuplicateCampaignButton
                  campaignId={c.id}
                  sourceName={c.name}
                  sourceDate={c.campaign_date}
                />
                <StatusBadge sentAt={c.sent_at} closedAt={c.closed_at} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "admin/page|DuplicateCampaign"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat: update campaign list with 3-state badge and duplicate button"
```

---

### Task 7: Campaign detail page — close button, three-state badge, closed_at query

**Files:**
- Modify: `src/app/admin/campaigns/[id]/page.tsx`

- [ ] **Step 1: Update campaign detail page**

Replace the full content of `src/app/admin/campaigns/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { TokenUploader } from '@/components/admin/TokenUploader'
import { LaunchButton } from '@/components/admin/LaunchButton'
import { CloseCampaignButton } from '@/components/admin/CloseCampaignButton'
import { RedemptionProgress } from '@/components/admin/RedemptionProgress'
import { EmployeeTable } from '@/components/admin/EmployeeTable'

function StatusBadge({ sentAt, closedAt }: { sentAt: string | null; closedAt: string | null }) {
  if (closedAt) return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-500">Closed</span>
  if (sentAt) return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">Sent</span>
  return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">Draft</span>
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const appMeta = user.app_metadata as JwtAppMetadata

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, name, campaign_date, sent_at, closed_at')
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
  const canClose = !!campaign.sent_at && !campaign.closed_at

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
          <StatusBadge sentAt={campaign.sent_at} closedAt={campaign.closed_at} />
          {canClose && <CloseCampaignButton campaignId={campaign.id} />}
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
            isDraft={!campaign.sent_at}
          />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "campaigns/\[id\]"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/campaigns/\[id\]/page.tsx
git commit -m "feat: update campaign detail page with close button and 3-state badge"
```

---

### Task 8: Department breakdown in EmployeeTable

**Files:**
- Modify: `src/components/admin/EmployeeTable.tsx`

Add a `groupByDept` toggle button in the table header. When toggled, rows are grouped by department with a sub-header row showing `{claimed}/{total}` per department. Employees without a department go under "No department". Within each group: unclaimed first, then alphabetical.

- [ ] **Step 1: Add grouping logic to EmployeeTable**

Find the section in `src/components/admin/EmployeeTable.tsx` that starts with `const [rows, setRows] = useState(initialRows)` and add a `groupByDept` state after the existing state declarations:

```tsx
const [groupByDept, setGroupByDept] = useState(false)
```

Then add a computed value for whether the toggle should be shown (at least one employee has a non-null department). Add this after the state declarations:

```tsx
const hasDepts = rows.some((r) => r.department != null)
```

Then add a helper to build grouped rows. Add this pure function inside the component, before the return:

```tsx
type GroupHeader = { _type: 'header'; department: string; claimed: number; total: number }
type TableRow = TokenRow | GroupHeader

function buildGroupedRows(): TableRow[] {
  const groups = new Map<string, TokenRow[]>()
  for (const row of rows) {
    const key = row.department ?? 'No department'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }
  const sorted = [...groups.entries()].sort(([a], [b]) => {
    if (a === 'No department') return 1
    if (b === 'No department') return -1
    return a.localeCompare(b)
  })
  const result: TableRow[] = []
  for (const [dept, deptRows] of sorted) {
    const sortedRows = [...deptRows].sort((a, b) => {
      if (a.redeemed !== b.redeemed) return a.redeemed ? 1 : -1
      return a.employee_name.localeCompare(b.employee_name)
    })
    result.push({ _type: 'header', department: dept, claimed: deptRows.filter((r) => r.redeemed).length, total: deptRows.length })
    result.push(...sortedRows)
  }
  return result
}
```

In the table header row div (where the action buttons are), add the toggle button after the `Export CSV` button, conditional on `hasDepts`:

```tsx
{hasDepts && (
  <button
    onClick={() => setGroupByDept((v) => !v)}
    className={`border rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      groupByDept
        ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
        : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
    }`}
  >
    By department
  </button>
)}
```

Replace the `<tbody>` content inside the table to render either flat or grouped rows:

```tsx
<tbody>
  {groupByDept
    ? buildGroupedRows().map((row, i) => {
        if ('_type' in row) {
          return (
            <tr key={`header-${row.department}`} className="bg-zinc-50">
              <td colSpan={7} className="px-3 py-2 text-xs font-semibold text-zinc-500">
                {row.department} · {row.claimed}/{row.total} claimed
              </td>
            </tr>
          )
        }
        return (
          <tr
            key={row.id}
            className={`border-b border-zinc-50 transition-colors duration-500 ${row.redeemed ? 'bg-green-50' : 'hover:bg-zinc-50'}`}
          >
            <td className="px-3 py-2.5 font-medium text-zinc-800">{row.employee_name}</td>
            <td className="px-3 py-2.5 font-mono text-xs text-zinc-500">{maskPhone(row.phone_number)}</td>
            <td className="px-3 py-2.5 text-zinc-500">{row.department ?? <span className="text-zinc-300">—</span>}</td>
            <td className="px-3 py-2.5">
              {row.sms_sent_at
                ? <span className="text-green-600 text-xs font-medium">✓ Sent</span>
                : <span className="text-zinc-300">—</span>}
            </td>
            <td className="px-3 py-2.5">
              {row.redeemed
                ? <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">Claimed</span>
                : <span className="text-zinc-300">—</span>}
            </td>
            <td className="px-3 py-2.5 text-xs text-zinc-400">
              {row.redeemed_at ? new Date(row.redeemed_at).toLocaleString() : <span className="text-zinc-300">—</span>}
            </td>
            <td className="px-3 py-2.5 text-xs text-zinc-400">
              {row.redeemed_by ?? <span className="text-zinc-300">—</span>}
            </td>
          </tr>
        )
      })
    : rows.map((r) => (
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
      ))
  }
  {rows.length === 0 && (
    <tr>
      <td colSpan={7} className="px-3 py-12 text-center text-zinc-400 text-sm">
        No employees yet. Upload a CSV or add one manually.
      </td>
    </tr>
  )}
</tbody>
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "EmployeeTable"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/EmployeeTable.tsx
git commit -m "feat: add department breakdown toggle to EmployeeTable"
```

---

### Task 9: Update verify route and scan page for closed campaigns

**Files:**
- Modify: `src/app/api/verify/[token]/route.ts`
- Modify: `src/app/scan/page.tsx`
- Modify: `tests/api/verify.test.ts`

- [ ] **Step 1: Update verify route to check closed_at**

Replace `src/app/api/verify/[token]/route.ts`:

```typescript
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

  // Check if token exists and get campaign closed_at in one query
  const { data: tokenRow } = await supabase
    .from('gift_tokens')
    .select('id, employee_name, redeemed, campaign_id, campaigns(closed_at)')
    .eq('token', token)
    .single()

  if (!tokenRow) {
    return NextResponse.json({ valid: false, reason: 'invalid' })
  }

  const campaign = tokenRow.campaigns as { closed_at: string | null } | null
  if (campaign?.closed_at) {
    return NextResponse.json({ valid: false, reason: 'campaign_closed' })
  }

  if (tokenRow.redeemed) {
    return NextResponse.json({
      valid: false,
      reason: 'already_used',
      employeeName: tokenRow.employee_name,
    })
  }

  // Atomic write: first writer wins
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

  // Race condition: another request redeemed it between our read and write
  return NextResponse.json({
    valid: false,
    reason: 'already_used',
    employeeName: tokenRow.employee_name,
  })
}
```

- [ ] **Step 2: Add closed-campaign tests to verify test file**

Add these test cases to `tests/api/verify.test.ts`. The existing mock at the top needs to be updated to handle the new `campaigns(closed_at)` join. Replace the entire file with:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockSelectSingle = vi.fn()   // for the initial token+campaign lookup
const mockUpdateSingle = vi.fn()   // for the atomic UPDATE

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: mockSelectSingle }),
      }),
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({ single: mockUpdateSingle }),
          }),
        }),
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

  it('returns invalid when token does not exist', async () => {
    mockSelectSingle.mockResolvedValue({ data: null, error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('nonexistent'), { params: Promise.resolve({ token: 'nonexistent' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('invalid')
  })

  it('returns campaign_closed when campaign is closed', async () => {
    mockSelectSingle.mockResolvedValue({
      data: { id: 't-1', employee_name: 'Omer', redeemed: false, campaign_id: 'c-1', campaigns: { closed_at: '2026-04-10' } },
      error: null,
    })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('some-token'), { params: Promise.resolve({ token: 'some-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('campaign_closed')
  })

  it('returns already_used when token is already redeemed', async () => {
    mockSelectSingle.mockResolvedValue({
      data: { id: 't-1', employee_name: 'Dana', redeemed: true, campaign_id: 'c-1', campaigns: { closed_at: null } },
      error: null,
    })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('used-token'), { params: Promise.resolve({ token: 'used-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('already_used')
    expect(body.employeeName).toBe('Dana')
  })

  it('returns valid:true and employee name on successful scan', async () => {
    mockSelectSingle.mockResolvedValue({
      data: { id: 't-1', employee_name: 'Omer', redeemed: false, campaign_id: 'c-1', campaigns: { closed_at: null } },
      error: null,
    })
    mockUpdateSingle.mockResolvedValue({ data: { employee_name: 'Omer' }, error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('valid-token'), { params: Promise.resolve({ token: 'valid-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.employeeName).toBe('Omer')
  })

  it('returns already_used when race condition prevents update', async () => {
    mockSelectSingle.mockResolvedValue({
      data: { id: 't-1', employee_name: 'Omer', redeemed: false, campaign_id: 'c-1', campaigns: { closed_at: null } },
      error: null,
    })
    mockUpdateSingle.mockResolvedValue({ data: null, error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('race-token'), { params: Promise.resolve({ token: 'race-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('already_used')
  })
})
```

- [ ] **Step 3: Run verify tests**

```bash
npx vitest run tests/api/verify.test.ts 2>&1 | tail -10
```

Expected: 5/5 PASS.

- [ ] **Step 4: Add campaign_closed state to scan page**

In `src/app/scan/page.tsx`, find the result takeover section and add a branch for `campaign_closed`:

Find the block starting with:
```tsx
            ) : result.reason === 'already_used' ? (
```

And ensure the full result section handles the new reason. Replace the entire result takeover `<div>` content (the nested content inside the `onClick={handleDismiss}` div) with:

```tsx
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
            ) : result.reason === 'campaign_closed' ? (
              <>
                <p className="text-white text-3xl font-bold">Campaign closed</p>
                <p className="text-white/80 text-lg">No further gifts can be claimed</p>
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
```

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/verify/\[token\]/route.ts src/app/scan/page.tsx tests/api/verify.test.ts
git commit -m "feat: verify route checks campaign closed_at; scan page shows closed state"
```
