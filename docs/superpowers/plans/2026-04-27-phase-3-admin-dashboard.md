# Phase 3 — Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the HR admin interface — campaign creation, CSV/XLSX employee upload with preview, live redemption tracking via Supabase Realtime, bulk resend, and CSV export.

**Architecture:** Server components + client islands. Pages are React Server Components. `TokenUploader`, `RedemptionProgress`, `EmployeeTable`, and `LaunchButton` are `'use client'` components mounted inside server-rendered pages. All mutations go through API routes using the existing auth + permission pattern. Multi-tenant: every query is scoped to `company_id` from the authenticated user's JWT.

**Tech Stack:** Next.js 16.2.4 (App Router) · TypeScript · Tailwind CSS · Supabase (`@supabase/ssr`, Realtime) · `xlsx` npm package · Vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/005_admin_columns.sql` | Create | Add `campaign_date`, `department` columns + new permissions |
| `src/types/index.ts` | Modify | Add `campaign_date` to `Campaign`, `department` to `GiftToken` |
| `src/lib/phone.ts` | Create | Shared phone normalisation (E.164, Israeli formats) |
| `src/app/api/campaigns/route.ts` | Create | `POST /api/campaigns` — create draft campaign |
| `src/app/api/campaigns/[id]/tokens/route.ts` | Create | `POST /api/campaigns/[id]/tokens` — bulk insert employees |
| `src/app/api/campaigns/[id]/resend/route.ts` | Create | `POST /api/campaigns/[id]/resend` — resend to unclaimed |
| `src/app/api/campaigns/[id]/export/route.ts` | Create | `GET /api/campaigns/[id]/export` — stream CSV |
| `src/app/admin/layout.tsx` | Create | Session + admin role guard |
| `src/app/admin/page.tsx` | Create | Campaign list (server component) |
| `src/app/admin/campaigns/new/page.tsx` | Create | New campaign form (client component) |
| `src/components/admin/TokenUploader.tsx` | Create | File picker, parse, preview, confirm upload |
| `src/components/admin/LaunchButton.tsx` | Create | Launch campaign button (client) |
| `src/components/admin/RedemptionProgress.tsx` | Create | Live progress bar (Realtime) |
| `src/components/admin/EmployeeTable.tsx` | Create | Live employee table (Realtime, resend, export) |
| `src/app/admin/campaigns/[id]/page.tsx` | Create | Campaign detail (server shell) |
| `tests/api/campaigns.test.ts` | Create | Tests for create campaign route |
| `tests/api/tokens.test.ts` | Create | Tests for bulk token insert route |
| `tests/api/resend.test.ts` | Create | Tests for resend route |
| `tests/api/export.test.ts` | Create | Tests for export route |

---

## Task 1: Setup — migration, types, phone lib, xlsx package

**Files:**
- Create: `supabase/migrations/005_admin_columns.sql`
- Modify: `src/types/index.ts`
- Create: `src/lib/phone.ts`
- Run: `npm install xlsx`

- [ ] **Step 1: Install xlsx**

```bash
npm install xlsx
```

Expected: `xlsx` appears in `package.json` dependencies.

- [ ] **Step 2: Create migration**

Create `supabase/migrations/005_admin_columns.sql`:

```sql
-- Add campaign date to campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS campaign_date DATE;

-- Add optional department to gift_tokens
ALTER TABLE gift_tokens ADD COLUMN IF NOT EXISTS department TEXT;

-- Add campaigns:manage permission for token upload, resend, export
-- (campaigns:create, campaigns:launch, reports:export already exist)
-- No new permissions needed — existing ones cover Phase 3 routes:
--   campaigns:create  → POST /api/campaigns, POST /api/campaigns/[id]/tokens
--   campaigns:launch  → POST /api/campaigns/[id]/resend
--   reports:export    → GET /api/campaigns/[id]/export
```

- [ ] **Step 3: Update types**

Open `src/types/index.ts`. Add `campaign_date` to `Campaign` and `department` to `GiftToken`:

```ts
export type Campaign = {
  id: string
  company_id: string
  name: string
  campaign_date: string | null
  created_by: string | null
  created_at: string
  sent_at: string | null
}

export type GiftToken = {
  id: string
  campaign_id: string
  employee_name: string
  phone_number: string
  department: string | null
  token: string
  qr_image_url: string | null
  sms_sent_at: string | null
  redeemed: boolean
  redeemed_at: string | null
  redeemed_by: string | null
}
```

- [ ] **Step 4: Create phone normalisation lib**

Create `src/lib/phone.ts`:

```ts
const E164_RE = /^\+[1-9]\d{6,14}$/
const IL_LOCAL_RE = /^0(\d{9})$/

/**
 * Normalises a phone string to E.164.
 * Strips spaces, dashes, dots, parens.
 * Converts Israeli local format (05XXXXXXXX) to +972XXXXXXXXX.
 * Returns null if the result is not valid E.164.
 */
export function normalizePhone(raw: string): string | null {
  const digits = (raw ?? '').replace(/[\s\-.()]/g, '')
  if (E164_RE.test(digits)) return digits
  const local = IL_LOCAL_RE.exec(digits)
  if (local) return `+972${local[1]}`
  return null
}
```

- [ ] **Step 5: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/005_admin_columns.sql src/types/index.ts src/lib/phone.ts package.json package-lock.json
git commit -m "chore: add campaign_date/department columns, phone lib, xlsx package"
```

---

## Task 2: `POST /api/campaigns` — create draft campaign

**Files:**
- Create: `src/app/api/campaigns/route.ts`
- Create: `tests/api/campaigns.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/api/campaigns.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/campaigns', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          app_metadata: { company_id: 'company-1', role_id: 'role-1', role_name: 'company_admin' },
        },
      },
    })
  })

  afterEach(() => { vi.unstubAllEnvs() })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('@/app/api/campaigns/route')
    const res = await POST(makeRequest({ name: 'Test', campaignDate: '2026-04-30' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when missing permission', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)
    const { POST } = await import('@/app/api/campaigns/route')
    const res = await POST(makeRequest({ name: 'Test', campaignDate: '2026-04-30' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('@/app/api/campaigns/route')
    const res = await POST(makeRequest({ campaignDate: '2026-04-30' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('name') })
  })

  it('returns 400 when campaignDate is missing', async () => {
    const { POST } = await import('@/app/api/campaigns/route')
    const res = await POST(makeRequest({ name: 'Passover 2026' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('campaignDate') })
  })

  it('creates campaign and returns id', async () => {
    mockFromService.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: 'campaign-new' }, error: null }),
        }),
      }),
    })
    const { POST } = await import('@/app/api/campaigns/route')
    const res = await POST(makeRequest({ name: 'Passover 2026', campaignDate: '2026-04-30' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'campaign-new' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/api/campaigns.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/campaigns/route'`

- [ ] **Step 3: Create the route**

Create `src/app/api/campaigns/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'campaigns:create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { name, campaignDate } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!campaignDate || typeof campaignDate !== 'string') {
    return NextResponse.json({ error: 'campaignDate is required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('campaigns')
    .insert({
      name: name.trim(),
      campaign_date: campaignDate,
      company_id: appMeta.company_id,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/api/campaigns.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: Run full suite to check for regressions**

```bash
npm test
```

Expected: all tests pass (29 existing + 5 new = 34 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/campaigns/route.ts tests/api/campaigns.test.ts
git commit -m "feat: add POST /api/campaigns create campaign route"
```

---

## Task 3: `POST /api/campaigns/[id]/tokens` — bulk insert employees

**Files:**
- Create: `src/app/api/campaigns/[id]/tokens/route.ts`
- Create: `tests/api/tokens.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/api/tokens.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
  return new NextRequest(`http://localhost/api/campaigns/${id}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/campaigns/[id]/tokens', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          app_metadata: { company_id: 'company-1', role_id: 'role-1', role_name: 'company_admin' },
        },
      },
    })
  })

  afterEach(() => { vi.unstubAllEnvs() })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('@/app/api/campaigns/[id]/tokens/route')
    const res = await POST(makeRequest('c-1', { rows: [] }), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign not in company', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'not found' } }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/tokens/route')
    const res = await POST(makeRequest('bad', { rows: [] }), { params: Promise.resolve({ id: 'bad' }) })
    expect(res.status).toBe(404)
  })

  it('returns 409 when campaign already sent', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: '2026-04-01' }, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/tokens/route')
    const res = await POST(makeRequest('c-1', { rows: [] }), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(409)
  })

  it('inserts valid rows, skips invalid rows', async () => {
    let callCount = 0
    mockFromService.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // campaign lookup
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null }, error: null }) }) }) }),
        }
      }
      // delete unsent + insert
      return {
        delete: () => ({ eq: () => ({ is: () => Promise.resolve({ error: null }) }) }),
        insert: () => Promise.resolve({ error: null }),
      }
    })

    const { POST } = await import('@/app/api/campaigns/[id]/tokens/route')
    const res = await POST(
      makeRequest('c-1', {
        rows: [
          { name: 'Omer', phone_number: '0501234567' },           // valid — Israeli local
          { name: 'Dana', phone_number: '+14155552671' },          // valid — E.164
          { name: '', phone_number: '0501234567' },                // invalid — missing name
          { name: 'Bad', phone_number: 'not-a-phone' },           // invalid — bad phone
        ],
      }),
      { params: Promise.resolve({ id: 'c-1' }) }
    )

    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.inserted).toBe(2)
    expect(body.skipped).toBe(2)
    expect(body.errors).toHaveLength(2)
  })

  it('normalises Israeli local phone to E.164', async () => {
    let insertedRows: unknown[] = []
    let callCount = 0
    mockFromService.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null }, error: null }) }) }) }),
        }
      }
      return {
        delete: () => ({ eq: () => ({ is: () => Promise.resolve({ error: null }) }) }),
        insert: (rows: unknown[]) => { insertedRows = rows; return Promise.resolve({ error: null }) },
      }
    })

    const { POST } = await import('@/app/api/campaigns/[id]/tokens/route')
    await POST(
      makeRequest('c-1', { rows: [{ name: 'Omer', phone_number: '050-123-4567' }] }),
      { params: Promise.resolve({ id: 'c-1' }) }
    )

    expect(insertedRows).toHaveLength(1)
    expect((insertedRows[0] as { phone_number: string }).phone_number).toBe('+9720501234567')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/api/tokens.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/campaigns/[id]/tokens/route'`

- [ ] **Step 3: Create the route**

Create `src/app/api/campaigns/[id]/tokens/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { normalizePhone } from '@/lib/phone'
import type { JwtAppMetadata } from '@/types'

type InputRow = { name: string; phone_number: string; department?: string }
type InsertRow = { campaign_id: string; employee_name: string; phone_number: string; department: string | null }
type RowError = { row: number; reason: string }

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'campaigns:create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, sent_at')
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (campaign.sent_at) return NextResponse.json({ error: 'Campaign already sent' }, { status: 409 })

  const body = await request.json().catch(() => ({}))
  const rows: InputRow[] = body.rows ?? []

  const valid: InsertRow[] = []
  const errors: RowError[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row.name?.trim()) { errors.push({ row: i, reason: 'Missing name' }); continue }
    const phone = normalizePhone(row.phone_number ?? '')
    if (!phone) { errors.push({ row: i, reason: 'Invalid phone number' }); continue }
    valid.push({
      campaign_id: campaignId,
      employee_name: row.name.trim(),
      phone_number: phone,
      department: row.department?.trim() || null,
    })
  }

  if (valid.length > 0) {
    await service.from('gift_tokens').delete().eq('campaign_id', campaignId).is('sms_sent_at', null)
    const { error: insertError } = await service.from('gift_tokens').insert(valid)
    if (insertError) return NextResponse.json({ error: 'Failed to insert employees' }, { status: 500 })
  }

  return NextResponse.json({ inserted: valid.length, skipped: errors.length, errors })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/api/tokens.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all tests pass (34 + 5 = 39 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/campaigns/[id]/tokens/route.ts tests/api/tokens.test.ts src/lib/phone.ts
git commit -m "feat: add POST /api/campaigns/[id]/tokens bulk employee insert"
```

---

## Task 4: `POST /api/campaigns/[id]/resend` — resend to unclaimed

**Files:**
- Create: `src/app/api/campaigns/[id]/resend/route.ts`
- Create: `tests/api/resend.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/api/resend.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()
const mockSendGiftMMS = vi.fn().mockResolvedValue({ sid: 'mock' })

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({ from: mockFromService }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['campaigns:launch']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/twilio', () => ({ sendGiftMMS: mockSendGiftMMS }))

function makeRequest(id: string) {
  return new NextRequest(`http://localhost/api/campaigns/${id}/resend`, { method: 'POST' })
}

describe('POST /api/campaigns/[id]/resend', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    vi.stubEnv('TWILIO_MOCK', 'true')
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockSendGiftMMS.mockResolvedValue({ sid: 'mock' })
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          app_metadata: { company_id: 'company-1', role_id: 'role-1', role_name: 'company_admin' },
        },
      },
    })
  })

  afterEach(() => { vi.unstubAllEnvs() })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('@/app/api/campaigns/[id]/resend/route')
    const res = await POST(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign not in company', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'not found' } }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/resend/route')
    const res = await POST(makeRequest('bad'), { params: Promise.resolve({ id: 'bad' }) })
    expect(res.status).toBe(404)
  })

  it('returns dispatched=0 when no unclaimed tokens', async () => {
    let callCount = 0
    mockFromService.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', name: 'Test' }, error: null }) }) }) }),
        }
      }
      return {
        select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
      }
    })
    const { POST } = await import('@/app/api/campaigns/[id]/resend/route')
    const res = await POST(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.dispatched).toBe(0)
  })

  it('dispatches to unclaimed tokens in mock mode and does not call sendGiftMMS', async () => {
    let callCount = 0
    mockFromService.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', name: 'Passover 2026' }, error: null }) }) }) }),
        }
      }
      if (callCount === 2) {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({
                data: [{ id: 't-1', token: 'uuid-1', employee_name: 'Omer', phone_number: '+972501234567', qr_image_url: 'https://example.com/qr.png' }],
                error: null,
              }),
            }),
          }),
        }
      }
      return { update: () => ({ eq: () => Promise.resolve({ error: null }) }) }
    })

    const { POST } = await import('@/app/api/campaigns/[id]/resend/route')
    const res = await POST(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.dispatched).toBe(1)
    expect(body.failed).toBe(0)
    expect(mockSendGiftMMS).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/api/resend.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/campaigns/[id]/resend/route'`

- [ ] **Step 3: Create the route**

Create `src/app/api/campaigns/[id]/resend/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { sendGiftMMS } from '@/lib/twilio'
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'campaigns:launch')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, name')
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const { data: tokens } = await service
    .from('gift_tokens')
    .select('id, employee_name, phone_number, qr_image_url')
    .eq('campaign_id', campaignId)
    .eq('redeemed', false)

  if (!tokens || tokens.length === 0) {
    return NextResponse.json({ dispatched: 0, failed: 0 })
  }

  let dispatched = 0
  let failed = 0

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE)
    const results = await Promise.allSettled(
      batch.map(async (token) => {
        if (process.env.TWILIO_MOCK !== 'true') {
          await sendGiftMMS({
            to: token.phone_number,
            employeeName: token.employee_name,
            holidayName: campaign.name,
            qrImageUrl: token.qr_image_url ?? '',
          })
        }
        const { error: sentError } = await service
          .from('gift_tokens')
          .update({ sms_sent_at: new Date().toISOString() })
          .eq('id', token.id)
        if (sentError) throw new Error(sentError.message)
      })
    )
    for (const r of results) {
      if (r.status === 'fulfilled') dispatched++
      else { failed++; console.error('[resend] token failed:', r.reason) }
    }
    if (i + BATCH_SIZE < tokens.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS))
    }
  }

  return NextResponse.json({ dispatched, failed })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/api/resend.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all tests pass (39 + 4 = 43 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/campaigns/[id]/resend/route.ts tests/api/resend.test.ts
git commit -m "feat: add POST /api/campaigns/[id]/resend bulk resend to unclaimed"
```

---

## Task 5: `GET /api/campaigns/[id]/export` — CSV export

**Files:**
- Create: `src/app/api/campaigns/[id]/export/route.ts`
- Create: `tests/api/export.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/api/export.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({ from: mockFromService }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['reports:export']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

function makeRequest(id: string) {
  return new NextRequest(`http://localhost/api/campaigns/${id}/export`, { method: 'GET' })
}

describe('GET /api/campaigns/[id]/export', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          app_metadata: { company_id: 'company-1', role_id: 'role-1', role_name: 'company_admin' },
        },
      },
    })
  })

  afterEach(() => { vi.unstubAllEnvs() })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { GET } = await import('@/app/api/campaigns/[id]/export/route')
    const res = await GET(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign not found', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'not found' } }) }) }) }),
    })
    const { GET } = await import('@/app/api/campaigns/[id]/export/route')
    const res = await GET(makeRequest('bad'), { params: Promise.resolve({ id: 'bad' }) })
    expect(res.status).toBe(404)
  })

  it('returns CSV with correct headers and rows', async () => {
    let callCount = 0
    mockFromService.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1' }, error: null }) }) }) }),
        }
      }
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({
              data: [
                { employee_name: 'Omer', phone_number: '+972501234567', department: 'Engineering', sms_sent_at: '2026-04-01T10:00:00Z', redeemed: true, redeemed_at: '2026-04-01T12:00:00Z', redeemed_by: 'dist-1' },
              ],
              error: null,
            }),
          }),
        }),
      }
    })

    const { GET } = await import('@/app/api/campaigns/[id]/export/route')
    const res = await GET(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
    const text = await res.text()
    expect(text).toContain('name,phone_number,department')
    expect(text).toContain('Omer')
    expect(text).toContain('+972501234567')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/api/export.test.ts
```

Expected: FAIL — `Cannot find module '@/app/api/campaigns/[id]/export/route'`

- [ ] **Step 3: Create the route**

Create `src/app/api/campaigns/[id]/export/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'reports:export')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const { data: tokens } = await service
    .from('gift_tokens')
    .select('employee_name, phone_number, department, sms_sent_at, redeemed, redeemed_at, redeemed_by')
    .eq('campaign_id', campaignId)
    .order('employee_name')

  if (!tokens) return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 })

  function csvEscape(v: unknown): string {
    return `"${String(v ?? '').replace(/"/g, '""')}"`
  }

  const header = 'name,phone_number,department,sms_sent_at,redeemed,redeemed_at,redeemed_by'
  const rows = tokens.map((t) =>
    [t.employee_name, t.phone_number, t.department, t.sms_sent_at, t.redeemed, t.redeemed_at, t.redeemed_by]
      .map(csvEscape)
      .join(',')
  )
  const csv = [header, ...rows].join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="campaign-${campaignId}.csv"`,
    },
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/api/export.test.ts
```

Expected: 3 tests PASS

- [ ] **Step 5: Run full suite**

```bash
npm test
```

Expected: all tests pass (43 + 3 = 46 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/campaigns/[id]/export/route.ts tests/api/export.test.ts
git commit -m "feat: add GET /api/campaigns/[id]/export CSV download"
```

---

## Task 6: Admin layout + campaign list page

**Files:**
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/page.tsx`

No unit tests — server component auth patterns are integration-tested at runtime (same approach as `scan/layout.tsx`).

- [ ] **Step 1: Create admin layout**

Create `src/app/admin/layout.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

const ADMIN_ROLES: JwtAppMetadata['role_name'][] = ['company_admin', 'campaign_manager']

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const meta = user.app_metadata as JwtAppMetadata | undefined
  if (!meta?.role_name || !ADMIN_ROLES.includes(meta.role_name)) redirect('/login')
  return <>{children}</>
}
```

- [ ] **Step 2: Create campaign list page**

Create `src/app/admin/page.tsx`:

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
    <main className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <Link
          href="/admin/campaigns/new"
          className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          New Campaign
        </Link>
      </div>

      {list.length === 0 ? (
        <p className="text-gray-500">No campaigns yet. Create your first one.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {list.map((c) => (
            <Link
              key={c.id}
              href={`/admin/campaigns/${c.id}`}
              className="border rounded-xl p-5 bg-white hover:shadow transition-shadow flex items-center justify-between"
            >
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-sm text-gray-500">{c.campaign_date ?? '—'}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                c.sent_at ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
              }`}>
                {c.sent_at ? 'Sent' : 'Draft'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Run tests to confirm no regressions**

```bash
npm test
```

Expected: 46 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/
git commit -m "feat: add admin layout and campaign list page"
```

---

## Task 7: New campaign form (`/admin/campaigns/new`)

**Files:**
- Create: `src/app/admin/campaigns/new/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/admin/campaigns/new/page.tsx`:

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
    <main className="p-8 max-w-lg mx-auto">
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-gray-500 hover:underline">← Campaigns</Link>
      </div>
      <h1 className="text-2xl font-bold mb-8">New Campaign</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 bg-white rounded-xl shadow p-6">
        {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

        <label htmlFor="name" className="text-sm font-medium">Campaign name</label>
        <input
          id="name"
          type="text"
          placeholder="e.g. Passover 2026"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />

        <label htmlFor="date" className="text-sm font-medium">Campaign date</label>
        <input
          id="date"
          type="date"
          value={campaignDate}
          onChange={(e) => setCampaignDate(e.target.value)}
          required
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />

        <button
          type="submit"
          disabled={loading}
          className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-gray-800 transition-colors mt-2"
        >
          {loading ? 'Creating…' : 'Create Campaign'}
        </button>
      </form>
    </main>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/campaigns/new/page.tsx
git commit -m "feat: add /admin/campaigns/new page"
```

---

## Task 8: `TokenUploader` component

**Files:**
- Create: `src/components/admin/TokenUploader.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/admin/TokenUploader.tsx`:

```tsx
'use client'

import { useState, useCallback } from 'react'
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
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const router = useRouter()

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setMessage(null)
    const buf = await file.arrayBuffer()
    const wb = read(buf)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const parsed: ParsedRow[] = utils.sheet_to_json(sheet, { defval: '' })
    setRows(validateRows(parsed))
  }, [])

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
      setMessage({ text: `✓ ${data.inserted} employees uploaded`, type: 'success' })
      setRows([])
      router.refresh()
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="border rounded-xl p-5 bg-white">
      <h2 className="font-semibold mb-3">Upload employees</h2>
      <p className="text-xs text-gray-500 mb-3">
        Accepts .csv or .xlsx — columns: <code>name</code>, <code>phone_number</code>, <code>department</code> (optional)
      </p>

      <input
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handleFile}
        className="text-sm mb-4"
      />

      {message && (
        <p className={`text-sm mb-3 ${message.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      {rows.length > 0 && (
        <>
          <p className="text-sm text-gray-600 mb-3">
            <span className="text-green-700 font-medium">{validRows.length} valid</span>
            {invalidCount > 0 && <span className="text-red-600 font-medium"> · {invalidCount} invalid</span>}
          </p>

          <div className="overflow-x-auto mb-4 border rounded-lg">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border-b px-3 py-2 text-left">Name</th>
                  <th className="border-b px-3 py-2 text-left">Phone</th>
                  <th className="border-b px-3 py-2 text-left">Department</th>
                  <th className="border-b px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i} className={r._status === 'invalid' ? 'bg-red-50' : ''}>
                    <td className="border-b px-3 py-1.5">{r.name || <span className="text-gray-400">—</span>}</td>
                    <td className="border-b px-3 py-1.5 font-mono">{r.phone_number || <span className="text-gray-400">—</span>}</td>
                    <td className="border-b px-3 py-1.5">{r.department || <span className="text-gray-400">—</span>}</td>
                    <td className="border-b px-3 py-1.5">
                      {r._status === 'invalid'
                        ? <span className="text-red-600">{r._reason}</span>
                        : <span className="text-green-600">✓</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && (
              <p className="text-xs text-gray-400 px-3 py-2">+{rows.length - 10} more rows not shown</p>
            )}
          </div>

          <button
            onClick={handleConfirm}
            disabled={validRows.length === 0 || uploading}
            className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-gray-800 transition-colors"
          >
            {uploading ? 'Uploading…' : `Confirm Upload (${validRows.length} employees)`}
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Run tests to confirm no regressions**

```bash
npm test
```

Expected: 46 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/TokenUploader.tsx
git commit -m "feat: add TokenUploader component for CSV/XLSX employee upload"
```

---

## Task 9: `LaunchButton` component

**Files:**
- Create: `src/components/admin/LaunchButton.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/admin/LaunchButton.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function LaunchButton({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleLaunch() {
    if (!confirm('Launch campaign and send SMS to all employees?')) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Launch failed'); return }
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {error && <p className="text-sm text-red-600 mb-2 bg-red-50 rounded px-3 py-2">{error}</p>}
      <button
        onClick={handleLaunch}
        disabled={loading}
        className="bg-black text-white rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-gray-800 transition-colors"
      >
        {loading ? 'Launching…' : 'Launch Campaign'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/LaunchButton.tsx
git commit -m "feat: add LaunchButton component"
```

---

## Task 10: `RedemptionProgress` component

**Files:**
- Create: `src/components/admin/RedemptionProgress.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/admin/RedemptionProgress.tsx`:

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
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'gift_tokens',
          filter: `campaign_id=eq.${campaignId}`,
        },
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

  return (
    <div className="border rounded-xl p-5 bg-white">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold">Redemptions</span>
        <span className="text-sm text-gray-600">{claimed} / {total}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-3">
        <div
          className="bg-green-500 h-3 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mt-1">{pct}% claimed</p>
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/RedemptionProgress.tsx
git commit -m "feat: add RedemptionProgress live progress bar"
```

---

## Task 11: `EmployeeTable` component

**Files:**
- Create: `src/components/admin/EmployeeTable.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/admin/EmployeeTable.tsx`:

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
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'gift_tokens',
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload) => {
          const updated = payload.new as TokenRow
          setRows((prev) =>
            prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
          )
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
      setResendMsg(
        `Resent to ${data.dispatched} employees${data.failed > 0 ? ` · ${data.failed} failed` : ''}`
      )
      setTimeout(() => setResendMsg(null), 3000)
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
    <div className="border rounded-xl p-5 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold">Employees ({rows.length})</h2>
        <div className="flex items-center gap-2">
          {resendMsg && <p className="text-sm text-green-700">{resendMsg}</p>}
          <button
            onClick={handleResend}
            disabled={resending || unclaimedCount === 0}
            className="border rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-gray-50 transition-colors"
          >
            {resending ? 'Resending…' : `Resend to unclaimed (${unclaimedCount})`}
          </button>
          <button
            onClick={handleExport}
            className="border rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-600">
              <th className="border-b px-3 py-2">Name</th>
              <th className="border-b px-3 py-2">Phone</th>
              <th className="border-b px-3 py-2">Department</th>
              <th className="border-b px-3 py-2">SMS</th>
              <th className="border-b px-3 py-2">Claimed</th>
              <th className="border-b px-3 py-2">Claimed At</th>
              <th className="border-b px-3 py-2">Distributor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.redeemed ? 'bg-green-50' : ''}>
                <td className="border-b px-3 py-2">{r.employee_name}</td>
                <td className="border-b px-3 py-2 font-mono text-xs">{maskPhone(r.phone_number)}</td>
                <td className="border-b px-3 py-2 text-gray-600">{r.department ?? '—'}</td>
                <td className="border-b px-3 py-2">{r.sms_sent_at ? '✓ Sent' : '—'}</td>
                <td className="border-b px-3 py-2">{r.redeemed ? '✓' : '—'}</td>
                <td className="border-b px-3 py-2 text-xs text-gray-500">
                  {r.redeemed_at ? new Date(r.redeemed_at).toLocaleString() : '—'}
                </td>
                <td className="border-b px-3 py-2 text-xs text-gray-500">
                  {r.redeemed_by ?? '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400 text-sm">
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

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Run tests to confirm no regressions**

```bash
npm test
```

Expected: 46 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/EmployeeTable.tsx
git commit -m "feat: add EmployeeTable with Realtime updates, resend, export"
```

---

## Task 12: Campaign detail page (`/admin/campaigns/[id]`)

**Files:**
- Create: `src/app/admin/campaigns/[id]/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/admin/campaigns/[id]/page.tsx`:

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
    <main className="p-8 max-w-5xl mx-auto flex flex-col gap-6">
      <div className="mb-2">
        <Link href="/admin" className="text-sm text-gray-500 hover:underline">← Campaigns</Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{campaign.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{campaign.campaign_date ?? '—'}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
          campaign.sent_at ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
        }`}>
          {campaign.sent_at ? 'Sent' : 'Draft'}
        </span>
      </div>

      {canLaunch && <LaunchButton campaignId={campaign.id} />}

      {!campaign.sent_at && <TokenUploader campaignId={campaign.id} />}

      <RedemptionProgress
        campaignId={campaign.id}
        initialClaimed={claimedCount}
        total={allTokens.length}
      />

      <EmployeeTable
        campaignId={campaign.id}
        initialRows={allTokens}
      />
    </main>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all 46 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/campaigns/[id]/page.tsx
git commit -m "feat: add campaign detail page with upload, launch, live dashboard"
```
