# Manual Employee Add — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow campaign admins to add a single employee to a draft campaign via a modal form, without uploading a CSV.

**Architecture:** New additive API route (`POST /api/campaigns/[id]/employees`) that inserts one row without deleting existing tokens. New `AddEmployeeModal` component wired into `EmployeeTable`. EmployeeTable Realtime subscription extended to handle INSERT events so new rows appear instantly without a page refresh. `EmployeeTable` receives a new `isDraft` prop to conditionally show the add button.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Supabase Realtime, Vitest.

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/app/api/campaigns/[id]/employees/route.ts` | Additive single-employee insert (no delete) |
| Create | `src/components/admin/AddEmployeeModal.tsx` | Modal form: name, phone, department |
| Modify | `src/components/admin/EmployeeTable.tsx` | Add `isDraft` prop, "+ Add employee" button, INSERT Realtime handler |
| Modify | `src/app/admin/campaigns/[id]/page.tsx` | Pass `isDraft` to EmployeeTable |
| Create | `tests/api/employees.test.ts` | Unit tests for the new route |

---

## Task 1: API route — additive single-employee insert

**Files:**
- Create: `src/app/api/campaigns/[id]/employees/route.ts`
- Create: `tests/api/employees.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/api/employees.test.ts`:

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
  return new NextRequest(`http://localhost/api/campaigns/${id}/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/campaigns/[id]/employees', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          app_metadata: { company_id: 'co-1', role_id: 'role-1', role_name: 'company_admin' },
        },
      },
    })
  })

  afterEach(() => { vi.unstubAllEnvs() })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('@/app/api/campaigns/[id]/employees/route')
    const res = await POST(makeRequest('c-1', {}), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign not found', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/employees/route')
    const res = await POST(makeRequest('bad', { name: 'A', phone_number: '+972501234567' }), { params: Promise.resolve({ id: 'bad' }) })
    expect(res.status).toBe(404)
  })

  it('returns 409 when campaign already sent', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: '2026-04-01' }, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/employees/route')
    const res = await POST(makeRequest('c-1', { name: 'A', phone_number: '+972501234567' }), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(409)
  })

  it('returns 400 when name missing', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null }, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/employees/route')
    const res = await POST(makeRequest('c-1', { name: '', phone_number: '+972501234567' }), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/name/i)
  })

  it('returns 400 when phone invalid', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null }, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/employees/route')
    const res = await POST(makeRequest('c-1', { name: 'Omer', phone_number: 'not-a-phone' }), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/phone/i)
  })

  it('inserts single employee and returns token id', async () => {
    let inserted: unknown = null
    let callCount = 0
    mockFromService.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null }, error: null }) }) }) }),
        }
      }
      return {
        insert: (row: unknown) => {
          inserted = row
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'token-1' }, error: null }) }) }
        },
      }
    })

    const { POST } = await import('@/app/api/campaigns/[id]/employees/route')
    const res = await POST(
      makeRequest('c-1', { name: 'Omer', phone_number: '0501234567', department: 'Engineering' }),
      { params: Promise.resolve({ id: 'c-1' }) }
    )

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('token-1')
    expect((inserted as { employee_name: string }).employee_name).toBe('Omer')
    expect((inserted as { phone_number: string }).phone_number).toBe('+972501234567')
    expect((inserted as { department: string }).department).toBe('Engineering')
  })

  it('normalises Israeli local phone to E.164', async () => {
    let inserted: unknown = null
    let callCount = 0
    mockFromService.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null }, error: null }) }) }) }),
        }
      }
      return {
        insert: (row: unknown) => {
          inserted = row
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'token-1' }, error: null }) }) }
        },
      }
    })

    const { POST } = await import('@/app/api/campaigns/[id]/employees/route')
    await POST(makeRequest('c-1', { name: 'Dana', phone_number: '050-123-4567' }), { params: Promise.resolve({ id: 'c-1' }) })
    expect((inserted as { phone_number: string }).phone_number).toBe('+972501234567')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/omer.melamed/Desktop/private/qr-gift-delivery && npm test -- tests/api/employees.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the route**

Create `src/app/api/campaigns/[id]/employees/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { normalizePhone } from '@/lib/phone'
import type { JwtAppMetadata } from '@/types'

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
  const name = (body.name ?? '').trim()
  const phone = normalizePhone(body.phone_number ?? '')
  const department = (body.department ?? '').trim() || null

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!phone) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })

  const { data, error } = await service
    .from('gift_tokens')
    .insert({ campaign_id: campaignId, employee_name: name, phone_number: phone, department })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: 'Failed to add employee' }, { status: 500 })

  return NextResponse.json({ id: data.id }, { status: 201 })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- tests/api/employees.test.ts 2>&1 | tail -10
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/[id]/employees/route.ts tests/api/employees.test.ts
git commit -m "feat: add POST /api/campaigns/[id]/employees for single-employee insert"
```

---

## Task 2: AddEmployeeModal component

**Files:**
- Create: `src/components/admin/AddEmployeeModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState } from 'react'
import { normalizePhone } from '@/lib/phone'

type Props = {
  campaignId: string
  onClose: () => void
}

export function AddEmployeeModal({ campaignId, onClose }: Props) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [department, setDepartment] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function validatePhone() {
    if (!phone.trim()) { setPhoneError('Phone number is required'); return false }
    if (!normalizePhone(phone)) { setPhoneError('Invalid phone number'); return false }
    setPhoneError(null)
    return true
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validatePhone()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone_number: phone.trim(), department: department.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to add employee'); return }
      onClose()
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-zinc-200 p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold text-zinc-900 mb-4">Add employee</h2>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="emp-name" className="text-sm font-medium text-zinc-700">Name</label>
            <input
              id="emp-name"
              type="text"
              placeholder="Sarah Cohen"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="emp-phone" className="text-sm font-medium text-zinc-700">Phone number</label>
            <input
              id="emp-phone"
              type="tel"
              placeholder="+972501234567"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setPhoneError(null) }}
              onBlur={validatePhone}
              required
              className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                phoneError ? 'border-red-300' : 'border-zinc-200'
              }`}
            />
            {phoneError && <p className="text-xs text-red-500">{phoneError}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="emp-dept" className="text-sm font-medium text-zinc-700">
              Department <span className="text-zinc-400 font-normal">(optional)</span>
            </label>
            <input
              id="emp-dept"
              type="text"
              placeholder="Engineering"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-3 justify-end mt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-zinc-700 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-500 rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
            >
              {loading ? 'Adding…' : 'Add employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep AddEmployeeModal
```

Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/AddEmployeeModal.tsx
git commit -m "feat: add AddEmployeeModal component"
```

---

## Task 3: Wire AddEmployeeModal into EmployeeTable + handle INSERT Realtime events

**Files:**
- Modify: `src/components/admin/EmployeeTable.tsx`
- Modify: `src/app/admin/campaigns/[id]/page.tsx`

- [ ] **Step 1: Update EmployeeTable to accept `isDraft` prop, add the button, handle INSERT events**

Replace the entire `src/components/admin/EmployeeTable.tsx` with:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { AddEmployeeModal } from '@/components/admin/AddEmployeeModal'

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
  isDraft,
}: {
  campaignId: string
  initialRows: TokenRow[]
  isDraft: boolean
}) {
  const [rows, setRows] = useState(initialRows)
  const [resending, setResending] = useState(false)
  const [resendMsg, setResendMsg] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

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
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gift_tokens', filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const inserted = payload.new as TokenRow
          setRows((prev) => [...prev, inserted])
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
      if (!res.ok) {
        setResendMsg(data.error ?? 'Resend failed')
        return
      }
      setResendMsg(`Resent to ${data.dispatched} employees${data.failed > 0 ? ` · ${data.failed} failed` : ''}`)
      setTimeout(() => setResendMsg(null), 4000)
    } catch {
      setResendMsg('Network error — please try again')
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
    <>
      <div className="bg-white rounded-xl border border-zinc-200 p-5 flex flex-col min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-zinc-900">Employees <span className="text-zinc-400 font-normal">({rows.length})</span></h2>
          <div className="flex items-center gap-2">
            {resendMsg && <p className="text-sm text-green-700">{resendMsg}</p>}
            {isDraft && (
              <button
                onClick={() => setShowAddModal(true)}
                className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                + Add employee
              </button>
            )}
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
                    No employees yet. Upload a CSV or add one manually.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <AddEmployeeModal
          campaignId={campaignId}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Update campaign detail page to pass `isDraft`**

In `src/app/admin/campaigns/[id]/page.tsx`, find the `<EmployeeTable>` usage and add the `isDraft` prop:

```tsx
<EmployeeTable
  campaignId={campaign.id}
  initialRows={allTokens}
  isDraft={!campaign.sent_at}
/>
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | tail -10
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 4: Run full test suite**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass (previous 46 + 7 new = 53 total).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/EmployeeTable.tsx src/app/admin/campaigns/[id]/page.tsx
git commit -m "feat: wire AddEmployeeModal into EmployeeTable with Realtime INSERT support"
```

---

## Self-review notes

- **Spec deviation:** Created `POST /api/campaigns/[id]/employees` (additive) instead of reusing `POST /api/campaigns/[id]/tokens` (which deletes all existing unsent tokens before inserting). This is a correctness fix — the original spec was wrong.
- **Realtime INSERT handler** added alongside the existing UPDATE handler so new rows appear without a page refresh.
- **`isDraft` prop** on EmployeeTable hides the "+ Add employee" button after a campaign is sent — consistent with how `TokenUploader` is hidden.
- **Empty state copy** updated: "No employees yet. Upload a CSV or add one manually."
