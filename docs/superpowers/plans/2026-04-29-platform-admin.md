# Platform Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give platform operators a separate `/platform` area to create and monitor client companies, view their members and campaigns, and see a cross-tenant activity feed.

**Architecture:** Separate Next.js route group `/platform` with its own layout and `PlatformSidebar`. Protected by `platform_admin` role. All data fetched server-side via service role. One new API route creates companies and invites their first admin. Activity feed is a UNION query across `companies`, `user_company_roles`, and `campaigns` tables — no audit table needed.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Supabase Auth Admin API, Vitest.

**Prerequisite:** Team page plan must be completed first (shares `InviteMemberModal` pattern and `ConfirmModal`).

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `src/app/platform/layout.tsx` | Auth guard for platform_admin + PlatformSidebar shell |
| Create | `src/components/platform/PlatformSidebar.tsx` | Dark sidebar with Companies + Activity nav items |
| Create | `src/app/platform/page.tsx` | Companies list + New Company button |
| Create | `src/components/platform/NewCompanyButton.tsx` | Client button that opens NewCompanyModal |
| Create | `src/components/platform/NewCompanyModal.tsx` | Form: name, slug, first admin email |
| Create | `src/app/platform/companies/[id]/page.tsx` | Company detail: Members + Campaigns tabs |
| Create | `src/app/platform/activity/page.tsx` | Cross-tenant activity feed |
| Create | `src/app/api/platform/companies/route.ts` | POST: create company + invite first admin |
| Create | `tests/api/platform-companies.test.ts` | Unit tests for company creation route |

---

## Task 1: Platform layout + sidebar

**Files:**
- Create: `src/app/platform/layout.tsx`
- Create: `src/components/platform/PlatformSidebar.tsx`

- [ ] **Step 1: Create PlatformSidebar**

```tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export function PlatformSidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.refresh()
  }

  const isCompanies = pathname === '/platform' || pathname.startsWith('/platform/companies')
  const isActivity = pathname.startsWith('/platform/activity')

  const navItem = (href: string, label: string, isActive: boolean, icon: React.ReactNode) => (
    <Link
      href={href}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${
        isActive ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
      }`}
    >
      {icon}
      <span className="text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
        {label}
      </span>
    </Link>
  )

  return (
    <nav className="group flex flex-col bg-zinc-900 w-14 hover:w-56 transition-all duration-200 overflow-hidden flex-shrink-0 min-h-screen">
      {/* Logo */}
      <div className="flex items-center gap-3 h-14 px-3 border-b border-zinc-800 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex-shrink-0" />
        <span className="text-white font-bold text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
          GiftFlow
        </span>
      </div>

      {/* Subtitle */}
      <div className="px-3 py-2 border-b border-zinc-800 flex-shrink-0">
        <span className="text-xs text-zinc-500 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75 uppercase tracking-wider font-medium">
          Platform
        </span>
      </div>

      {/* Nav */}
      <div className="flex flex-col gap-1 p-2 flex-1">
        {navItem('/platform', 'Companies', isCompanies,
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        )}
        {navItem('/platform/activity', 'Activity', isActivity,
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )}
      </div>

      {/* Sign out */}
      <div className="p-2 border-t border-zinc-800 flex-shrink-0">
        <button
          onClick={handleSignOut}
          aria-label="Sign out"
          className="flex items-center gap-3 px-2 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors w-full"
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
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

- [ ] **Step 2: Create platform layout**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { PlatformSidebar } from '@/components/platform/PlatformSidebar'

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const meta = user.app_metadata as JwtAppMetadata | undefined
  if (meta?.role_name !== 'platform_admin') redirect('/login')

  return (
    <div className="flex min-h-screen">
      <PlatformSidebar />
      <main className="flex-1 overflow-auto bg-zinc-50">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/platform/layout.tsx src/components/platform/PlatformSidebar.tsx
git commit -m "feat: add /platform layout with PlatformSidebar"
```

---

## Task 2: Create company API route

**Files:**
- Create: `src/app/api/platform/companies/route.ts`
- Create: `tests/api/platform-companies.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/api/platform-companies.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()
const mockInviteUser = vi.fn()
const mockUpdateUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({
    from: mockFromService,
    auth: { admin: { inviteUserByEmail: mockInviteUser, updateUserById: mockUpdateUser } },
  }),
}))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/platform/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/platform/companies', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'platform-admin-1',
          app_metadata: { role_name: 'platform_admin', company_id: null, role_id: 'r-1' },
        },
      },
    })
  })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('@/app/api/platform/companies/route')
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(401)
  })

  it('returns 403 for non-platform_admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', app_metadata: { role_name: 'company_admin' } } },
    })
    const { POST } = await import('@/app/api/platform/companies/route')
    const res = await POST(makeRequest({ name: 'Acme', slug: 'acme', adminEmail: 'a@b.com' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when name missing', async () => {
    const { POST } = await import('@/app/api/platform/companies/route')
    const res = await POST(makeRequest({ slug: 'acme', adminEmail: 'a@b.com' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when adminEmail missing', async () => {
    const { POST } = await import('@/app/api/platform/companies/route')
    const res = await POST(makeRequest({ name: 'Acme', slug: 'acme' }))
    expect(res.status).toBe(400)
  })

  it('creates company, invites admin, sets app_metadata', async () => {
    let insertedCompany: unknown = null
    let insertedUCR: unknown = null
    let callCount = 0

    mockFromService.mockImplementation((table: string) => {
      if (table === 'companies') {
        return {
          insert: (row: unknown) => {
            insertedCompany = row
            return { select: () => ({ single: () => Promise.resolve({ data: { id: 'co-new' }, error: null }) }) }
          },
        }
      }
      if (table === 'roles') {
        return { select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'role-cadmin' }, error: null }) }) }) }) }
      }
      if (table === 'user_company_roles') {
        return { insert: (row: unknown) => { insertedUCR = row; return Promise.resolve({ error: null }) } }
      }
    })

    mockInviteUser.mockResolvedValue({ data: { user: { id: 'new-admin-1' } }, error: null })
    mockUpdateUser.mockResolvedValue({ data: {}, error: null })

    const { POST } = await import('@/app/api/platform/companies/route')
    const res = await POST(makeRequest({ name: 'Acme Corp', slug: 'acme', adminEmail: 'ceo@acme.com' }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.companyId).toBe('co-new')
    expect(mockInviteUser).toHaveBeenCalledWith('ceo@acme.com', expect.any(Object))
    expect(mockUpdateUser).toHaveBeenCalledWith('new-admin-1', {
      app_metadata: { company_id: 'co-new', role_id: 'role-cadmin', role_name: 'company_admin' },
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- tests/api/platform-companies.test.ts 2>&1 | tail -5
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the route**

Create `src/app/api/platform/companies/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const meta = user.app_metadata as JwtAppMetadata
  if (meta?.role_name !== 'platform_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const name: string = (body.name ?? '').trim()
  const slug: string = (body.slug ?? toSlug(name)).trim()
  const adminEmail: string = (body.adminEmail ?? '').trim()

  if (!name) return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
  if (!adminEmail) return NextResponse.json({ error: 'Admin email is required' }, { status: 400 })

  const service = createServiceClient()

  // Create company
  const { data: company, error: coError } = await service
    .from('companies')
    .insert({ name, slug })
    .select('id')
    .single()

  if (coError || !company) {
    return NextResponse.json({ error: coError?.message ?? 'Failed to create company' }, { status: 500 })
  }

  // Get company_admin system role
  const { data: role } = await service
    .from('roles')
    .select('id')
    .eq('name', 'company_admin')
    .eq('is_system', true)
    .single()

  if (!role) return NextResponse.json({ error: 'company_admin role not found' }, { status: 500 })

  // Invite first admin
  const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(adminEmail, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/admin`,
  })

  if (inviteError || !invited?.user) {
    return NextResponse.json({ error: inviteError?.message ?? 'Invite failed' }, { status: 500 })
  }

  const newUserId = invited.user.id

  await service.auth.admin.updateUserById(newUserId, {
    app_metadata: { company_id: company.id, role_id: role.id, role_name: 'company_admin' },
  })

  await service.from('user_company_roles').insert({
    user_id: newUserId,
    company_id: company.id,
    role_id: role.id,
  })

  return NextResponse.json({ companyId: company.id }, { status: 201 })
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/api/platform-companies.test.ts 2>&1 | tail -5
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/platform/companies/route.ts tests/api/platform-companies.test.ts
git commit -m "feat: add POST /api/platform/companies route"
```

---

## Task 3: NewCompanyModal + NewCompanyButton

**Files:**
- Create: `src/components/platform/NewCompanyModal.tsx`
- Create: `src/components/platform/NewCompanyButton.tsx`

- [ ] **Step 1: Create NewCompanyModal**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = { onClose: () => void }

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function NewCompanyModal({ onClose }: Props) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const router = useRouter()

  function handleNameChange(v: string) {
    setName(v)
    setSlug(toSlug(v))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/platform/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim(), adminEmail: adminEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create company'); return }
      setDone(true)
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-2xl shadow-xl border border-zinc-200 p-6 w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="font-semibold text-zinc-900 mb-1">Company created</p>
          <p className="text-sm text-zinc-500 mb-4">An invite was sent to {adminEmail}.</p>
          <button onClick={onClose} className="text-sm font-medium text-indigo-600 hover:underline">Close</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-zinc-200 p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold text-zinc-900 mb-4">New company</h2>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="co-name" className="text-sm font-medium text-zinc-700">Company name</label>
            <input
              id="co-name"
              type="text"
              placeholder="Acme Corp"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="co-slug" className="text-sm font-medium text-zinc-700">Slug</label>
            <input
              id="co-slug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-zinc-400">Used in URLs. Auto-generated from name.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="co-admin" className="text-sm font-medium text-zinc-700">First admin email</label>
            <input
              id="co-admin"
              type="email"
              placeholder="ceo@acme.com"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-3 justify-end mt-2">
            <button type="button" onClick={onClose} disabled={loading}
              className="px-4 py-2 text-sm font-medium text-zinc-700 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button type="submit" disabled={loading || !name.trim() || !adminEmail.trim()}
              className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-500 rounded-lg hover:brightness-110 transition-all disabled:opacity-50">
              {loading ? 'Creating…' : 'Create company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create NewCompanyButton**

```tsx
'use client'

import { useState } from 'react'
import { NewCompanyModal } from '@/components/platform/NewCompanyModal'

export function NewCompanyButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
      >
        + New Company
      </button>
      {open && <NewCompanyModal onClose={() => setOpen(false)} />}
    </>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/platform/NewCompanyModal.tsx src/components/platform/NewCompanyButton.tsx
git commit -m "feat: add NewCompanyModal and NewCompanyButton"
```

---

## Task 4: Companies list page

**Files:**
- Create: `src/app/platform/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { NewCompanyButton } from '@/components/platform/NewCompanyButton'

export default async function PlatformPage() {
  const service = createServiceClient()

  const { data: companies } = await service
    .from('companies')
    .select('id, name, slug, created_at')
    .order('created_at', { ascending: false })

  // Get member counts and campaign counts per company
  const { data: ucrCounts } = await service
    .from('user_company_roles')
    .select('company_id')

  const { data: campaignCounts } = await service
    .from('campaigns')
    .select('company_id')

  const memberCountMap: Record<string, number> = {}
  for (const r of ucrCounts ?? []) {
    memberCountMap[r.company_id] = (memberCountMap[r.company_id] ?? 0) + 1
  }

  const campaignCountMap: Record<string, number> = {}
  for (const r of campaignCounts ?? []) {
    campaignCountMap[r.company_id] = (campaignCountMap[r.company_id] ?? 0) + 1
  }

  const list = companies ?? []

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Companies</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{list.length} total</p>
        </div>
        <NewCompanyButton />
      </div>

      {list.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-zinc-200">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 mx-auto mb-4" />
          <p className="text-zinc-900 font-semibold mb-1">No companies yet</p>
          <p className="text-sm text-zinc-500">Create your first client company to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-5 py-3 font-medium">Members</th>
                <th className="px-5 py-3 font-medium">Campaigns</th>
                <th className="px-5 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {list.map((co) => (
                <tr key={co.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                  <td className="px-5 py-3">
                    <Link href={`/platform/companies/${co.id}`} className="font-medium text-zinc-900 hover:text-indigo-600 transition-colors">
                      {co.name}
                    </Link>
                    <p className="text-xs text-zinc-400 font-mono">{co.slug}</p>
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{memberCountMap[co.id] ?? 0}</td>
                  <td className="px-5 py-3 text-zinc-600">{campaignCountMap[co.id] ?? 0}</td>
                  <td className="px-5 py-3 text-zinc-500 text-xs">
                    {new Date(co.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/platform/page.tsx
git commit -m "feat: add /platform companies list page"
```

---

## Task 5: Company detail page

**Files:**
- Create: `src/app/platform/companies/[id]/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

const ROLE_LABELS: Record<string, string> = {
  company_admin: 'Admin',
  campaign_manager: 'Campaign Manager',
  scanner: 'Scanner',
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: companyId } = await params
  const service = createServiceClient()

  const { data: company } = await service
    .from('companies')
    .select('id, name, slug, created_at')
    .eq('id', companyId)
    .single()

  if (!company) notFound()

  // Members
  const { data: ucr } = await service
    .from('user_company_roles')
    .select('user_id, role_id, roles(name)')
    .eq('company_id', companyId)

  const userIds = (ucr ?? []).map((r) => r.user_id)
  const { data: { users: allUsers } } = await service.auth.admin.listUsers({ perPage: 1000 })
  const members = allUsers
    .filter((u) => userIds.includes(u.id))
    .map((u) => {
      const ucrRow = (ucr ?? []).find((r) => r.user_id === u.id)
      const roleRow = ucrRow?.roles as { name: string } | null
      return {
        id: u.id,
        email: u.email ?? '',
        name: u.user_metadata?.full_name ?? u.email?.split('@')[0] ?? '—',
        role_name: (u.app_metadata as JwtAppMetadata)?.role_name ?? roleRow?.name ?? '—',
        isPending: !u.last_sign_in_at,
      }
    })

  // Campaigns
  const { data: campaigns } = await service
    .from('campaigns')
    .select('id, name, campaign_date, sent_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link href="/platform" className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors">
          ← Companies
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-zinc-900 mb-1">{company.name}</h1>
      <p className="text-sm text-zinc-400 font-mono mb-8">{company.slug}</p>

      {/* Members */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-zinc-900 mb-3">Members ({members.length})</h2>
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          {members.length === 0 ? (
            <p className="px-5 py-8 text-center text-zinc-400 text-sm">No members</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                  <th className="px-5 py-3 font-medium">Member</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-zinc-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-zinc-900">{m.name}</p>
                      <p className="text-xs text-zinc-400">{m.email}</p>
                    </td>
                    <td className="px-5 py-3 text-zinc-600">{ROLE_LABELS[m.role_name] ?? m.role_name}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        m.isPending ? 'bg-violet-100 text-violet-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {m.isPending ? 'Pending' : 'Active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Campaigns */}
      <section>
        <h2 className="text-base font-semibold text-zinc-900 mb-3">Campaigns ({(campaigns ?? []).length})</h2>
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          {!campaigns?.length ? (
            <p className="px-5 py-8 text-center text-zinc-400 text-sm">No campaigns</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                  <th className="px-5 py-3 font-medium">Campaign</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-50">
                    <td className="px-5 py-3 font-medium text-zinc-900">{c.name}</td>
                    <td className="px-5 py-3 text-zinc-500">{c.campaign_date ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        c.sent_at ? 'bg-green-100 text-green-700' : 'bg-violet-100 text-violet-700'
                      }`}>
                        {c.sent_at ? 'Sent' : 'Draft'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/platform/companies/[id]/page.tsx
git commit -m "feat: add /platform/companies/[id] detail page"
```

---

## Task 6: Activity log page

**Files:**
- Create: `src/app/platform/activity/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { createServiceClient } from '@/lib/supabase/server'

type ActivityEvent = {
  type: 'company_created' | 'user_invited' | 'campaign_launched'
  label: string
  company: string
  timestamp: string
}

export default async function ActivityPage() {
  const service = createServiceClient()

  const [{ data: companies }, { data: ucr }, { data: campaigns }] = await Promise.all([
    service.from('companies').select('id, name, created_at').order('created_at', { ascending: false }).limit(50),
    service.from('user_company_roles').select('user_id, company_id, created_at, companies(name)').order('created_at', { ascending: false }).limit(50),
    service.from('campaigns').select('id, name, company_id, sent_at, companies(name)').not('sent_at', 'is', null).order('sent_at', { ascending: false }).limit(50),
  ])

  const events: ActivityEvent[] = [
    ...(companies ?? []).map((c) => ({
      type: 'company_created' as const,
      label: `Company "${c.name}" created`,
      company: c.name,
      timestamp: c.created_at,
    })),
    ...(ucr ?? []).map((r) => ({
      type: 'user_invited' as const,
      label: `New member invited`,
      company: (r.companies as { name: string } | null)?.name ?? '—',
      timestamp: r.created_at,
    })),
    ...(campaigns ?? []).map((c) => ({
      type: 'campaign_launched' as const,
      label: `Campaign "${c.name}" launched`,
      company: (c.companies as { name: string } | null)?.name ?? '—',
      timestamp: c.sent_at!,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 100)

  const icons: Record<ActivityEvent['type'], string> = {
    company_created: '🏢',
    user_invited: '👤',
    campaign_launched: '🚀',
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Activity</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Recent events across all companies</p>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-16 text-zinc-400 text-sm">No activity yet.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((e, i) => (
            <div key={i} className="bg-white rounded-xl border border-zinc-200 px-5 py-4 flex items-start gap-4">
              <span className="text-xl flex-shrink-0">{icons[e.type]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900">{e.label}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{e.company}</p>
              </div>
              <time className="text-xs text-zinc-400 flex-shrink-0 whitespace-nowrap">
                {new Date(e.timestamp).toLocaleString()}
              </time>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run full test suite and build**

```bash
npm run build 2>&1 | tail -10 && npm test 2>&1 | tail -5
```

Expected: clean build, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/platform/activity/page.tsx
git commit -m "feat: add /platform/activity feed"
```

---

## Self-review notes

- **`platform_admin` user:** No UI to create one — use the `create-admin.mjs` script with `role_name: 'platform_admin'` and `company_id: null`. The script will need a small tweak to support this. Alternatively, create directly via Supabase Auth dashboard.
- **Activity feed** uses existing table timestamps — no audit table needed. Limited to 100 most recent events.
- **Company detail** fetches `auth.admin.listUsers` with a `perPage: 1000` cap — sufficient for this scale.
- **Spec coverage:** Companies list ✓, New company modal ✓, Company detail (Members + Campaigns) ✓, Activity feed ✓.
