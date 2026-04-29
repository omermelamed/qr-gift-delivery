# Company Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow company admins to set their company name, upload a logo, and customise the SMS template sent with QR codes.

**Architecture:** New migration adds `logo_url` and `sms_template` to `companies`. Server-rendered `/admin/settings` page pre-fills current values. Single `PATCH /api/settings` route saves all three fields. The send route fetches `sms_template` per campaign and substitutes `{name}` and `{link}`. Logo uploaded to Supabase Storage bucket `logos/`. Sidebar already accepts `logoUrl` prop (wired in Team page plan Task 6).

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Supabase Storage, Vitest.

**Prerequisite:** Team page plan must be completed first (it adds the `logoUrl` prop to Sidebar and updates AdminLayout).

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `supabase/migrations/006_company_settings.sql` | Add `logo_url`, `sms_template` to `companies` |
| Create | `src/app/admin/settings/page.tsx` | Server-rendered settings form |
| Create | `src/components/admin/LogoUploader.tsx` | Logo drag-and-drop upload to Supabase Storage |
| Create | `src/app/api/settings/route.ts` | PATCH endpoint: save name, logo_url, sms_template |
| Modify | `src/app/api/campaigns/[id]/send/route.ts` | Use company sms_template when sending |
| Create | `tests/api/settings.test.ts` | Unit tests for settings route |

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/006_company_settings.sql`

- [ ] **Step 1: Create migration file**

```sql
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS sms_template TEXT;
```

- [ ] **Step 2: Apply migration to Supabase**

Run via the Supabase dashboard SQL editor, OR if the Supabase CLI is configured:

```bash
supabase db push
```

Manual alternative — paste into Supabase SQL editor:
```sql
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS sms_template TEXT;
```

- [ ] **Step 3: Commit migration file**

```bash
git add supabase/migrations/006_company_settings.sql
git commit -m "feat: add logo_url and sms_template columns to companies"
```

---

## Task 2: Settings API route

**Files:**
- Create: `src/app/api/settings/route.ts`
- Create: `tests/api/settings.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/api/settings.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({ from: mockFromService }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['users:manage']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/settings', () => {
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
    const { PATCH } = await import('@/app/api/settings/route')
    const res = await PATCH(makeRequest({}))
    expect(res.status).toBe(401)
  })

  it('returns 403 when role lacks users:manage', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)
    const { PATCH } = await import('@/app/api/settings/route')
    const res = await PATCH(makeRequest({ name: 'Acme' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when name is empty', async () => {
    const { PATCH } = await import('@/app/api/settings/route')
    const res = await PATCH(makeRequest({ name: '  ' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when sms_template missing {link}', async () => {
    const { PATCH } = await import('@/app/api/settings/route')
    const res = await PATCH(makeRequest({ name: 'Acme', sms_template: 'Hi {name}, your gift is ready!' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/\{link\}/)
  })

  it('saves valid settings', async () => {
    let updated: unknown = null
    mockFromService.mockReturnValue({
      update: (data: unknown) => {
        updated = data
        return { eq: () => Promise.resolve({ error: null }) }
      },
    })
    const { PATCH } = await import('@/app/api/settings/route')
    const res = await PATCH(makeRequest({
      name: 'Acme Corp',
      logo_url: 'https://storage.example.com/logo.png',
      sms_template: 'Hi {name}! Scan: {link}',
    }))
    expect(res.status).toBe(200)
    expect((updated as { name: string }).name).toBe('Acme Corp')
    expect((updated as { sms_template: string }).sms_template).toBe('Hi {name}! Scan: {link}')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- tests/api/settings.test.ts 2>&1 | tail -5
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the route**

Create `src/app/api/settings/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

const DEFAULT_TEMPLATE = 'Hi {name}! Here\'s your QR code for your holiday gift. Scan to redeem: {link}'

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'users:manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const name: string = (body.name ?? '').trim()
  const logoUrl: string | null = body.logo_url ?? null
  const smsTemplate: string | null = body.sms_template?.trim() ?? null

  if (!name) return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
  if (smsTemplate && !smsTemplate.includes('{link}')) {
    return NextResponse.json({ error: 'SMS template must contain {link}' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('companies')
    .update({ name, logo_url: logoUrl, sms_template: smsTemplate })
    .eq('id', appMeta.company_id)

  if (error) return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })

  return NextResponse.json({ success: true })
}

export { DEFAULT_TEMPLATE }
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/api/settings.test.ts 2>&1 | tail -5
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/settings/route.ts tests/api/settings.test.ts
git commit -m "feat: add PATCH /api/settings route"
```

---

## Task 3: LogoUploader component

**Files:**
- Create: `src/components/admin/LogoUploader.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/browser'

type Props = {
  companyId: string
  currentUrl: string | null
  onUploaded: (url: string) => void
}

export function LogoUploader({ companyId, currentUrl, onUploaded }: Props) {
  const [preview, setPreview] = useState<string | null>(currentUrl)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function processFile(file: File) {
    if (!file.type.startsWith('image/')) { setError('Please upload an image file (PNG, JPG, WebP)'); return }
    if (file.size > 2 * 1024 * 1024) { setError('Image must be under 2 MB'); return }
    setError(null)
    setUploading(true)
    try {
      const ext = file.name.split('.').pop() ?? 'png'
      const path = `${companyId}/logo.${ext}`
      const supabase = createClient()
      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) { setError(uploadError.message); return }
      const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
      setPreview(publicUrl)
      onUploaded(publicUrl)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-start gap-4">
      {/* Preview */}
      <div className="w-16 h-16 rounded-xl border border-zinc-200 flex items-center justify-center flex-shrink-0 overflow-hidden bg-zinc-50">
        {preview ? (
          <img src={preview} alt="Company logo" className="w-full h-full object-cover" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500" />
        )}
      </div>

      {/* Drop zone */}
      <div className="flex-1">
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
          role="button"
          tabIndex={0}
          aria-label="Upload company logo"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
            isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-zinc-200 hover:border-indigo-300 hover:bg-zinc-50'
          }`}
        >
          {uploading ? (
            <p className="text-sm text-zinc-500">Uploading…</p>
          ) : (
            <>
              <p className="text-sm text-zinc-500">
                <span className="font-medium text-indigo-600">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">PNG, JPG, WebP · Max 2 MB</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f) }}
            className="hidden"
          />
        </div>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/LogoUploader.tsx
git commit -m "feat: add LogoUploader component"
```

---

## Task 4: Settings page

**Files:**
- Create: `src/app/admin/settings/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
'use client'

import { useState } from 'react'
import { LogoUploader } from '@/components/admin/LogoUploader'

const DEFAULT_TEMPLATE = "Hi {name}! Here's your QR code for your holiday gift. Scan to redeem: {link}"
const MAX_SMS_CHARS = 160

type Props = {
  companyId: string
  initialName: string
  initialLogoUrl: string | null
  initialTemplate: string | null
}

function SettingsForm({ companyId, initialName, initialLogoUrl, initialTemplate }: Props) {
  const [name, setName] = useState(initialName)
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl)
  const [template, setTemplate] = useState(initialTemplate ?? DEFAULT_TEMPLATE)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const templateError = template && !template.includes('{link}') ? 'Template must contain {link}' : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (templateError || !name.trim()) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), logo_url: logoUrl, sms_template: template }),
      })
      const data = await res.json()
      if (!res.ok) { setMessage({ text: data.error ?? 'Save failed', type: 'error' }); return }
      setMessage({ text: 'Settings saved', type: 'success' })
    } catch {
      setMessage({ text: 'Network error — please try again', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100">
      {/* Company identity */}
      <div className="p-6 flex flex-col gap-5">
        <h2 className="font-semibold text-zinc-900">Company identity</h2>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="co-name" className="text-sm font-medium text-zinc-700">Company name</label>
          <input
            id="co-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent max-w-sm"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-700">Logo</label>
          <LogoUploader companyId={companyId} currentUrl={logoUrl} onUploaded={setLogoUrl} />
        </div>
      </div>

      {/* SMS template */}
      <div className="p-6 flex flex-col gap-3">
        <h2 className="font-semibold text-zinc-900">SMS template</h2>
        <p className="text-sm text-zinc-500">
          Use <code className="font-mono bg-zinc-100 px-1 rounded text-xs">{'{name}'}</code> for the employee's name
          and <code className="font-mono bg-zinc-100 px-1 rounded text-xs">{'{link}'}</code> for their QR code link (required).
        </p>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={3}
          className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none ${
            templateError ? 'border-red-300' : 'border-zinc-200'
          }`}
        />
        <div className="flex items-center justify-between">
          {templateError ? (
            <p className="text-xs text-red-500">{templateError}</p>
          ) : (
            <span />
          )}
          <p className={`text-xs ${template.length > MAX_SMS_CHARS ? 'text-amber-600' : 'text-zinc-400'}`}>
            {template.length} / {MAX_SMS_CHARS} chars
            {template.length > MAX_SMS_CHARS && ' — will send as multiple SMS segments'}
          </p>
        </div>
      </div>

      {/* Save */}
      <div className="p-6 flex items-center gap-4">
        <button
          type="submit"
          disabled={saving || !!templateError || !name.trim()}
          className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-5 py-2 text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {message && (
          <p className={`text-sm ${message.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
            {message.type === 'success' ? '✓ ' : '✗ '}{message.text}
          </p>
        )}
      </div>
    </form>
  )
}

// Server wrapper to pre-fill values
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const meta = user.app_metadata as JwtAppMetadata
  if (meta.role_name !== 'company_admin') redirect('/admin')

  const service = createServiceClient()
  const { data: company } = await service
    .from('companies')
    .select('id, name, logo_url, sms_template')
    .eq('id', meta.company_id)
    .single()

  if (!company) redirect('/admin')

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Settings</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Manage your company profile and SMS defaults</p>
      </div>
      <SettingsForm
        companyId={company.id}
        initialName={company.name}
        initialLogoUrl={company.logo_url ?? null}
        initialTemplate={company.sms_template ?? null}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/settings/page.tsx
git commit -m "feat: add /admin/settings page"
```

---

## Task 5: Update send route to use sms_template

**Files:**
- Modify: `src/app/api/campaigns/[id]/send/route.ts`

- [ ] **Step 1: Update `sendGiftMMS` call to use company template**

In `src/app/api/campaigns/[id]/send/route.ts`, after fetching the campaign, also fetch the company's `sms_template`. Replace the `sendGiftMMS` call to use a custom body built from the template.

First update `src/lib/twilio.ts` to accept an optional `body` override:

```ts
interface SendGiftMMSOptions {
  to: string
  employeeName: string
  holidayName: string
  qrImageUrl: string
  body?: string  // if provided, overrides the default message
}
```

In the function body, change the `Body` field:
```ts
Body: options.body ?? `Hi ${options.employeeName}! Here's your ${options.holidayName} gift QR code above. Scan it to redeem!`,
```

- [ ] **Step 2: Update the send route to fetch and apply template**

In `src/app/api/campaigns/[id]/send/route.ts`, after fetching the campaign (around line 32), add a company fetch:

```ts
const { data: company } = await service
  .from('companies')
  .select('sms_template')
  .eq('id', campaign.company_id)
  .single()

const smsTemplate = company?.sms_template ?? null
```

Then in the `sendGiftMMS` call (inside the batch loop), add the `body` option:

```ts
await sendGiftMMS({
  to: token.phone_number,
  employeeName: token.employee_name,
  holidayName: campaign.name,
  qrImageUrl,
  body: smsTemplate
    ? smsTemplate
        .replace('{name}', token.employee_name)
        .replace('{link}', `${process.env.NEXT_PUBLIC_APP_URL}/verify/${token.token}`)
    : undefined,
})
```

- [ ] **Step 3: Run full test suite**

```bash
npm test 2>&1 | tail -5
```

Expected: all tests pass (existing send tests should still pass since the template fetch returns null in mocked tests).

- [ ] **Step 4: Commit**

```bash
git add src/lib/twilio.ts src/app/api/campaigns/[id]/send/route.ts
git commit -m "feat: use company sms_template when sending campaign QR codes"
```

---

## Self-review notes

- **Migration 006** must be applied before the settings page will load without errors. The AdminLayout already does a graceful fallback (`logo_url ?? undefined`) so the app won't break before the migration.
- **`logos` Storage bucket** must exist in Supabase. Create it in the Supabase dashboard → Storage → New bucket → name `logos`, public. Add a policy: `INSERT` allowed for authenticated users scoped to their `company_id` path.
- **Spec coverage:** Name ✓, Logo ✓, SMS template with `{link}` validation ✓, 160-char counter ✓, send route using template ✓.
