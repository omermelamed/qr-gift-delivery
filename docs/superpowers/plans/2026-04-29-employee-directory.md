# Employee Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a company-level employee roster that persists across campaigns. HR admins can manage the directory, import from CSV, and populate campaigns from it. The `TokenUploader` is replaced by a `CampaignPopulator` with three tabs: Upload file, From directory, Clone campaign.

**Architecture:** A new `employees` table (company-scoped, unique on `(company_id, phone)`) stores the roster. Five new API routes handle CRUD and bulk import with upsert semantics. The campaign detail page replaces `TokenUploader` with `CampaignPopulator`. The existing `POST /api/campaigns/[id]/tokens` route gains two new source branches (`directory` and `clone`). A new `/admin/employees` page provides the full directory UI. The sidebar gets an Employees nav item.

**Tech Stack:** Next.js 15 App Router, React 19, Supabase Postgres + browser client, xlsx library (already installed), Tailwind v4, Vitest.

**Run tests with:** `npx vitest run`

---

## File Map

| Action | Path |
|--------|------|
| Create | `supabase/migrations/009_employees_directory.sql` |
| Create | `src/app/api/employees/route.ts` |
| Create | `src/app/api/employees/import/route.ts` |
| Create | `src/app/api/employees/[id]/route.ts` |
| Modify | `src/app/api/campaigns/[id]/tokens/route.ts` |
| Create | `src/app/admin/employees/page.tsx` |
| Create | `src/components/admin/AddDirectoryEmployeeModal.tsx` |
| Create | `src/components/admin/ImportDirectoryModal.tsx` |
| Create | `src/components/admin/DirectoryEmployeePicker.tsx` |
| Create | `src/components/admin/CampaignPopulator.tsx` |
| Modify | `src/components/admin/Sidebar.tsx` |
| Modify | `src/app/admin/campaigns/[id]/page.tsx` |
| Create | `tests/api/employees-directory.test.ts` |

---

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/009_employees_directory.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/009_employees_directory.sql`:

```sql
CREATE TABLE IF NOT EXISTS employees (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  phone         TEXT NOT NULL,
  department    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, phone)
);

CREATE INDEX IF NOT EXISTS employees_company_idx ON employees (company_id);
```

- [ ] **Step 2: Apply migration to Supabase**

Open the Supabase dashboard → SQL editor, paste and run the SQL above.

Verify: Table Editor shows an `employees` table with columns `id`, `company_id`, `employee_name`, `phone`, `department`, `created_at`.

- [ ] **Step 3: Commit**

```bash
cd /Users/omer.melamed/Desktop/private/qr-gift-delivery
git add supabase/migrations/009_employees_directory.sql
git commit -m "feat: add employees directory migration"
```

---

### Task 2: Employee API routes (CRUD + import)

**Files:**
- Create: `src/app/api/employees/route.ts`
- Create: `src/app/api/employees/import/route.ts`
- Create: `src/app/api/employees/[id]/route.ts`
- Create: `tests/api/employees-directory.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/api/employees-directory.test.ts`:

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

function adminUser(companyId = 'co-1') {
  return {
    data: {
      user: {
        id: 'admin-1',
        app_metadata: { company_id: companyId, role_id: 'role-1', role_name: 'company_admin' },
      },
    },
  }
}

// ── GET /api/employees ────────────────────────────────────────────────────────

describe('GET /api/employees', () => {
  beforeEach(() => { vi.resetAllMocks(); mockGetUser.mockResolvedValue(adminUser()) })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { GET } = await import('@/app/api/employees/route')
    const res = await GET(new NextRequest('http://localhost/api/employees'))
    expect(res.status).toBe(401)
  })

  it('returns employees for company', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [{ id: 'e-1', employee_name: 'Alice', phone: '+1234', department: 'Eng' }], error: null }) }) }),
    })
    const { GET } = await import('@/app/api/employees/route')
    const res = await GET(new NextRequest('http://localhost/api/employees'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.employees).toHaveLength(1)
    expect(body.employees[0].employee_name).toBe('Alice')
  })
})

// ── POST /api/employees ───────────────────────────────────────────────────────

describe('POST /api/employees', () => {
  beforeEach(() => { vi.resetAllMocks(); mockGetUser.mockResolvedValue(adminUser()) })

  it('inserts a new employee', async () => {
    let inserted: unknown = null
    mockFromService.mockReturnValue({
      insert: (row: unknown) => ({
        select: () => ({ single: () => { inserted = row; return Promise.resolve({ data: { id: 'e-new', ...row }, error: null }) } }),
      }),
    })
    const { POST } = await import('@/app/api/employees/route')
    const req = new NextRequest('http://localhost/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_name: 'Bob', phone: '+15550001111', department: 'HR' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.id).toBe('e-new')
    expect(inserted).toMatchObject({ company_id: 'co-1', employee_name: 'Bob', phone: '+15550001111' })
  })

  it('returns 400 when employee_name missing', async () => {
    const { POST } = await import('@/app/api/employees/route')
    const req = new NextRequest('http://localhost/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+15550001111' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 409 on duplicate phone (unique constraint violation)', async () => {
    mockFromService.mockReturnValue({
      insert: () => ({
        select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'unique' } }) }),
      }),
    })
    const { POST } = await import('@/app/api/employees/route')
    const req = new NextRequest('http://localhost/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_name: 'Bob', phone: '+15550001111' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(409)
  })
})

// ── POST /api/employees/import ────────────────────────────────────────────────

describe('POST /api/employees/import', () => {
  beforeEach(() => { vi.resetAllMocks(); mockGetUser.mockResolvedValue(adminUser()) })

  it('upserts rows and returns inserted/updated counts', async () => {
    mockFromService.mockReturnValue({
      upsert: () => ({ select: () => Promise.resolve({ data: [{ id: 'e-1' }, { id: 'e-2' }], error: null }) }),
    })
    const { POST } = await import('@/app/api/employees/import/route')
    const req = new NextRequest('http://localhost/api/employees/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [{ employee_name: 'Alice', phone: '+111', department: 'Eng' }, { employee_name: 'Bob', phone: '+222' }] }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.upserted).toBe(2)
  })

  it('returns 400 when rows is empty', async () => {
    const { POST } = await import('@/app/api/employees/import/route')
    const req = new NextRequest('http://localhost/api/employees/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

// ── PATCH /api/employees/[id] ─────────────────────────────────────────────────

describe('PATCH /api/employees/[id]', () => {
  beforeEach(() => { vi.resetAllMocks(); mockGetUser.mockResolvedValue(adminUser()) })

  it('updates employee fields', async () => {
    let updatedWith: unknown = null
    mockFromService.mockReturnValue({
      update: (fields: unknown) => ({
        eq: () => ({ eq: () => ({ select: () => ({ single: () => { updatedWith = fields; return Promise.resolve({ data: { id: 'e-1' }, error: null }) } }) }) }),
      }),
    })
    const { PATCH } = await import('@/app/api/employees/[id]/route')
    const req = new NextRequest('http://localhost/api/employees/e-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_name: 'Alice Updated' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'e-1' }) })
    expect(res.status).toBe(200)
    expect(updatedWith).toMatchObject({ employee_name: 'Alice Updated' })
  })

  it('returns 404 when employee not found for this company', async () => {
    mockFromService.mockReturnValue({
      update: () => ({
        eq: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
      }),
    })
    const { PATCH } = await import('@/app/api/employees/[id]/route')
    const req = new NextRequest('http://localhost/api/employees/e-bad', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_name: 'X' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'e-bad' }) })
    expect(res.status).toBe(404)
  })
})

// ── DELETE /api/employees/[id] ────────────────────────────────────────────────

describe('DELETE /api/employees/[id]', () => {
  beforeEach(() => { vi.resetAllMocks(); mockGetUser.mockResolvedValue(adminUser()) })

  it('deletes the employee', async () => {
    let deleted = false
    mockFromService.mockReturnValue({
      delete: () => ({ eq: () => ({ eq: () => { deleted = true; return Promise.resolve({ error: null }) } }) }),
    })
    const { DELETE } = await import('@/app/api/employees/[id]/route')
    const req = new NextRequest('http://localhost/api/employees/e-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'e-1' }) })
    expect(res.status).toBe(200)
    expect(deleted).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/api/employees-directory.test.ts 2>&1 | tail -10
```

Expected: FAIL — cannot find modules.

- [ ] **Step 3: Implement GET and POST /api/employees**

Create `src/app/api/employees/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'
import type { JwtAppMetadata } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data } = await service
    .from('employees')
    .select('id, employee_name, phone, department')
    .eq('company_id', appMeta.company_id)
    .order('employee_name')

  return NextResponse.json({ employees: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { employee_name, phone: rawPhone, department } = body

  if (!employee_name?.trim()) return NextResponse.json({ error: 'employee_name required' }, { status: 400 })
  const phone = normalizePhone(rawPhone ?? '')
  if (!phone) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })

  const service = createServiceClient()
  const { data, error } = await service
    .from('employees')
    .insert({ company_id: appMeta.company_id, employee_name: employee_name.trim(), phone, department: department?.trim() || null })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'An employee with this phone number already exists' }, { status: 409 })
    return NextResponse.json({ error: 'Failed to add employee' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}
```

- [ ] **Step 4: Implement POST /api/employees/import**

Create `src/app/api/employees/import/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'
import type { JwtAppMetadata } from '@/types'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const inputRows: Array<{ employee_name: string; phone: string; department?: string }> = Array.isArray(body.rows) ? body.rows : []

  if (inputRows.length === 0) return NextResponse.json({ error: 'No rows to import' }, { status: 400 })

  const rows = inputRows
    .filter((r) => r.employee_name?.trim() && normalizePhone(r.phone ?? ''))
    .map((r) => ({
      company_id: appMeta.company_id,
      employee_name: r.employee_name.trim(),
      phone: normalizePhone(r.phone)!,
      department: r.department?.trim() || null,
    }))

  if (rows.length === 0) return NextResponse.json({ error: 'No valid rows to import' }, { status: 400 })

  const service = createServiceClient()
  const { data, error } = await service
    .from('employees')
    .upsert(rows, { onConflict: 'company_id,phone', ignoreDuplicates: false })
    .select('id')

  if (error) return NextResponse.json({ error: 'Import failed' }, { status: 500 })

  return NextResponse.json({ upserted: data?.length ?? 0 })
}
```

- [ ] **Step 5: Implement PATCH and DELETE /api/employees/[id]**

Create `src/app/api/employees/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'
import type { JwtAppMetadata } from '@/types'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, string | null> = {}
  if (body.employee_name !== undefined) updates.employee_name = body.employee_name?.trim() || null
  if (body.phone !== undefined) {
    const phone = normalizePhone(body.phone ?? '')
    if (!phone) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    updates.phone = phone
  }
  if (body.department !== undefined) updates.department = body.department?.trim() || null

  const service = createServiceClient()
  const { data, error } = await service
    .from('employees')
    .update(updates)
    .eq('id', id)
    .eq('company_id', appMeta.company_id)
    .select('id')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  return NextResponse.json({ id: data.id })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  await service
    .from('employees')
    .delete()
    .eq('id', id)
    .eq('company_id', appMeta.company_id)

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run tests/api/employees-directory.test.ts 2>&1 | tail -15
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/employees/ tests/api/employees-directory.test.ts
git commit -m "feat: add employee directory API routes (CRUD + import)"
```

---

### Task 3: Extend tokens route with directory and clone sources

**Files:**
- Modify: `src/app/api/campaigns/[id]/tokens/route.ts`

Add two new source branches to the existing route: `{ source: 'directory', employeeIds: string[] }` and `{ source: 'clone', sourceCampaignId: string }`. The existing CSV path (no `source` field) is unchanged.

- [ ] **Step 1: Update the tokens route**

Replace `src/app/api/campaigns/[id]/tokens/route.ts`:

```typescript
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
  const source: string | undefined = body.source

  let insertRows: InsertRow[] = []
  const errors: RowError[] = []

  if (source === 'directory') {
    // Populate from employee directory
    const employeeIds: string[] = Array.isArray(body.employeeIds) ? body.employeeIds : []
    if (employeeIds.length === 0) return NextResponse.json({ error: 'No employees selected' }, { status: 400 })

    const { data: employees } = await service
      .from('employees')
      .select('employee_name, phone, department')
      .in('id', employeeIds)
      .eq('company_id', appMeta.company_id)

    insertRows = (employees ?? []).map((e) => ({
      campaign_id: campaignId,
      employee_name: e.employee_name,
      phone_number: e.phone,
      department: e.department,
    }))
  } else if (source === 'clone') {
    // Clone tokens from another campaign in the same company
    const sourceCampaignId: string | undefined = body.sourceCampaignId
    if (!sourceCampaignId) return NextResponse.json({ error: 'sourceCampaignId required' }, { status: 400 })

    const { data: sourceTokens } = await service
      .from('gift_tokens')
      .select('employee_name, phone_number, department')
      .eq('campaign_id', sourceCampaignId)

    // Verify source campaign belongs to same company
    const { data: sourceCampaign } = await service
      .from('campaigns')
      .select('id')
      .eq('id', sourceCampaignId)
      .eq('company_id', appMeta.company_id)
      .single()

    if (!sourceCampaign) return NextResponse.json({ error: 'Source campaign not found' }, { status: 404 })

    insertRows = (sourceTokens ?? []).map((t) => ({
      campaign_id: campaignId,
      employee_name: t.employee_name,
      phone_number: t.phone_number,
      department: t.department,
    }))
  } else {
    // Default: CSV rows from client
    const rows: InputRow[] = Array.isArray(body.rows) ? body.rows : []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row.name?.trim()) { errors.push({ row: i, reason: 'Missing name' }); continue }
      const phone = normalizePhone(row.phone_number ?? '')
      if (!phone) { errors.push({ row: i, reason: 'Invalid phone number' }); continue }
      insertRows.push({
        campaign_id: campaignId,
        employee_name: row.name.trim(),
        phone_number: phone,
        department: row.department?.trim() || null,
      })
    }
  }

  if (insertRows.length > 0) {
    const { error: deleteError } = await service.from('gift_tokens').delete().eq('campaign_id', campaignId).is('sms_sent_at', null)
    if (deleteError) return NextResponse.json({ error: 'Failed to clear existing tokens' }, { status: 500 })
    const { error: insertError } = await service.from('gift_tokens').insert(insertRows)
    if (insertError) return NextResponse.json({ error: 'Failed to insert employees' }, { status: 500 })
  }

  return NextResponse.json({ inserted: insertRows.length, skipped: errors.length, errors })
}
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all tests pass (existing tokens tests still pass with the unchanged CSV path).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/campaigns/\[id\]/tokens/route.ts
git commit -m "feat: tokens route supports directory and clone sources"
```

---

### Task 4: Directory page and components

**Files:**
- Create: `src/app/admin/employees/page.tsx`
- Create: `src/components/admin/AddDirectoryEmployeeModal.tsx`
- Create: `src/components/admin/ImportDirectoryModal.tsx`

- [ ] **Step 1: Create AddDirectoryEmployeeModal**

Create `src/components/admin/AddDirectoryEmployeeModal.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { normalizePhone } from '@/lib/phone'

type Employee = { id: string; employee_name: string; phone: string; department: string | null }

type Props = {
  onClose: () => void
  onAdded: (employee: Employee) => void
}

export function AddDirectoryEmployeeModal({ onClose, onAdded }: Props) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [department, setDepartment] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function handlePhoneBlur() {
    const normalized = normalizePhone(phone)
    if (phone && !normalized) setPhoneError('Invalid phone number')
    else { setPhoneError(null); if (normalized) setPhone(normalized) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const normalized = normalizePhone(phone)
    if (!normalized) { setPhoneError('Invalid phone number'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_name: name, phone: normalized, department: department || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to add employee'); return }
      onAdded({ id: data.id, employee_name: name, phone: normalized, department: department || null })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-5">Add employee</h2>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700">Name</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)} required
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700">Phone</label>
            <input
              type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={handlePhoneBlur} required
              className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${phoneError ? 'border-red-300' : 'border-zinc-200'}`}
            />
            {phoneError && <p className="text-xs text-red-500">{phoneError}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700">Department <span className="text-zinc-400">(optional)</span></label>
            <input
              type="text" value={department} onChange={(e) => setDepartment(e.target.value)}
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-3 mt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-zinc-200 rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all">
              {loading ? 'Adding…' : 'Add employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create ImportDirectoryModal**

Create `src/components/admin/ImportDirectoryModal.tsx`:

```tsx
'use client'

import { useState, useRef } from 'react'
import { read, utils } from 'xlsx'
import { normalizePhone } from '@/lib/phone'

type Props = { onClose: () => void; onImported: (count: number) => void }

type ParsedRow = { employee_name: string; phone: string; department?: string }

export function ImportDirectoryModal({ onClose, onImported }: Props) {
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function processFile(file: File) {
    const buf = await file.arrayBuffer()
    const wb = read(buf)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const raw: Record<string, string>[] = utils.sheet_to_json(sheet, { defval: '' })
    const parsed: ParsedRow[] = raw
      .map((r) => ({
        employee_name: (r.name ?? r.employee_name ?? '').trim(),
        phone: (r.phone_number ?? r.phone ?? '').trim(),
        department: (r.department ?? '').trim() || undefined,
      }))
      .filter((r) => r.employee_name && normalizePhone(r.phone))
    setRows(parsed)
  }

  async function handleImport() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/employees/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Import failed'); return }
      onImported(data.upserted)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-5">Import employees</h2>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">{error}</p>}

        <div
          role="button" tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors mb-4 ${isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-zinc-200 hover:border-indigo-300 hover:bg-zinc-50'}`}
        >
          <p className="text-sm text-zinc-500"><span className="font-medium text-indigo-600">Click to browse</span> or drag and drop</p>
          <p className="text-xs text-zinc-400 mt-1">.csv or .xlsx · columns: name, phone_number, department</p>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f) }} className="hidden" />
        </div>

        {rows.length > 0 && (
          <>
            <p className="text-sm text-zinc-600 mb-3"><span className="font-medium text-green-700">{rows.length} valid employees</span> ready to import</p>
            <div className="border border-zinc-100 rounded-xl overflow-hidden mb-4 max-h-48 overflow-y-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-zinc-50 text-zinc-500">
                    <th className="border-b border-zinc-100 px-3 py-2 text-left font-medium">Name</th>
                    <th className="border-b border-zinc-100 px-3 py-2 text-left font-medium">Phone</th>
                    <th className="border-b border-zinc-100 px-3 py-2 text-left font-medium">Department</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((r, i) => (
                    <tr key={i} className="border-b border-zinc-50">
                      <td className="px-3 py-1.5 text-zinc-700">{r.employee_name}</td>
                      <td className="px-3 py-1.5 font-mono text-zinc-500">{r.phone}</td>
                      <td className="px-3 py-1.5 text-zinc-400">{r.department ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 && <p className="text-xs text-zinc-400 px-3 py-2">+{rows.length - 20} more rows</p>}
            </div>
          </>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-zinc-200 rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">Cancel</button>
          <button onClick={handleImport} disabled={rows.length === 0 || loading} className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all">
            {loading ? 'Importing…' : `Import ${rows.length} employees`}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create the employees directory page**

Create `src/app/admin/employees/page.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { AddDirectoryEmployeeModal } from '@/components/admin/AddDirectoryEmployeeModal'
import { ImportDirectoryModal } from '@/components/admin/ImportDirectoryModal'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

type Employee = { id: string; employee_name: string; phone: string; department: string | null }

function maskPhone(phone: string) {
  return phone.replace(/\d(?=\d{4})/g, '•')
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDept, setEditDept] = useState('')
  const [removeTarget, setRemoveTarget] = useState<Employee | null>(null)
  const [removeLoading, setRemoveLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/employees').then((r) => r.json()).then((d) => setEmployees(d.employees ?? []))
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const departments = [...new Set(employees.map((e) => e.department).filter(Boolean) as string[])].sort()

  const filtered = employees.filter((e) => {
    const matchSearch = !search || e.employee_name.toLowerCase().includes(search.toLowerCase()) || (e.department ?? '').toLowerCase().includes(search.toLowerCase())
    const matchDept = !deptFilter || e.department === deptFilter
    return matchSearch && matchDept
  })

  async function handleRemove() {
    if (!removeTarget) return
    setRemoveLoading(true)
    await fetch(`/api/employees/${removeTarget.id}`, { method: 'DELETE' })
    setEmployees((prev) => prev.filter((e) => e.id !== removeTarget.id))
    setRemoveTarget(null)
    setRemoveLoading(false)
    showToast('Employee removed')
  }

  async function handleSaveEdit(id: string) {
    const res = await fetch(`/api/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_name: editName, department: editDept || null }),
    })
    if (res.ok) {
      setEmployees((prev) => prev.map((e) => e.id === id ? { ...e, employee_name: editName, department: editDept || null } : e))
      setEditingId(null)
      showToast('Employee updated')
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Employee Directory</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{employees.length} employee{employees.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImport(true)} className="border border-zinc-200 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
            Import CSV
          </button>
          <button onClick={() => setShowAdd(true)} className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all">
            + Add employee
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          type="text" placeholder="Search by name or department…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        {departments.length > 0 && (
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-400 text-sm">
            {employees.length === 0 ? 'No employees yet. Add one or import from CSV.' : 'No employees match your search.'}
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Phone</th>
                <th className="px-5 py-3 font-medium">Department</th>
                <th className="px-5 py-3 font-medium w-24" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                  {editingId === e.id ? (
                    <>
                      <td className="px-5 py-2">
                        <input value={editName} onChange={(ev) => setEditName(ev.target.value)} className="border border-zinc-200 rounded-lg px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </td>
                      <td className="px-5 py-2 font-mono text-xs text-zinc-500">{maskPhone(e.phone)}</td>
                      <td className="px-5 py-2">
                        <input value={editDept} onChange={(ev) => setEditDept(ev.target.value)} placeholder="Department" className="border border-zinc-200 rounded-lg px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </td>
                      <td className="px-5 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleSaveEdit(e.id)} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">Save</button>
                          <button onClick={() => setEditingId(null)} className="text-xs font-medium text-zinc-400 hover:text-zinc-600">Cancel</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-5 py-3 font-medium text-zinc-900">{e.employee_name}</td>
                      <td className="px-5 py-3 font-mono text-xs text-zinc-500">{maskPhone(e.phone)}</td>
                      <td className="px-5 py-3 text-zinc-500">{e.department ?? <span className="text-zinc-300">—</span>}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-3">
                          <button onClick={() => { setEditingId(e.id); setEditName(e.employee_name); setEditDept(e.department ?? '') }} className="text-zinc-400 hover:text-zinc-700 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button onClick={() => setRemoveTarget(e)} className="text-zinc-400 hover:text-red-500 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      {showAdd && (
        <AddDirectoryEmployeeModal
          onClose={() => setShowAdd(false)}
          onAdded={(emp) => { setEmployees((prev) => [...prev, emp].sort((a, b) => a.employee_name.localeCompare(b.employee_name))); showToast('Employee added') }}
        />
      )}

      {showImport && (
        <ImportDirectoryModal
          onClose={() => setShowImport(false)}
          onImported={(count) => {
            showToast(`${count} employees imported`)
            fetch('/api/employees').then((r) => r.json()).then((d) => setEmployees(d.employees ?? []))
          }}
        />
      )}

      {removeTarget && (
        <ConfirmModal
          title={`Remove ${removeTarget.employee_name}?`}
          description="This removes them from the directory only. Existing campaign tokens are not affected."
          confirmLabel="Remove"
          loading={removeLoading}
          onConfirm={handleRemove}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "employees/page|AddDirectory|ImportDirectory"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/employees/ src/components/admin/AddDirectoryEmployeeModal.tsx src/components/admin/ImportDirectoryModal.tsx
git commit -m "feat: add employee directory page and modals"
```

---

### Task 5: Sidebar — Employees nav item

**Files:**
- Modify: `src/components/admin/Sidebar.tsx`

- [ ] **Step 1: Add isEmployees state and nav item to Sidebar**

In `src/components/admin/Sidebar.tsx`, add `isEmployees` alongside the existing active-state variables:

```tsx
const isEmployees = pathname.startsWith('/admin/employees')
```

Then add the Employees nav item between Campaigns and Team:

```tsx
        {navItem('/admin/employees', 'Employees', isEmployees,
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        )}
```

The nav order becomes: Campaigns → Employees → Team → Settings.

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "Sidebar"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/Sidebar.tsx
git commit -m "feat: add Employees nav item to admin sidebar"
```

---

### Task 6: CampaignPopulator — three-tab component

**Files:**
- Create: `src/components/admin/DirectoryEmployeePicker.tsx`
- Create: `src/components/admin/CampaignPopulator.tsx`
- Modify: `src/app/admin/campaigns/[id]/page.tsx`

- [ ] **Step 1: Create DirectoryEmployeePicker**

Create `src/components/admin/DirectoryEmployeePicker.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'

type Employee = { id: string; employee_name: string; phone: string; department: string | null }

type Props = {
  campaignId: string
  onAdded: () => void
}

export function DirectoryEmployeePicker({ campaignId, onAdded }: Props) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    fetch('/api/employees').then((r) => r.json()).then((d) => setEmployees(d.employees ?? []))
  }, [])

  const departments = [...new Set(employees.map((e) => e.department).filter(Boolean) as string[])].sort()

  const filtered = employees.filter((e) => {
    const matchSearch = !search || e.employee_name.toLowerCase().includes(search.toLowerCase())
    const matchDept = !deptFilter || e.department === deptFilter
    return matchSearch && matchDept
  })

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((e) => e.id)))
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleAdd() {
    if (selected.size === 0) return
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'directory', employeeIds: [...selected] }),
      })
      const data = await res.json()
      if (!res.ok) { setMessage({ text: data.error ?? 'Failed to add employees', type: 'error' }); return }
      setMessage({ text: `${data.inserted} employees added to campaign`, type: 'success' })
      setSelected(new Set())
      onAdded()
    } finally {
      setLoading(false)
    }
  }

  if (employees.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-400 text-sm">
        Your directory is empty. <a href="/admin/employees" className="text-indigo-600 hover:underline">Add employees</a> first.
      </div>
    )
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input
          type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        {departments.length > 0 && (
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="border border-zinc-200 rounded-lg px-2 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
            <option value="">All depts</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      <div className="flex items-center justify-between mb-2">
        <button onClick={toggleAll} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
          {selected.size === filtered.length && filtered.length > 0 ? 'Deselect all' : 'Select all'}
        </button>
        <span className="text-xs text-zinc-400">{selected.size} selected</span>
      </div>

      <div className="border border-zinc-100 rounded-xl overflow-hidden max-h-52 overflow-y-auto mb-3">
        {filtered.map((e) => (
          <label key={e.id} className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-50 cursor-pointer border-b border-zinc-50 last:border-0">
            <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-800 truncate">{e.employee_name}</p>
              {e.department && <p className="text-xs text-zinc-400">{e.department}</p>}
            </div>
          </label>
        ))}
      </div>

      {message && (
        <p className={`text-sm mb-3 ${message.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      <button
        onClick={handleAdd}
        disabled={selected.size === 0 || loading}
        className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
      >
        {loading ? 'Adding…' : `Add ${selected.size > 0 ? selected.size : ''} to campaign`}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create CampaignPopulator**

Create `src/components/admin/CampaignPopulator.tsx`:

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { read, utils } from 'xlsx'
import { normalizePhone } from '@/lib/phone'
import { DirectoryEmployeePicker } from '@/components/admin/DirectoryEmployeePicker'

type Tab = 'upload' | 'directory' | 'clone'
type ParsedRow = { name: string; phone_number: string; department?: string }
type ValidatedRow = ParsedRow & { _status: 'valid' | 'invalid'; _reason?: string }
type CampaignOption = { id: string; name: string; campaign_date: string | null }

function validateRows(raw: ParsedRow[]): ValidatedRow[] {
  return raw.map((row) => {
    if (!row.name?.trim()) return { ...row, _status: 'invalid', _reason: 'Missing name' }
    if (!normalizePhone(row.phone_number ?? '')) return { ...row, _status: 'invalid', _reason: 'Invalid phone' }
    return { ...row, _status: 'valid' }
  })
}

export function CampaignPopulator({ campaignId }: { campaignId: string }) {
  const [tab, setTab] = useState<Tab>('upload')
  const [rows, setRows] = useState<ValidatedRow[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [saveToDirectory, setSaveToDirectory] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([])
  const [cloneSource, setCloneSource] = useState('')
  const [cloning, setCloning] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (tab === 'clone' && campaigns.length === 0) {
      fetch('/api/campaigns').then((r) => r.json()).then((d) => {
        const others = (d.campaigns ?? []).filter((c: CampaignOption) => c.id !== campaignId)
        setCampaigns(others)
      })
    }
  }, [tab, campaignId, campaigns.length])

  async function processFile(file: File) {
    setMessage(null)
    const buf = await file.arrayBuffer()
    const wb = read(buf)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const parsed: ParsedRow[] = utils.sheet_to_json(sheet, { defval: '' })
    setRows(validateRows(parsed))
  }

  const validRows = rows.filter((r) => r._status === 'valid')
  const invalidCount = rows.length - validRows.length

  async function handleUploadConfirm() {
    setUploading(true)
    setMessage(null)
    try {
      if (saveToDirectory) {
        await fetch('/api/employees/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: validRows.map(({ name, phone_number, department }) => ({ employee_name: name, phone: phone_number, department })) }),
        })
      }
      const res = await fetch(`/api/campaigns/${campaignId}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows.map(({ name, phone_number, department }) => ({ name, phone_number, department })) }),
      })
      const data = await res.json()
      if (!res.ok) { setMessage({ text: data.error ?? 'Upload failed', type: 'error' }); return }
      setMessage({ text: `${data.inserted} employees uploaded${saveToDirectory ? ' and saved to directory' : ''}`, type: 'success' })
      setRows([])
      router.refresh()
    } finally {
      setUploading(false)
    }
  }

  async function handleClone() {
    if (!cloneSource) return
    setCloning(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'clone', sourceCampaignId: cloneSource }),
      })
      const data = await res.json()
      if (!res.ok) { setMessage({ text: data.error ?? 'Clone failed', type: 'error' }); return }
      setMessage({ text: `${data.inserted} employees cloned`, type: 'success' })
      router.refresh()
    } finally {
      setCloning(false)
    }
  }

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => { setTab(t); setMessage(null) }}
      className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h2 className="font-semibold text-zinc-900 mb-4">Add employees</h2>

      {/* Tab bar */}
      <div className="flex bg-zinc-100 rounded-lg p-1 mb-5 gap-1">
        {tabBtn('upload', 'Upload file')}
        {tabBtn('directory', 'From directory')}
        {tabBtn('clone', 'Clone campaign')}
      </div>

      {/* Upload tab */}
      {tab === 'upload' && (
        <>
          <p className="text-xs text-zinc-400 mb-3">
            Columns: <code className="bg-zinc-100 px-1 rounded font-mono">name</code>,{' '}
            <code className="bg-zinc-100 px-1 rounded font-mono">phone_number</code>,{' '}
            <code className="bg-zinc-100 px-1 rounded font-mono">department</code> (optional)
          </p>
          <div
            role="button" tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-zinc-200 hover:border-indigo-300 hover:bg-zinc-50'}`}
          >
            <svg className="w-8 h-8 text-zinc-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-zinc-500"><span className="font-medium text-indigo-600">Click to browse</span> or drag and drop</p>
            <p className="text-xs text-zinc-400 mt-1">.csv or .xlsx</p>
            <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f) }} className="hidden" />
          </div>

          {rows.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-zinc-600 mb-3">
                <span className="text-green-700 font-medium">{validRows.length} valid</span>
                {invalidCount > 0 && <span className="text-red-600 font-medium"> · {invalidCount} invalid</span>}
              </p>
              <label className="flex items-center gap-3 mb-4 cursor-pointer">
                <input type="checkbox" checked={saveToDirectory} onChange={(e) => setSaveToDirectory(e.target.checked)} className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm text-zinc-700">Also save to employee directory</span>
              </label>
              <button
                onClick={handleUploadConfirm}
                disabled={validRows.length === 0 || uploading}
                className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
              >
                {uploading ? 'Uploading…' : `Confirm Upload (${validRows.length} employees)`}
              </button>
            </div>
          )}
        </>
      )}

      {/* Directory tab */}
      {tab === 'directory' && (
        <DirectoryEmployeePicker campaignId={campaignId} onAdded={() => { router.refresh(); setMessage({ text: 'Employees added from directory', type: 'success' }) }} />
      )}

      {/* Clone tab */}
      {tab === 'clone' && (
        <div>
          <p className="text-xs text-zinc-400 mb-3">Copy all employees from another campaign into this one.</p>
          {campaigns.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-6">No other campaigns to clone from.</p>
          ) : (
            <>
              <select
                value={cloneSource} onChange={(e) => setCloneSource(e.target.value)}
                className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-4"
              >
                <option value="">Select a campaign…</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.campaign_date ? ` (${c.campaign_date})` : ''}</option>
                ))}
              </select>
              <button
                onClick={handleClone}
                disabled={!cloneSource || cloning}
                className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
              >
                {cloning ? 'Cloning…' : 'Clone employees'}
              </button>
            </>
          )}
        </div>
      )}

      {message && (
        <p className={`text-sm mt-3 ${message.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create a campaigns list API route for the Clone tab**

The CampaignPopulator's Clone tab fetches `/api/campaigns` to get the list of campaigns. This route doesn't exist yet. Create it:

Create `src/app/api/campaigns/route.ts`:

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
  const { data } = await service
    .from('campaigns')
    .select('id, name, campaign_date, sent_at')
    .eq('company_id', appMeta.company_id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ campaigns: data ?? [] })
}
```

- [ ] **Step 4: Replace TokenUploader with CampaignPopulator in campaign detail page**

In `src/app/admin/campaigns/[id]/page.tsx`, change the import from `TokenUploader` to `CampaignPopulator`:

Old:
```typescript
import { TokenUploader } from '@/components/admin/TokenUploader'
```

New:
```typescript
import { CampaignPopulator } from '@/components/admin/CampaignPopulator'
```

Then replace the `<TokenUploader>` usage:

Old:
```tsx
          {!campaign.sent_at && (
            <TokenUploader campaignId={campaign.id} />
          )}
```

New:
```tsx
          {!campaign.sent_at && (
            <CampaignPopulator campaignId={campaign.id} />
          )}
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "CampaignPopulator|DirectoryEmployeePicker|campaigns/route"
```

Expected: no output.

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/DirectoryEmployeePicker.tsx src/components/admin/CampaignPopulator.tsx src/app/api/campaigns/route.ts src/app/admin/campaigns/\[id\]/page.tsx
git commit -m "feat: replace TokenUploader with CampaignPopulator (upload / directory / clone tabs)"
```
