# Phase 1 — Setup & Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Next.js project, apply the multi-tenant Supabase schema with company-scoped RLS and a full permissions infrastructure, and ship a working `POST /api/generate-qr` route.

**Architecture:** Hosted SaaS. Single Next.js App Router monorepo on Vercel. Multiple companies share one Supabase project — data isolation enforced by RLS on `company_id`. Permissions are a DB-backed RBAC system: `roles → role_permissions → permissions`. JWT carries `company_id` + `role_id` + `role_name`. RLS uses `company_id` for isolation; API middleware fetches permissions from DB per request.

**Tech Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase (`@supabase/ssr`, `@supabase/supabase-js`) · `qrcode` npm package · Vitest

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Dependencies |
| `next.config.ts` | Next.js config |
| `tailwind.config.ts` | Tailwind setup |
| `.env.local.example` | Env var template |
| `vitest.config.ts` | Vitest configuration |
| `src/types/index.ts` | All domain TypeScript types |
| `src/lib/supabase/server.ts` | Server-side Supabase clients (anon + service-role) |
| `src/lib/supabase/browser.ts` | Browser-side Supabase client |
| `src/lib/permissions.ts` | `fetchPermissions()` + `requirePermission()` helpers |
| `src/lib/qr.ts` | Pure QR PNG generation function |
| `src/app/layout.tsx` | Root layout |
| `src/app/page.tsx` | Placeholder home page |
| `src/app/api/generate-qr/route.ts` | `POST /api/generate-qr` API route |
| `supabase/migrations/001_initial_schema.sql` | All tables incl. companies + permissions infra |
| `supabase/migrations/002_rls_policies.sql` | Company-scoped RLS policies |
| `supabase/migrations/003_seed_roles_permissions.sql` | System roles + permissions seed data |
| `supabase/migrations/004_storage_bucket.sql` | `qr-codes` storage bucket |
| `tests/lib/qr.test.ts` | Unit tests for QR generation |
| `tests/lib/permissions.test.ts` | Unit tests for permission helpers |
| `tests/api/generate-qr.test.ts` | Unit tests for the API route |

---

## ✅ Task 1: Scaffold Next.js project — COMPLETE

Commit `26366de` on `feature/phase-1`. Next.js app with TypeScript, Tailwind, Supabase deps, Vitest, `.env.local.example` all in place.

---

## Task 2: TypeScript types and Supabase clients

**Files:**
- Create: `src/types/index.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/browser.ts`

- [ ] **Step 1: Create TypeScript domain types**

Create `src/types/index.ts`:

```ts
export type Company = {
  id: string
  name: string
  slug: string
  created_at: string
}

export type Role = {
  id: string
  company_id: string | null
  name: string
  is_system: boolean
}

export type Permission = {
  id: string
  name: string
}

export type UserCompanyRole = {
  user_id: string
  company_id: string
  role_id: string
  created_at: string
}

export type Campaign = {
  id: string
  company_id: string
  name: string
  created_by: string | null
  created_at: string
  sent_at: string | null
}

export type GiftToken = {
  id: string
  campaign_id: string
  employee_name: string
  phone_number: string
  token: string
  qr_image_url: string | null
  sms_sent_at: string | null
  redeemed: boolean
  redeemed_at: string | null
  redeemed_by: string | null
}

export type TokenVerifyResult =
  | { valid: true; employeeName: string }
  | { valid: false; reason: 'already_used'; employeeName: string }
  | { valid: false; reason: 'invalid' }

// Shape of app_metadata embedded in every JWT
export type JwtAppMetadata = {
  company_id: string
  role_id: string
  role_name: 'platform_admin' | 'company_admin' | 'campaign_manager' | 'scanner'
}
```

- [ ] **Step 2: Create server-side Supabase clients**

Create `src/lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

// Service-role client — server-side only, bypasses RLS intentionally.
// NEVER import this in client components.
// Used for: QR generation, SMS blast, assigning user roles at invite time.
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

- [ ] **Step 3: Create browser-side Supabase client**

Create `src/lib/supabase/browser.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/omer.melamed/Desktop/private/qr-gift-delivery/.worktrees/phase-1
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/supabase/server.ts src/lib/supabase/browser.ts
git commit -m "feat: add TypeScript types and Supabase client helpers"
```

---

## Task 3: Full database schema migration

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Write the schema migration**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- ============================================================
-- Companies (tenants)
-- ============================================================
CREATE TABLE companies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Roles — system roles have company_id = NULL
-- ============================================================
CREATE TABLE roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  is_system  BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE NULLS NOT DISTINCT (company_id, name)
);

-- ============================================================
-- Permissions — named actions, e.g. 'campaigns:create'
-- ============================================================
CREATE TABLE permissions (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL
);

-- ============================================================
-- Role → Permission mapping
-- ============================================================
CREATE TABLE role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ============================================================
-- User → Company → Role assignment
-- One row per user per company (a user can only have one role per company)
-- ============================================================
CREATE TABLE user_company_roles (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES roles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id)
);

-- ============================================================
-- Campaigns — scoped to a company
-- ============================================================
CREATE TABLE campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  created_by   UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at      TIMESTAMPTZ
);

-- ============================================================
-- Gift tokens — one per employee per campaign
-- ============================================================
CREATE TABLE gift_tokens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  employee_name  TEXT NOT NULL,
  phone_number   TEXT NOT NULL,
  token          UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  qr_image_url   TEXT,
  sms_sent_at    TIMESTAMPTZ,
  redeemed       BOOLEAN NOT NULL DEFAULT FALSE,
  redeemed_at    TIMESTAMPTZ,
  redeemed_by    UUID REFERENCES auth.users ON DELETE SET NULL,
  CONSTRAINT redeemed_consistency CHECK (
    (redeemed = FALSE AND redeemed_at IS NULL AND redeemed_by IS NULL) OR
    (redeemed = TRUE AND redeemed_at IS NOT NULL)
  )
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX gift_tokens_token_idx      ON gift_tokens (token);
CREATE INDEX gift_tokens_campaign_idx   ON gift_tokens (campaign_id);
CREATE INDEX campaigns_company_idx      ON campaigns (company_id);
CREATE INDEX user_company_roles_user_idx ON user_company_roles (user_id);
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

Paste and run `001_initial_schema.sql`. Expected: "Success. No rows returned."

- [ ] **Step 3: Verify all tables exist**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected: `campaigns`, `companies`, `gift_tokens`, `permissions`, `role_permissions`, `roles`, `user_company_roles`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/001_initial_schema.sql
git commit -m "feat: add multi-tenant schema with companies, roles, permissions, campaigns, gift_tokens"
```

---

## Task 4: RLS policies — company isolation

**Files:**
- Create: `supabase/migrations/002_rls_policies.sql`

- [ ] **Step 1: Write the RLS migration**

Create `supabase/migrations/002_rls_policies.sql`:

```sql
-- ============================================================
-- Helper functions — read company_id and role_name from JWT
-- ============================================================
CREATE OR REPLACE FUNCTION auth.jwt_company_id()
RETURNS UUID AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.jwt_role_name()
RETURNS TEXT AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role_name', '')
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT auth.jwt_role_name() = 'platform_admin'
$$ LANGUAGE sql STABLE;

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
ALTER TABLE companies           ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_company_roles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_tokens         ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- companies
-- Platform admin: full access. Others: read their own company only.
-- ============================================================
CREATE POLICY "companies_platform_admin" ON companies
  FOR ALL USING (auth.is_platform_admin());

CREATE POLICY "companies_read_own" ON companies
  FOR SELECT USING (id = auth.jwt_company_id());

-- ============================================================
-- roles — readable by anyone in the company (for UI dropdowns)
-- writable only by platform_admin
-- ============================================================
CREATE POLICY "roles_platform_admin" ON roles
  FOR ALL USING (auth.is_platform_admin());

CREATE POLICY "roles_read_company" ON roles
  FOR SELECT USING (
    company_id IS NULL OR company_id = auth.jwt_company_id()
  );

-- ============================================================
-- permissions — readable by all authenticated users (for middleware)
-- ============================================================
CREATE POLICY "permissions_read_all" ON permissions
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- role_permissions — readable by all (middleware uses this)
-- ============================================================
CREATE POLICY "role_permissions_read_all" ON role_permissions
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================
-- user_company_roles
-- Platform admin: full access. Users: read their own row.
-- company_admin: read/manage rows within their company.
-- ============================================================
CREATE POLICY "ucr_platform_admin" ON user_company_roles
  FOR ALL USING (auth.is_platform_admin());

CREATE POLICY "ucr_read_own" ON user_company_roles
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "ucr_company_admin_manage" ON user_company_roles
  FOR ALL USING (company_id = auth.jwt_company_id());

-- ============================================================
-- campaigns — company-scoped
-- ============================================================
CREATE POLICY "campaigns_platform_admin" ON campaigns
  FOR ALL USING (auth.is_platform_admin());

CREATE POLICY "campaigns_company_isolation" ON campaigns
  FOR ALL USING (company_id = auth.jwt_company_id())
  WITH CHECK (company_id = auth.jwt_company_id());

-- ============================================================
-- gift_tokens — inherit company scope through campaigns
-- Tokens don't have direct company_id; we join through campaigns.
-- Reads: anyone in the company. Updates (scan): restricted by application layer.
-- ============================================================
CREATE POLICY "gift_tokens_platform_admin" ON gift_tokens
  FOR ALL USING (auth.is_platform_admin());

CREATE POLICY "gift_tokens_company_isolation" ON gift_tokens
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_id
        AND c.company_id = auth.jwt_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_id
        AND c.company_id = auth.jwt_company_id()
    )
  );
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

Paste and run `002_rls_policies.sql`. Expected: "Success. No rows returned."

- [ ] **Step 3: Verify RLS is enabled on all tables**

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

Expected: all 7 tables show `rowsecurity = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/002_rls_policies.sql
git commit -m "feat: add company-scoped RLS policies with platform_admin bypass"
```

---

## Task 4a: Seed system roles and permissions

**Files:**
- Create: `supabase/migrations/003_seed_roles_permissions.sql`

- [ ] **Step 1: Write the seed migration**

Create `supabase/migrations/003_seed_roles_permissions.sql`:

```sql
-- ============================================================
-- System permissions
-- ============================================================
INSERT INTO permissions (name) VALUES
  ('campaigns:read'),
  ('campaigns:create'),
  ('campaigns:launch'),
  ('users:manage'),
  ('tokens:scan'),
  ('reports:export');

-- ============================================================
-- System roles (company_id = NULL means platform-level)
-- ============================================================
INSERT INTO roles (name, is_system, company_id) VALUES
  ('platform_admin',    TRUE, NULL),
  ('company_admin',     TRUE, NULL),
  ('campaign_manager',  TRUE, NULL),
  ('scanner',           TRUE, NULL);

-- ============================================================
-- Role → Permission assignments
-- ============================================================

-- platform_admin: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'platform_admin';

-- company_admin: all permissions except tokens:scan
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'company_admin'
  AND p.name IN ('campaigns:read','campaigns:create','campaigns:launch','users:manage','reports:export');

-- campaign_manager: campaigns + reports, no user management or scanning
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'campaign_manager'
  AND p.name IN ('campaigns:read','campaigns:create','campaigns:launch','reports:export');

-- scanner: only scan
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'scanner'
  AND p.name = 'tokens:scan';
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

Paste and run `003_seed_roles_permissions.sql`. Expected: "Success. No rows returned."

- [ ] **Step 3: Verify seed data**

```sql
SELECT r.name AS role, array_agg(p.name ORDER BY p.name) AS permissions
FROM roles r
JOIN role_permissions rp ON rp.role_id = r.id
JOIN permissions p ON p.id = rp.permission_id
GROUP BY r.name
ORDER BY r.name;
```

Expected output:
```
campaign_manager  | {campaigns:create,campaigns:launch,campaigns:read,reports:export}
company_admin     | {campaigns:create,campaigns:launch,campaigns:read,reports:export,users:manage}
platform_admin    | {campaigns:create,campaigns:launch,campaigns:read,reports:export,tokens:scan,users:manage}
scanner           | {tokens:scan}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/003_seed_roles_permissions.sql
git commit -m "feat: seed system roles and permissions"
```

---

## Task 4b: Permission middleware helpers (TDD)

**Files:**
- Create: `src/lib/permissions.ts`
- Create: `tests/lib/permissions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/permissions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSelect = vi.fn()
const mockEq = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: mockSelect,
    }),
  }),
}))

describe('fetchPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelect.mockReturnValue({
      eq: mockEq,
    })
  })

  it('returns a list of permission names for a role', async () => {
    mockEq.mockResolvedValue({
      data: [
        { permissions: { name: 'campaigns:read' } },
        { permissions: { name: 'campaigns:create' } },
      ],
      error: null,
    })

    const { fetchPermissions } = await import('@/lib/permissions')
    const perms = await fetchPermissions('role-uuid-123')

    expect(perms).toEqual(['campaigns:read', 'campaigns:create'])
  })

  it('returns empty array when role has no permissions', async () => {
    mockEq.mockResolvedValue({ data: [], error: null })

    const { fetchPermissions } = await import('@/lib/permissions')
    const perms = await fetchPermissions('role-uuid-empty')

    expect(perms).toEqual([])
  })

  it('returns empty array on DB error', async () => {
    mockEq.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const { fetchPermissions } = await import('@/lib/permissions')
    const perms = await fetchPermissions('role-uuid-error')

    expect(perms).toEqual([])
  })
})

describe('hasPermission', () => {
  it('returns true when permission is in the list', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    expect(hasPermission(['campaigns:read', 'campaigns:create'], 'campaigns:create')).toBe(true)
  })

  it('returns false when permission is not in the list', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    expect(hasPermission(['tokens:scan'], 'campaigns:create')).toBe(false)
  })

  it('returns false for empty permission list', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    expect(hasPermission([], 'campaigns:read')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test and confirm it fails**

```bash
cd /Users/omer.melamed/Desktop/private/qr-gift-delivery/.worktrees/phase-1
npm test tests/lib/permissions.test.ts
```

Expected: FAIL — "Cannot find module '@/lib/permissions'"

- [ ] **Step 3: Implement permissions helpers**

Create `src/lib/permissions.ts`:

```ts
import { createServiceClient } from '@/lib/supabase/server'

export async function fetchPermissions(roleId: string): Promise<string[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('role_permissions')
    .select('permissions(name)')
    .eq('role_id', roleId)

  if (error || !data) return []
  return data.map((row: any) => row.permissions.name)
}

export function hasPermission(permissions: string[], required: string): boolean {
  return permissions.includes(required)
}
```

- [ ] **Step 4: Run tests and confirm they pass**

```bash
npm test tests/lib/permissions.test.ts
```

Expected:
```
✓ tests/lib/permissions.test.ts (6)
  ✓ fetchPermissions > returns a list of permission names for a role
  ✓ fetchPermissions > returns empty array when role has no permissions
  ✓ fetchPermissions > returns empty array on DB error
  ✓ hasPermission > returns true when permission is in the list
  ✓ hasPermission > returns false when permission is not in the list
  ✓ hasPermission > returns false for empty permission list
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions.ts tests/lib/permissions.test.ts
git commit -m "feat: add fetchPermissions and hasPermission helpers with tests"
```

---

## Task 5: Supabase Storage bucket

**Files:**
- Create: `supabase/migrations/004_storage_bucket.sql`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/004_storage_bucket.sql`:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('qr-codes', 'qr-codes', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "qr_codes_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'qr-codes');

CREATE POLICY "qr_codes_service_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'qr-codes');
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

Paste and run. Expected: "Success. No rows returned."

- [ ] **Step 3: Verify bucket exists**

Supabase → Storage → confirm `qr-codes` bucket is listed as Public.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/004_storage_bucket.sql
git commit -m "feat: create qr-codes storage bucket with public read policy"
```

---

## Task 6: QR generation utility (TDD)

**Files:**
- Create: `src/lib/qr.ts`
- Create: `tests/lib/qr.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/qr.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { generateQrBuffer } from '@/lib/qr'

beforeAll(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'
})

describe('generateQrBuffer', () => {
  it('returns a Buffer', async () => {
    const buffer = await generateQrBuffer('550e8400-e29b-41d4-a716-446655440000')
    expect(buffer).toBeInstanceOf(Buffer)
  })

  it('returns a valid PNG (correct magic bytes)', async () => {
    const buffer = await generateQrBuffer('550e8400-e29b-41d4-a716-446655440000')
    expect(buffer[0]).toBe(0x89)
    expect(buffer[1]).toBe(0x50)
    expect(buffer[2]).toBe(0x4e)
    expect(buffer[3]).toBe(0x47)
  })

  it('produces a buffer larger than 1KB', async () => {
    const buffer = await generateQrBuffer('550e8400-e29b-41d4-a716-446655440000')
    expect(buffer.length).toBeGreaterThan(1024)
  })

  it('different tokens produce different buffers', async () => {
    const buf1 = await generateQrBuffer('550e8400-e29b-41d4-a716-446655440000')
    const buf2 = await generateQrBuffer('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    expect(buf1.equals(buf2)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test and confirm it fails**

```bash
npm test tests/lib/qr.test.ts
```

Expected: FAIL — "Cannot find module '@/lib/qr'"

- [ ] **Step 3: Implement generateQrBuffer**

Create `src/lib/qr.ts`:

```ts
import QRCode from 'qrcode'

export async function generateQrBuffer(token: string): Promise<Buffer> {
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify/${token}`
  return QRCode.toBuffer(verifyUrl, {
    type: 'png',
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'M',
  })
}
```

- [ ] **Step 4: Run test and confirm it passes**

```bash
npm test tests/lib/qr.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/qr.ts tests/lib/qr.test.ts
git commit -m "feat: add QR buffer generation utility with tests"
```

---

## Task 7: POST /api/generate-qr route (TDD)

**Files:**
- Create: `src/app/api/generate-qr/route.ts`
- Create: `tests/api/generate-qr.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/api/generate-qr.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockUpload = vi.fn()
const mockGetPublicUrl = vi.fn()
const mockEq = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    storage: {
      from: () => ({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      }),
    },
    from: () => ({
      update: () => ({ eq: mockEq }),
    }),
  }),
}))

vi.mock('@/lib/qr', () => ({
  generateQrBuffer: vi.fn().mockResolvedValue(Buffer.from('fake-png-bytes')),
}))

describe('POST /api/generate-qr', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpload.mockResolvedValue({ error: null })
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: 'https://example.supabase.co/storage/v1/object/public/qr-codes/campaign-1/token-1.png' },
    })
    mockEq.mockResolvedValue({ error: null })
  })

  it('returns qrImageUrl on success', async () => {
    const { POST } = await import('@/app/api/generate-qr/route')
    const req = new NextRequest('http://localhost/api/generate-qr', {
      method: 'POST',
      body: JSON.stringify({ token: 'token-1', campaignId: 'campaign-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.qrImageUrl).toBe(
      'https://example.supabase.co/storage/v1/object/public/qr-codes/campaign-1/token-1.png'
    )
  })

  it('returns 400 when token is missing', async () => {
    const { POST } = await import('@/app/api/generate-qr/route')
    const req = new NextRequest('http://localhost/api/generate-qr', {
      method: 'POST',
      body: JSON.stringify({ campaignId: 'campaign-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when campaignId is missing', async () => {
    const { POST } = await import('@/app/api/generate-qr/route')
    const req = new NextRequest('http://localhost/api/generate-qr', {
      method: 'POST',
      body: JSON.stringify({ token: 'token-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 500 when storage upload fails', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'Storage quota exceeded' } })
    const { POST } = await import('@/app/api/generate-qr/route')
    const req = new NextRequest('http://localhost/api/generate-qr', {
      method: 'POST',
      body: JSON.stringify({ token: 'token-1', campaignId: 'campaign-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run test and confirm it fails**

```bash
npm test tests/api/generate-qr.test.ts
```

Expected: FAIL — "Cannot find module '@/app/api/generate-qr/route'"

- [ ] **Step 3: Implement the API route**

Create `src/app/api/generate-qr/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { generateQrBuffer } from '@/lib/qr'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { token, campaignId } = body

  if (!token || !campaignId) {
    return NextResponse.json(
      { error: 'token and campaignId are required' },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  const filePath = `${campaignId}/${token}.png`
  const buffer = await generateQrBuffer(token)

  const { error: uploadError } = await supabase.storage
    .from('qr-codes')
    .upload(filePath, buffer, { contentType: 'image/png', upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage
    .from('qr-codes')
    .getPublicUrl(filePath)

  await supabase
    .from('gift_tokens')
    .update({ qr_image_url: publicUrl })
    .eq('token', token)

  return NextResponse.json({ qrImageUrl: publicUrl })
}
```

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all 14 tests pass (4 qr + 6 permissions + 4 generate-qr).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/generate-qr/route.ts tests/api/generate-qr.test.ts
git commit -m "feat: add POST /api/generate-qr route with tests"
```

---

## Task 8: Placeholder layout and smoke test

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update root layout**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'QR Gift Delivery',
  description: 'Employee holiday gift distribution system',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Update home page**

Replace `src/app/page.tsx`:

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <h1 className="text-4xl font-bold">QR Gift Delivery</h1>
      <p className="mt-4 text-gray-500">Phase 1 — setup complete</p>
    </main>
  )
}
```

- [ ] **Step 3: Smoke test generate-qr endpoint**

```bash
curl -X POST http://localhost:3000/api/generate-qr \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `{"error":"token and campaignId are required"}` with HTTP 400.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx
git commit -m "feat: add placeholder layout and home page"
```

---

## Task 9: Create test users in Supabase (manual)

> Done via Supabase dashboard. No code files created.

- [ ] **Step 1: Create a test company**

In Supabase SQL Editor:

```sql
INSERT INTO companies (name, slug) VALUES ('Test Company', 'test-company')
RETURNING id; -- save this UUID
```

- [ ] **Step 2: Create test users**

Supabase → Authentication → Users → Add user for each:
- `admin@test.com` (company_admin)
- `manager@test.com` (campaign_manager)
- `scanner@test.com` (scanner)

- [ ] **Step 3: Assign roles and set JWT metadata**

For each user, run (replace UUIDs from your Supabase):

```sql
-- Get role IDs
SELECT id, name FROM roles WHERE is_system = true;

-- Assign company_admin to admin@test.com
WITH u AS (SELECT id FROM auth.users WHERE email = 'admin@test.com'),
     r AS (SELECT id FROM roles WHERE name = 'company_admin' AND company_id IS NULL),
     c AS (SELECT id FROM companies WHERE slug = 'test-company')
INSERT INTO user_company_roles (user_id, company_id, role_id)
SELECT u.id, c.id, r.id FROM u, r, c;

-- Set JWT metadata for admin@test.com
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object(
  'company_id', (SELECT id FROM companies WHERE slug = 'test-company'),
  'role_id',    (SELECT id FROM roles WHERE name = 'company_admin' AND company_id IS NULL),
  'role_name',  'company_admin'
)
WHERE email = 'admin@test.com';
```

Repeat for `manager@test.com` (campaign_manager) and `scanner@test.com` (scanner).

- [ ] **Step 4: Verify RLS company isolation**

```sql
-- Simulate scanner seeing campaigns (should return 0 — scanner has no campaigns:read via RLS rows)
-- Note: RLS uses company_id isolation, scanners still see campaigns in their company.
-- Application layer (hasPermission) is what blocks scanner from the admin UI.
SELECT count(*) FROM campaigns; -- platform_admin context sees all
```

---

## Task 10: Deploy to Vercel (manual)

- [ ] Push `feature/phase-1` branch to GitHub
- [ ] Connect repo to Vercel, set all env vars from `.env.local`
- [ ] Deploy and verify preview URL renders home page
- [ ] Smoke test: `curl -X POST https://<preview-url>/api/generate-qr -d '{}'` → 400

---

## Definition of Done

- [ ] `npm test` passes all 14 tests
- [ ] All 7 tables exist in Supabase with RLS enabled
- [ ] System roles and permissions seeded and verified
- [ ] `qr-codes` storage bucket is public
- [ ] Test users created with correct JWT metadata
- [ ] App deploys to Vercel
