# Phase 1 — Setup & Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Next.js project, apply the Supabase schema with RLS, configure Supabase clients, and ship a working `POST /api/generate-qr` route that produces a PNG stored in Supabase Storage.

**Architecture:** Single Next.js App Router monorepo on Vercel. Supabase is the database, auth, and file storage layer. No separate backend service — all server logic lives in Next.js API routes using the service-role Supabase client. QR generation is a pure Node.js function (no browser involvement).

**Tech Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · Supabase (`@supabase/ssr`, `@supabase/supabase-js`) · `qrcode` npm package · Vitest for tests

---

## File Map

Files created or modified in this phase:

| File | Responsibility |
|---|---|
| `package.json` | Dependencies |
| `next.config.ts` | Next.js config |
| `tailwind.config.ts` | Tailwind setup |
| `.env.local.example` | Env var template |
| `src/types/index.ts` | `Campaign` and `GiftToken` TypeScript types |
| `src/lib/supabase/server.ts` | Server-side Supabase clients (anon + service-role) |
| `src/lib/supabase/browser.ts` | Browser-side Supabase client |
| `src/lib/qr.ts` | Pure QR PNG generation function |
| `src/app/layout.tsx` | Root layout |
| `src/app/page.tsx` | Placeholder home page |
| `src/app/api/generate-qr/route.ts` | `POST /api/generate-qr` API route |
| `supabase/migrations/001_initial_schema.sql` | `campaigns` + `gift_tokens` tables |
| `supabase/migrations/002_rls_policies.sql` | Row-Level Security policies |
| `supabase/migrations/003_storage_bucket.sql` | `qr-codes` storage bucket |
| `tests/lib/qr.test.ts` | Unit tests for QR generation |
| `tests/api/generate-qr.test.ts` | Unit tests for the API route |
| `vitest.config.ts` | Vitest configuration |

---

## Task 1: Scaffold Next.js project

**Files:**
- Create: `package.json`, `next.config.ts`, `tailwind.config.ts`, `.env.local.example`, `vitest.config.ts`

- [ ] **Step 1: Bootstrap Next.js app**

Run inside the repo root (the directory already exists, so use `.` as the target):

```bash
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --no-git
```

Accept all defaults. This creates `src/app/`, `public/`, `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `package.json`.

- [ ] **Step 2: Install project dependencies**

```bash
npm install @supabase/ssr @supabase/supabase-js qrcode
npm install --save-dev vitest @vitejs/plugin-react @vitest/coverage-v8 @types/qrcode
```

- [ ] **Step 3: Configure Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 4: Add test script to package.json**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Create `.env.local.example`**

```bash
cat > .env.local.example << 'EOF'
# Supabase — get from your project's API settings
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# App URL — used to build QR code verify URLs
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Twilio — not needed until Phase 2
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
EOF
```

Then copy it to `.env.local` and fill in real values from your Supabase project:

```bash
cp .env.local.example .env.local
```

- [ ] **Step 6: Verify dev server starts**

```bash
npm run dev
```

Expected: server starts at `http://localhost:3000`. Open it in the browser and confirm the default Next.js page loads. Stop with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js project with Tailwind, Supabase deps, and Vitest"
```

---

## Task 2: TypeScript types and Supabase client setup

**Files:**
- Create: `src/types/index.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/browser.ts`

- [ ] **Step 1: Create TypeScript domain types**

Create `src/types/index.ts`:

```ts
export type Campaign = {
  id: string
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
```

- [ ] **Step 2: Create server-side Supabase client**

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

// Service-role client — server-side only, bypasses RLS intentionally
// NEVER import this in client components
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
npx tsc --noEmit
```

Expected: no errors. If you see "Cannot find module" errors for `next/headers`, that's fine at this stage — it resolves at runtime.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/supabase/server.ts src/lib/supabase/browser.ts
git commit -m "feat: add TypeScript types and Supabase client helpers"
```

---

## Task 3: Supabase schema — tables and indexes

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

> **Prerequisites:** You need a Supabase project. If you haven't created one yet:
> 1. Go to https://supabase.com and create a new project
> 2. Once created, copy the Project URL and anon key from Settings → API into `.env.local`
> 3. Copy the service-role key (also on that page) into `.env.local`

- [ ] **Step 1: Write the schema migration**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- Campaigns: one row per holiday gift event
CREATE TABLE campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  created_by   UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at      TIMESTAMPTZ
);

-- Gift tokens: one row per employee per campaign
-- `token` is the UUID encoded into the QR code
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

-- Index for fast token lookup on every distributor scan
CREATE INDEX gift_tokens_token_idx ON gift_tokens (token);

-- Index for campaign dashboard queries
CREATE INDEX gift_tokens_campaign_id_idx ON gift_tokens (campaign_id);
```

- [ ] **Step 2: Apply the migration in Supabase**

Open your Supabase project → SQL Editor → paste the contents of `001_initial_schema.sql` → click Run.

Expected: "Success. No rows returned."

- [ ] **Step 3: Verify tables exist**

In the Supabase SQL Editor, run:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected output includes: `campaigns`, `gift_tokens`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/001_initial_schema.sql
git commit -m "feat: add campaigns and gift_tokens schema migration"
```

---

## Task 4: Supabase schema — RLS policies

**Files:**
- Create: `supabase/migrations/002_rls_policies.sql`

> **How roles work in this project:** When HR admins and distributors are created (via Supabase Auth), their role is stored in `app_metadata` as `{ "role": "admin" }` or `{ "role": "distributor" }`. This is set server-side using the service-role client and cannot be modified by the user themselves. RLS policies check this claim.

- [ ] **Step 1: Write the RLS migration**

Create `supabase/migrations/002_rls_policies.sql`:

```sql
-- Enable RLS on both tables
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_tokens ENABLE ROW LEVEL SECURITY;

-- Helper: extract role from JWT app_metadata
-- app_metadata is set server-side and cannot be changed by the user
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT AS $$
  SELECT coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    ''
  )
$$ LANGUAGE sql STABLE;

-- Campaigns: admins have full access, distributors have no access
CREATE POLICY "campaigns_admin_all" ON campaigns
  FOR ALL
  USING (auth.user_role() = 'admin')
  WITH CHECK (auth.user_role() = 'admin');

-- Gift tokens: admins have full access
CREATE POLICY "gift_tokens_admin_all" ON gift_tokens
  FOR ALL
  USING (auth.user_role() = 'admin')
  WITH CHECK (auth.user_role() = 'admin');

-- Gift tokens: distributors can read (to confirm employee name after scan)
CREATE POLICY "gift_tokens_distributor_select" ON gift_tokens
  FOR SELECT
  USING (auth.user_role() = 'distributor');

-- Gift tokens: distributors can update redeemed status (the scan action)
CREATE POLICY "gift_tokens_distributor_update" ON gift_tokens
  FOR UPDATE
  USING (auth.user_role() = 'distributor')
  WITH CHECK (auth.user_role() = 'distributor');
```

- [ ] **Step 2: Apply the RLS migration**

In Supabase SQL Editor, paste and run `002_rls_policies.sql`.

Expected: "Success. No rows returned."

- [ ] **Step 3: Verify RLS is enabled**

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

Expected: both `campaigns` and `gift_tokens` show `rowsecurity = true`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/002_rls_policies.sql
git commit -m "feat: add RLS policies for admin and distributor roles"
```

---

## Task 5: Supabase Storage bucket for QR images

**Files:**
- Create: `supabase/migrations/003_storage_bucket.sql`

- [ ] **Step 1: Create the storage bucket via SQL**

Create `supabase/migrations/003_storage_bucket.sql`:

```sql
-- Create the qr-codes storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('qr-codes', 'qr-codes', true)
ON CONFLICT (id) DO NOTHING;

-- Allow service-role to upload (handled server-side, no RLS needed for inserts)
-- Public read access is required so Twilio can fetch the image URL
CREATE POLICY "qr_codes_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'qr-codes');

CREATE POLICY "qr_codes_service_insert" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'qr-codes');
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

Paste and run `003_storage_bucket.sql`.

Expected: "Success. No rows returned."

- [ ] **Step 3: Verify bucket exists**

Go to Supabase → Storage. You should see the `qr-codes` bucket listed as Public.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/003_storage_bucket.sql
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
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(buffer[0]).toBe(0x89)
    expect(buffer[1]).toBe(0x50) // P
    expect(buffer[2]).toBe(0x4e) // N
    expect(buffer[3]).toBe(0x47) // G
  })

  it('produces a buffer larger than 1KB (valid QR image)', async () => {
    const buffer = await generateQrBuffer('550e8400-e29b-41d4-a716-446655440000')
    expect(buffer.length).toBeGreaterThan(1024)
  })

  it('encodes the verify URL with the token', async () => {
    const token = '550e8400-e29b-41d4-a716-446655440000'
    // Different tokens must produce different buffers (different QR content)
    const buf1 = await generateQrBuffer(token)
    const buf2 = await generateQrBuffer('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    expect(buf1.equals(buf2)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm test tests/lib/qr.test.ts
```

Expected: FAIL — "Cannot find module '@/lib/qr'"

- [ ] **Step 3: Implement `generateQrBuffer`**

Create `src/lib/qr.ts`:

```ts
import QRCode from 'qrcode'

export async function generateQrBuffer(token: string): Promise<Buffer> {
  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify/${token}`
  const buffer = await QRCode.toBuffer(verifyUrl, {
    type: 'png',
    width: 400,
    margin: 2,
    errorCorrectionLevel: 'M',
  })
  return buffer
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm test tests/lib/qr.test.ts
```

Expected:
```
✓ tests/lib/qr.test.ts (4)
  ✓ generateQrBuffer > returns a Buffer
  ✓ generateQrBuffer > returns a valid PNG (correct magic bytes)
  ✓ generateQrBuffer > produces a buffer larger than 1KB (valid QR image)
  ✓ generateQrBuffer > encodes the verify URL with the token
```

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

// Mock Supabase service client
const mockUpload = vi.fn()
const mockGetPublicUrl = vi.fn()
const mockUpdate = vi.fn()
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

// Mock QR generation
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

- [ ] **Step 2: Run the test and confirm it fails**

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

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
npm test tests/api/generate-qr.test.ts
```

Expected:
```
✓ tests/api/generate-qr.test.ts (4)
  ✓ POST /api/generate-qr > returns qrImageUrl on success
  ✓ POST /api/generate-qr > returns 400 when token is missing
  ✓ POST /api/generate-qr > returns 400 when campaignId is missing
  ✓ POST /api/generate-qr > returns 500 when storage upload fails
```

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: all 8 tests pass across both test files.

- [ ] **Step 6: Commit**

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

Replace `src/app/layout.tsx` with:

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

- [ ] **Step 2: Add placeholder home page**

Replace `src/app/page.tsx` with:

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

- [ ] **Step 3: Run dev server and verify**

```bash
npm run dev
```

Open `http://localhost:3000`. Expected: page renders "QR Gift Delivery" heading. Stop with Ctrl+C.

- [ ] **Step 4: Manual smoke test of the API route**

With the dev server running, in a second terminal:

```bash
# First, you need a real gift_token row in Supabase to test against.
# For now, just verify the endpoint rejects bad input:
curl -X POST http://localhost:3000/api/generate-qr \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected response: `{"error":"token and campaignId are required"}` with HTTP 400.

- [ ] **Step 5: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx
git commit -m "feat: add placeholder layout and home page"
```

---

## Task 9: Supabase Auth — create admin and distributor test users

> This is done via the Supabase dashboard or a one-off script. No code files are created.

- [ ] **Step 1: Create a test admin user**

In Supabase → Authentication → Users → Add user:
- Email: `admin@test.com`
- Password: (choose something)

Then in the SQL Editor, set the role in `app_metadata`:

```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'admin@test.com';
```

- [ ] **Step 2: Create a test distributor user**

In Supabase → Authentication → Users → Add user:
- Email: `distributor@test.com`
- Password: (choose something)

Then in the SQL Editor:

```sql
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "distributor"}'::jsonb
WHERE email = 'distributor@test.com';
```

- [ ] **Step 3: Verify RLS blocks cross-role access**

In SQL Editor, simulate a distributor trying to read campaigns (should return 0 rows due to RLS):

```sql
-- Set the role to distributor and try to read campaigns
SET LOCAL role = authenticated;
SET LOCAL request.jwt.claims = '{"sub": "some-uuid", "app_metadata": {"role": "distributor"}}';
SELECT * FROM campaigns;
```

Expected: 0 rows (distributor has no campaign policy).

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore: create test admin and distributor users in Supabase"
```

---

## Task 10: Deploy to Vercel

- [ ] **Step 1: Push to GitHub**

```bash
git remote add origin https://github.com/your-username/qr-gift-delivery.git
git push -u origin main
```

- [ ] **Step 2: Connect to Vercel**

1. Go to https://vercel.com → New Project → Import the GitHub repo
2. Framework preset: Next.js (auto-detected)
3. Add environment variables (copy from `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL` → set to your Vercel preview URL (update after first deploy)
4. Click Deploy

- [ ] **Step 3: Verify deployment**

Expected: Vercel shows green deployment. Visit the preview URL and confirm the placeholder home page renders.

- [ ] **Step 4: Smoke test generate-qr on production URL**

```bash
curl -X POST https://your-vercel-preview-url.vercel.app/api/generate-qr \
  -H "Content-Type: application/json" \
  -d '{}'
```

Expected: `{"error":"token and campaignId are required"}` — confirms the API route is live.

---

## Definition of Done Checklist

- [ ] `npm test` passes all 8 tests
- [ ] `npm run dev` starts with no errors
- [ ] Supabase has `campaigns` and `gift_tokens` tables with RLS enabled
- [ ] `qr-codes` storage bucket exists and is public
- [ ] Test admin and distributor users exist with correct `app_metadata` roles
- [ ] App deploys cleanly to Vercel
- [ ] `POST /api/generate-qr` returns 400 for missing fields (verified via curl on production URL)
