# Distributor Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-session scan history (bottom sheet on the scan page) and multi-distributor assignment per campaign (DB table, assignment UI, verify-route restriction, and name display in the employee table).

**Architecture:** Scan history is pure in-memory state on the scan page — no backend. Multi-distributor uses a new `campaign_distributors` join table. The verify route gains a distributor restriction check after the existing `closed_at` check (from the campaign-management plan). The `EmployeeTable` fetches a `userId → name` map from the distributors endpoint to display names instead of UUIDs in the "Distributor" column. A `DistributorAssignment` card lives in the campaign detail left rail, hidden after launch.

**Important:** This plan assumes the campaign-management plan has already been applied. The `types/index.ts` already has `not_authorized` in `TokenVerifyResult` and the verify route already has the `closed_at` check structure.

**Tech Stack:** Next.js 15 App Router, React 19, Supabase Postgres + browser client, Tailwind v4, Vitest.

**Run tests with:** `npx vitest run`

---

## File Map

| Action | Path |
|--------|------|
| Create | `supabase/migrations/008_campaign_distributors.sql` |
| Create | `src/app/api/campaigns/[id]/distributors/route.ts` |
| Create | `src/app/api/campaigns/[id]/distributors/[userId]/route.ts` |
| Create | `src/components/admin/DistributorAssignment.tsx` |
| Modify | `src/app/admin/campaigns/[id]/page.tsx` |
| Modify | `src/components/admin/EmployeeTable.tsx` |
| Modify | `src/app/api/verify/[token]/route.ts` |
| Modify | `src/app/scan/page.tsx` |
| Create | `tests/api/distributors.test.ts` |
| Modify | `tests/api/verify.test.ts` |

---

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/008_campaign_distributors.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/008_campaign_distributors.sql`:

```sql
CREATE TABLE IF NOT EXISTS campaign_distributors (
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS campaign_distributors_campaign_idx
  ON campaign_distributors (campaign_id);
```

- [ ] **Step 2: Apply migration to Supabase**

Open the Supabase dashboard → SQL editor, paste and run the SQL above.

Verify: Table Editor shows a `campaign_distributors` table with columns `campaign_id` and `user_id`.

- [ ] **Step 3: Commit**

```bash
cd /Users/omer.melamed/Desktop/private/qr-gift-delivery
git add supabase/migrations/008_campaign_distributors.sql
git commit -m "feat: add campaign_distributors migration"
```

---

### Task 2: Distributor API routes

**Files:**
- Create: `src/app/api/campaigns/[id]/distributors/route.ts`
- Create: `src/app/api/campaigns/[id]/distributors/[userId]/route.ts`
- Create: `tests/api/distributors.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/api/distributors.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()
const mockGetUserById = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({
    from: mockFromService,
    auth: { admin: { getUserById: mockGetUserById } },
  }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['campaigns:launch']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

function adminUser() {
  return {
    data: {
      user: {
        id: 'admin-1',
        app_metadata: { company_id: 'co-1', role_id: 'role-1', role_name: 'company_admin' },
      },
    },
  }
}

describe('GET /api/campaigns/[id]/distributors', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    const { hasPermission } = vi.mocked(require('@/lib/permissions'))
    hasPermission.mockReturnValue(true)
    mockGetUser.mockResolvedValue(adminUser())
  })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { GET } = await import('@/app/api/campaigns/[id]/distributors/route')
    const req = new NextRequest('http://localhost/api/campaigns/c-1/distributors')
    const res = await GET(req, { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns list of assigned distributors', async () => {
    mockFromService.mockImplementation((table: string) => {
      if (table === 'campaign_distributors') {
        return {
          select: () => ({
            eq: () => Promise.resolve({
              data: [{ user_id: 'u-1' }, { user_id: 'u-2' }],
              error: null,
            }),
          }),
        }
      }
    })
    mockGetUserById
      .mockResolvedValueOnce({ data: { user: { id: 'u-1', email: 'a@co.com', user_metadata: { full_name: 'Alice' } } }, error: null })
      .mockResolvedValueOnce({ data: { user: { id: 'u-2', email: 'b@co.com', user_metadata: {} } }, error: null })

    const { GET } = await import('@/app/api/campaigns/[id]/distributors/route')
    const req = new NextRequest('http://localhost/api/campaigns/c-1/distributors')
    const res = await GET(req, { params: Promise.resolve({ id: 'c-1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.distributors).toHaveLength(2)
    expect(body.distributors[0]).toMatchObject({ userId: 'u-1', name: 'Alice', email: 'a@co.com' })
  })
})

describe('POST /api/campaigns/[id]/distributors', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetUser.mockResolvedValue(adminUser())
    const { hasPermission } = vi.mocked(require('@/lib/permissions'))
    hasPermission.mockReturnValue(true)
  })

  it('inserts a distributor assignment', async () => {
    let inserted: unknown = null
    mockFromService.mockReturnValue({
      insert: (row: unknown) => { inserted = row; return Promise.resolve({ error: null }) },
    })
    const { POST } = await import('@/app/api/campaigns/[id]/distributors/route')
    const req = new NextRequest('http://localhost/api/campaigns/c-1/distributors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'u-scanner' }),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'c-1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(inserted).toMatchObject({ campaign_id: 'c-1', user_id: 'u-scanner' })
  })

  it('returns 400 when userId missing', async () => {
    const { POST } = await import('@/app/api/campaigns/[id]/distributors/route')
    const req = new NextRequest('http://localhost/api/campaigns/c-1/distributors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const res = await POST(req, { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/campaigns/[id]/distributors/[userId]', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetUser.mockResolvedValue(adminUser())
    const { hasPermission } = vi.mocked(require('@/lib/permissions'))
    hasPermission.mockReturnValue(true)
  })

  it('removes a distributor assignment', async () => {
    let deleted = false
    mockFromService.mockReturnValue({
      delete: () => ({
        eq: () => ({ eq: () => { deleted = true; return Promise.resolve({ error: null }) } }),
      }),
    })
    const { DELETE } = await import('@/app/api/campaigns/[id]/distributors/[userId]/route')
    const req = new NextRequest('http://localhost/api/campaigns/c-1/distributors/u-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'c-1', userId: 'u-1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(deleted).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/api/distributors.test.ts 2>&1 | tail -10
```

Expected: FAIL — cannot find modules.

- [ ] **Step 3: Implement GET and POST route**

Create `src/app/api/campaigns/[id]/distributors/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: rows } = await service
    .from('campaign_distributors')
    .select('user_id')
    .eq('campaign_id', campaignId)

  const distributors = await Promise.all(
    (rows ?? []).map(async (row) => {
      const { data: { user: u } } = await service.auth.admin.getUserById(row.user_id)
      return {
        userId: row.user_id,
        name: u?.user_metadata?.full_name ?? u?.email?.split('@')[0] ?? row.user_id,
        email: u?.email ?? '',
      }
    })
  )

  return NextResponse.json({ distributors })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const userId: string | undefined = body.userId
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const service = createServiceClient()
  await service.from('campaign_distributors').insert({ campaign_id: campaignId, user_id: userId })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Implement DELETE route**

Create `src/app/api/campaigns/[id]/distributors/[userId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const { id: campaignId, userId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  await service
    .from('campaign_distributors')
    .delete()
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/api/distributors.test.ts 2>&1 | tail -15
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/campaigns/\[id\]/distributors/ tests/api/distributors.test.ts
git commit -m "feat: add distributor assignment API routes (GET/POST/DELETE)"
```

---

### Task 3: DistributorAssignment component

**Files:**
- Create: `src/components/admin/DistributorAssignment.tsx`

This card lists assigned distributors, shows an add button that opens a dropdown of scanner-role users in the company, and an × button to remove each. It appears in the campaign detail left rail only before launch (`sent_at` is null).

- [ ] **Step 1: Create DistributorAssignment component**

Create `src/components/admin/DistributorAssignment.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

type Distributor = { userId: string; name: string; email: string }
type ScannerUser = { id: string; name: string; email: string }

export function DistributorAssignment({ campaignId }: { campaignId: string }) {
  const [distributors, setDistributors] = useState<Distributor[]>([])
  const [scanners, setScanners] = useState<ScannerUser[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}/distributors`)
      .then((r) => r.json())
      .then((data) => setDistributors(data.distributors ?? []))
  }, [campaignId])

  async function loadScanners() {
    const supabase = createClient()
    // Fetch scanner-role users in the company via user_company_roles joined with roles
    const { data } = await supabase
      .from('user_company_roles')
      .select('user_id, roles(name)')
    // Filter to scanner role only — user metadata fetched from our auth
    // We use the existing GET distributors endpoint pattern; for the picker we
    // fetch from a simple Supabase query and use display names from user_metadata.
    // Since we can't list auth users from the browser client, we call an API.
    // Reuse the existing team members approach: call the team page data.
    // For simplicity, we get the full user list from the API and filter client-side.
    const res = await fetch('/api/team/scanners')
    if (res.ok) {
      const json = await res.json()
      setScanners(json.scanners ?? [])
    }
  }

  async function handleAdd(scanner: ScannerUser) {
    setShowPicker(false)
    setLoading(true)
    try {
      await fetch(`/api/campaigns/${campaignId}/distributors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: scanner.id }),
      })
      setDistributors((prev) => [...prev, { userId: scanner.id, name: scanner.name, email: scanner.email }])
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove(userId: string) {
    await fetch(`/api/campaigns/${campaignId}/distributors/${userId}`, { method: 'DELETE' })
    setDistributors((prev) => prev.filter((d) => d.userId !== userId))
  }

  const assignedIds = new Set(distributors.map((d) => d.userId))
  const availableScanners = scanners.filter((s) => !assignedIds.has(s.id))

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h2 className="font-semibold text-zinc-900 mb-1">Distributors</h2>
      <p className="text-xs text-zinc-400 mb-4">
        {distributors.length === 0
          ? 'Any scanner can scan this campaign'
          : `${distributors.length} assigned`}
      </p>

      {distributors.length > 0 && (
        <ul className="flex flex-col gap-2 mb-4">
          {distributors.map((d) => (
            <li key={d.userId} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-800 truncate">{d.name}</p>
                <p className="text-xs text-zinc-400 truncate">{d.email}</p>
              </div>
              <button
                onClick={() => handleRemove(d.userId)}
                aria-label={`Remove ${d.name}`}
                className="text-zinc-300 hover:text-red-400 transition-colors flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <button
          onClick={() => { setShowPicker(true); loadScanners() }}
          disabled={loading}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
        >
          + Add distributor
        </button>

        {showPicker && (
          <div className="absolute top-6 left-0 z-20 bg-white border border-zinc-200 rounded-xl shadow-lg p-2 w-64">
            {availableScanners.length === 0 ? (
              <p className="text-sm text-zinc-400 px-2 py-1">No available scanners</p>
            ) : (
              availableScanners.map((s) => (
                <button
                  key={s.id}
                  onClick={() => handleAdd(s)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  <p className="text-sm font-medium text-zinc-800">{s.name}</p>
                  <p className="text-xs text-zinc-400">{s.email}</p>
                </button>
              ))
            )}
            <button
              onClick={() => setShowPicker(false)}
              className="w-full text-center text-xs text-zinc-400 mt-1 pt-1 border-t border-zinc-100 hover:text-zinc-600"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create /api/team/scanners route**

The `DistributorAssignment` component fetches scanner-role users from `/api/team/scanners`. Create this route:

Create `src/app/api/team/scanners/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Get scanner-role users for this company
  const { data: ucr } = await service
    .from('user_company_roles')
    .select('user_id, roles(name)')
    .eq('company_id', appMeta.company_id)

  const scannerUserIds = (ucr ?? [])
    .filter((row) => {
      const role = row.roles as { name: string } | null
      return role?.name === 'scanner'
    })
    .map((row) => row.user_id)

  const scanners = await Promise.all(
    scannerUserIds.map(async (userId) => {
      const { data: { user: u } } = await service.auth.admin.getUserById(userId)
      return {
        id: userId,
        name: u?.user_metadata?.full_name ?? u?.email?.split('@')[0] ?? userId,
        email: u?.email ?? '',
      }
    })
  )

  return NextResponse.json({ scanners })
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "DistributorAssignment|scanners"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/DistributorAssignment.tsx src/app/api/team/scanners/route.ts
git commit -m "feat: add DistributorAssignment component and /api/team/scanners route"
```

---

### Task 4: Add DistributorAssignment to campaign detail left rail

**Files:**
- Modify: `src/app/admin/campaigns/[id]/page.tsx`

- [ ] **Step 1: Add DistributorAssignment to the left rail**

In `src/app/admin/campaigns/[id]/page.tsx`, add the import at the top:

```typescript
import { DistributorAssignment } from '@/components/admin/DistributorAssignment'
```

Then find the left rail section (the `<div className="w-72 flex-shrink-0 flex flex-col gap-4">`) and add the `DistributorAssignment` card after `RedemptionProgress` and before `TokenUploader`. The distributor card is visible only before `sent_at` is set:

```tsx
        <div className="w-72 flex-shrink-0 flex flex-col gap-4">
          <RedemptionProgress
            campaignId={campaign.id}
            initialClaimed={claimedCount}
            total={allTokens.length}
          />
          {!campaign.sent_at && (
            <DistributorAssignment campaignId={campaign.id} />
          )}
          {!campaign.sent_at && (
            <TokenUploader campaignId={campaign.id} />
          )}
        </div>
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "campaigns/\[id\]"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/campaigns/\[id\]/page.tsx
git commit -m "feat: add DistributorAssignment card to campaign detail left rail"
```

---

### Task 5: Update verify route — distributor restriction

**Files:**
- Modify: `src/app/api/verify/[token]/route.ts`
- Modify: `tests/api/verify.test.ts`

The verify route already checks `closed_at` (from the campaign-management plan). Now add a distributor check after the closed check: if `campaign_distributors` has rows for the campaign AND the `distributorId` is not in that set, return `not_authorized`.

- [ ] **Step 1: Update the verify route**

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

  // Fetch token row with campaign info in one query
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

  // Distributor restriction: if any rows exist in campaign_distributors for this campaign,
  // the scanning user must be one of them.
  const { data: assignedDistributors } = await supabase
    .from('campaign_distributors')
    .select('user_id')
    .eq('campaign_id', tokenRow.campaign_id)

  if (assignedDistributors && assignedDistributors.length > 0) {
    const assignedIds = new Set(assignedDistributors.map((r) => r.user_id))
    if (!distributorId || !assignedIds.has(distributorId)) {
      return NextResponse.json({ valid: false, reason: 'not_authorized' })
    }
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

- [ ] **Step 2: Update verify tests to cover distributor restriction**

Replace the full `tests/api/verify.test.ts` with an updated version that adds distributor tests. The mock needs two `from()` call paths — one for `gift_tokens` and one for `campaign_distributors`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockTokenSelectSingle = vi.fn()
const mockDistributorSelect = vi.fn()
const mockUpdateSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'campaign_distributors') {
        return { select: () => ({ eq: mockDistributorSelect }) }
      }
      // gift_tokens
      return {
        select: () => ({ eq: () => ({ single: mockTokenSelectSingle }) }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({ single: mockUpdateSingle }),
            }),
          }),
        }),
      }
    },
  }),
}))

function makeRequest(token: string, distributorId: string | null = null) {
  return new NextRequest(`http://localhost/api/verify/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ distributorId }),
  })
}

const openToken = {
  id: 't-1',
  employee_name: 'Omer',
  redeemed: false,
  campaign_id: 'c-1',
  campaigns: { closed_at: null },
}

describe('POST /api/verify/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no distributor restrictions
    mockDistributorSelect.mockResolvedValue({ data: [], error: null })
  })

  it('returns invalid when token does not exist', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: null, error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('nonexistent'), { params: Promise.resolve({ token: 'nonexistent' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('invalid')
  })

  it('returns campaign_closed when campaign is closed', async () => {
    mockTokenSelectSingle.mockResolvedValue({
      data: { ...openToken, campaigns: { closed_at: '2026-04-10' } },
      error: null,
    })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('some-token'), { params: Promise.resolve({ token: 'some-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('campaign_closed')
  })

  it('returns not_authorized when distributor not in assignment list', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: openToken, error: null })
    mockDistributorSelect.mockResolvedValue({ data: [{ user_id: 'other-scanner' }], error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('some-token', 'wrong-scanner'), { params: Promise.resolve({ token: 'some-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('not_authorized')
  })

  it('allows scan when distributor is in assignment list', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: openToken, error: null })
    mockDistributorSelect.mockResolvedValue({ data: [{ user_id: 'authorized-scanner' }], error: null })
    mockUpdateSingle.mockResolvedValue({ data: { employee_name: 'Omer' }, error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('some-token', 'authorized-scanner'), { params: Promise.resolve({ token: 'some-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.employeeName).toBe('Omer')
  })

  it('allows any scanner when campaign_distributors is empty (backwards compat)', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: openToken, error: null })
    mockDistributorSelect.mockResolvedValue({ data: [], error: null })
    mockUpdateSingle.mockResolvedValue({ data: { employee_name: 'Omer' }, error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('some-token', 'any-scanner'), { params: Promise.resolve({ token: 'some-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(true)
  })

  it('returns already_used when token is already redeemed', async () => {
    mockTokenSelectSingle.mockResolvedValue({
      data: { ...openToken, redeemed: true, employee_name: 'Dana' },
      error: null,
    })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('used-token'), { params: Promise.resolve({ token: 'used-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('already_used')
  })

  it('returns valid:true on successful first scan', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: openToken, error: null })
    mockUpdateSingle.mockResolvedValue({ data: { employee_name: 'Omer' }, error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('valid-token'), { params: Promise.resolve({ token: 'valid-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.employeeName).toBe('Omer')
  })
})
```

- [ ] **Step 3: Run verify tests**

```bash
npx vitest run tests/api/verify.test.ts 2>&1 | tail -15
```

Expected: all PASS.

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/verify/\[token\]/route.ts tests/api/verify.test.ts
git commit -m "feat: verify route checks distributor assignment before redemption"
```

---

### Task 6: Scan page — history bottom sheet + not_authorized state

**Files:**
- Modify: `src/app/scan/page.tsx`

Add two things: (1) a `scanHistory` state array that records each scan result; (2) a "History" pill button in the bottom-right that slides up a bottom sheet showing the last 10 scans; (3) a `not_authorized` result state.

- [ ] **Step 1: Replace scan page**

Replace the full content of `src/app/scan/page.tsx`:

```tsx
'use client'

import { useState, useCallback, useEffect } from 'react'
import { QrScanner } from '@/components/QrScanner'
import { createClient } from '@/lib/supabase/browser'
import type { TokenVerifyResult } from '@/types'

type ScanState = 'scanning' | 'loading' | 'result'
type ScanOutcome = 'success' | 'already_claimed' | 'invalid' | 'closed' | 'not_authorized'

type ScanHistoryEntry = {
  employeeName: string | null
  outcome: ScanOutcome
  timestamp: Date
}

const TOKEN_PATTERN = /\/verify\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

function outcomeFromResult(result: TokenVerifyResult): ScanOutcome {
  if (result.valid) return 'success'
  if (result.reason === 'already_used') return 'already_claimed'
  if (result.reason === 'campaign_closed') return 'closed'
  if (result.reason === 'not_authorized') return 'not_authorized'
  return 'invalid'
}

export default function ScanPage() {
  const [scanState, setScanState] = useState<ScanState>('scanning')
  const [result, setResult] = useState<TokenVerifyResult | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [scanHistory, setScanHistory] = useState<ScanHistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)

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
        const r: TokenVerifyResult = { valid: false, reason: 'invalid' }
        setResult(r)
        setScanHistory((prev) => [{ employeeName: null, outcome: 'invalid', timestamp: new Date() }, ...prev].slice(0, 10))
        setScanState('result')
        return
      }

      const token = match[1]
      let r: TokenVerifyResult = { valid: false, reason: 'invalid' }
      try {
        const res = await fetch(`/api/verify/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ distributorId: userId }),
        })
        r = await res.json()
      } catch {
        r = { valid: false, reason: 'invalid' }
      }

      const employeeName = r.valid ? r.employeeName : (r.reason === 'already_used' ? r.employeeName : null)
      setScanHistory((prev) => [{
        employeeName: employeeName ?? null,
        outcome: outcomeFromResult(r),
        timestamp: new Date(),
      }, ...prev].slice(0, 10))
      setResult(r)
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

        {/* Scan frame overlay */}
        {scanState === 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="relative w-52 h-52">
              <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-indigo-400 rounded-tl-lg" />
              <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-indigo-400 rounded-tr-lg" />
              <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-indigo-400 rounded-bl-lg" />
              <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-indigo-400 rounded-br-lg" />
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
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg">
              <span className="text-4xl">{result.valid ? '✓' : '✗'}</span>
            </div>

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
            ) : result.reason === 'not_authorized' ? (
              <>
                <p className="text-white text-3xl font-bold">Not authorised</p>
                <p className="text-white/80 text-lg">You are not assigned to this campaign</p>
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

        {/* History button — always visible unless result takeover is showing */}
        {scanState !== 'result' && (
          <button
            onClick={() => setShowHistory(true)}
            className="absolute bottom-8 right-6 bg-zinc-800/80 text-white text-sm font-medium px-4 py-2 rounded-full backdrop-blur-sm"
          >
            History {scanHistory.length > 0 && `(${scanHistory.length})`}
          </button>
        )}

        {/* History bottom sheet */}
        {showHistory && (
          <div
            className="absolute inset-0 flex flex-col justify-end z-30"
            onClick={() => setShowHistory(false)}
          >
            <div
              className="bg-zinc-900/95 rounded-t-2xl p-5 max-h-[60vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-white font-semibold">Recent scans</h2>
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-zinc-400 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {scanHistory.length === 0 ? (
                <p className="text-zinc-400 text-sm text-center py-6">No scans yet this session</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {scanHistory.map((entry, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        entry.outcome === 'success' ? 'bg-green-500/20' : 'bg-red-500/20'
                      }`}>
                        {entry.outcome === 'success' ? (
                          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                          {entry.employeeName ?? (entry.outcome === 'invalid' ? 'Invalid QR code' : entry.outcome === 'not_authorized' ? 'Not authorised' : entry.outcome === 'closed' ? 'Campaign closed' : 'Unknown')}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className={`text-xs font-medium flex-shrink-0 ${
                        entry.outcome === 'success' ? 'text-green-400' :
                        entry.outcome === 'already_claimed' ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {entry.outcome === 'success' ? 'Claimed' :
                         entry.outcome === 'already_claimed' ? 'Already claimed' :
                         entry.outcome === 'closed' ? 'Closed' :
                         entry.outcome === 'not_authorized' ? 'Not auth.' : 'Invalid'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "scan/page"
```

Expected: no output.

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/scan/page.tsx
git commit -m "feat: scan page adds history bottom sheet and not_authorized state"
```

---

### Task 7: EmployeeTable — distributor name lookup

**Files:**
- Modify: `src/components/admin/EmployeeTable.tsx`

On mount (when `campaign.sent_at` is set), fetch `/api/campaigns/[id]/distributors` and build a `userId → name` map. The "Distributor" column renders the name instead of the raw UUID.

- [ ] **Step 1: Add distributor name map to EmployeeTable**

In `src/components/admin/EmployeeTable.tsx`, the component receives `campaignId` and `isDraft`. When `!isDraft` (campaign is sent), fetch the distributors endpoint on mount.

Add a `distributorNames` state after the existing state declarations:

```tsx
const [distributorNames, setDistributorNames] = useState<Record<string, string>>({})
```

Add a new `useEffect` (after the existing Realtime `useEffect`) to fetch names when the campaign is sent:

```tsx
useEffect(() => {
  if (isDraft) return
  fetch(`/api/campaigns/${campaignId}/distributors`)
    .then((r) => r.json())
    .then((data) => {
      const map: Record<string, string> = {}
      for (const d of data.distributors ?? []) {
        map[d.userId] = d.name
      }
      setDistributorNames(map)
    })
    .catch(() => {})
}, [campaignId, isDraft])
```

Then update the "Distributor" column cell in both the flat and grouped render paths (wherever `r.redeemed_by` is displayed):

Old pattern (appears twice — once in flat rows, once in grouped rows):
```tsx
                  <td className="px-3 py-2.5 text-xs text-zinc-400">
                    {r.redeemed_by ?? <span className="text-zinc-300">—</span>}
                  </td>
```

New pattern (replace all occurrences):
```tsx
                  <td className="px-3 py-2.5 text-xs text-zinc-400">
                    {r.redeemed_by
                      ? distributorNames[r.redeemed_by] ?? r.redeemed_by
                      : <span className="text-zinc-300">—</span>}
                  </td>
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "EmployeeTable"
```

Expected: no output.

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/EmployeeTable.tsx
git commit -m "feat: EmployeeTable shows distributor names instead of UUIDs"
```
