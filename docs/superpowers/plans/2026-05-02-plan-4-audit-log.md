# Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record key admin actions (campaign created/launched/closed/deleted/duplicated, reminder sent, token redeemed) in an `audit_events` table and display them in a new `/admin/audit` page.

**Architecture:** A `logAuditEvent()` helper in `src/lib/audit.ts` makes fire-and-forget inserts using the service role client. It is called after the primary action succeeds in each relevant API route. A new server-component page reads the log and renders it in a table, paginated at 50 rows. RLS allows only `company_admin` to read their company's events.

**Tech Stack:** Next.js 15 App Router, Supabase service role, Tailwind CSS.

---

## File Map

- **Create:** `supabase/migrations/20240502000016_audit_events.sql` — new table + RLS
- **Modify:** `.github/workflows/migrate.yml` — add 016 to whitelist + idempotent patch
- **Create:** `src/lib/audit.ts` — `logAuditEvent()` helper
- **Modify:** `src/app/api/campaigns/route.ts` — log `campaign.created`
- **Modify:** `src/app/api/campaigns/[id]/send/route.ts` — log `campaign.launched`
- **Modify:** `src/app/api/campaigns/[id]/close/route.ts` — log `campaign.closed`
- **Modify:** `src/app/api/campaigns/[id]/route.ts` — log `campaign.deleted`
- **Modify:** `src/app/api/campaigns/[id]/duplicate/route.ts` — log `campaign.duplicated`
- **Modify:** `src/app/api/campaigns/[id]/resend/route.ts` — log `campaign.reminder_sent`
- **Modify:** `src/app/api/verify/[token]/route.ts` — log `token.redeemed`
- **Create:** `src/app/api/audit/route.ts` — paginated audit log API
- **Create:** `src/app/admin/audit/page.tsx` — audit log admin page
- **Modify:** `src/components/admin/Sidebar.tsx` — add Audit Log nav item

---

### Task 1: Migration — audit_events table

**Files:**
- Create: `supabase/migrations/20240502000016_audit_events.sql`
- Modify: `.github/workflows/migrate.yml`

- [ ] **Step 1: Write migration**

Create `supabase/migrations/20240502000016_audit_events.sql`:

```sql
CREATE TABLE audit_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   UUID,
  metadata      JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_company_idx ON audit_events (company_id, created_at DESC);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_company_admin_read"
  ON audit_events
  FOR SELECT
  USING (
    company_id = public.jwt_company_id()
    AND EXISTS (
      SELECT 1 FROM user_company_roles ucr
      JOIN roles r ON r.id = ucr.role_id
      WHERE ucr.user_id = auth.uid()
        AND ucr.company_id = audit_events.company_id
        AND r.name = 'company_admin'
    )
  );
```

- [ ] **Step 2: Add to workflow whitelist and idempotent patch**

In `.github/workflows/migrate.yml`, add `'20240502000016'` to the DELETE whitelist.

In the idempotent patch SQL block, add:
```sql
          CREATE TABLE IF NOT EXISTS audit_events (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            actor_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
            action        TEXT NOT NULL,
            resource_type TEXT NOT NULL,
            resource_id   UUID,
            metadata      JSONB NOT NULL DEFAULT '{}',
            created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
          );
          CREATE INDEX IF NOT EXISTS audit_events_company_idx ON audit_events (company_id, created_at DESC);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20240502000016_audit_events.sql .github/workflows/migrate.yml
git commit -m "feat: add audit_events table with RLS for company_admin"
```

---

### Task 2: `logAuditEvent()` helper

**Files:**
- Create: `src/lib/audit.ts`

- [ ] **Step 1: Create the helper**

Create `src/lib/audit.ts`:

```typescript
import { createServiceClient } from '@/lib/supabase/server'

type AuditAction =
  | 'campaign.created'
  | 'campaign.launched'
  | 'campaign.closed'
  | 'campaign.deleted'
  | 'campaign.duplicated'
  | 'campaign.reminder_sent'
  | 'token.redeemed'

type AuditEventInput = {
  companyId: string
  actorId: string | null
  action: AuditAction
  resourceType: 'campaign' | 'gift_token'
  resourceId?: string
  metadata?: Record<string, unknown>
}

export function logAuditEvent(input: AuditEventInput): void {
  // Fire-and-forget — never await this, never let it block the primary action
  const service = createServiceClient()
  service
    .from('audit_events')
    .insert({
      company_id: input.companyId,
      actor_id: input.actorId,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId ?? null,
      metadata: input.metadata ?? {},
    })
    .then(({ error }) => {
      if (error) console.error('[audit] insert failed:', error.message)
    })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/audit.ts
git commit -m "feat: add logAuditEvent helper for fire-and-forget audit logging"
```

---

### Task 3: Wire audit logging into campaign API routes

**Files:**
- Modify: `src/app/api/campaigns/route.ts`
- Modify: `src/app/api/campaigns/[id]/send/route.ts`
- Modify: `src/app/api/campaigns/[id]/close/route.ts`
- Modify: `src/app/api/campaigns/[id]/route.ts`
- Modify: `src/app/api/campaigns/[id]/duplicate/route.ts`
- Modify: `src/app/api/campaigns/[id]/resend/route.ts`

- [ ] **Step 1: Log `campaign.created` in `POST /api/campaigns`**

In `src/app/api/campaigns/route.ts`, add import:
```typescript
import { logAuditEvent } from '@/lib/audit'
```

After the successful insert (after `if (error || !data)`), add:
```typescript
logAuditEvent({
  companyId: appMeta.company_id,
  actorId: user.id,
  action: 'campaign.created',
  resourceType: 'campaign',
  resourceId: data.id,
  metadata: { name: name.trim() },
})
```

- [ ] **Step 2: Log `campaign.launched` in `POST /api/campaigns/[id]/send`**

In `src/app/api/campaigns/[id]/send/route.ts`, add import:
```typescript
import { logAuditEvent } from '@/lib/audit'
```

After the `sent_at` update at the bottom of the route (after the update statement), add:
```typescript
if (!isCronCall) {
  logAuditEvent({
    companyId: campaign.company_id,
    actorId: user?.id ?? null,
    action: 'campaign.launched',
    resourceType: 'campaign',
    resourceId: campaignId,
    metadata: { name: campaign.name, token_count: tokens.length },
  })
}
```

Note: `user` is only defined in the non-cron path. Only log for human-initiated launches.

- [ ] **Step 3: Log `campaign.closed`**

Read `src/app/api/campaigns/[id]/close/route.ts` first to understand its shape, then add after the successful update:
```typescript
import { logAuditEvent } from '@/lib/audit'

// After successful close update:
logAuditEvent({
  companyId: appMeta.company_id,
  actorId: user.id,
  action: 'campaign.closed',
  resourceType: 'campaign',
  resourceId: campaignId,
  metadata: { name: campaign.name },
})
```

- [ ] **Step 4: Log `campaign.deleted`**

In `src/app/api/campaigns/[id]/route.ts`, add import and logging after successful delete:
```typescript
import { logAuditEvent } from '@/lib/audit'

// After successful delete, before returning 204:
logAuditEvent({
  companyId: appMeta.company_id,
  actorId: user.id,
  action: 'campaign.deleted',
  resourceType: 'campaign',
  resourceId: campaignId,
  metadata: { name: campaign.name },
})
```

- [ ] **Step 5: Log `campaign.duplicated`**

In `src/app/api/campaigns/[id]/duplicate/route.ts`, add import and logging after new campaign is created:
```typescript
import { logAuditEvent } from '@/lib/audit'

// After newCampaign is inserted successfully:
logAuditEvent({
  companyId: appMeta.company_id,
  actorId: user.id,
  action: 'campaign.duplicated',
  resourceType: 'campaign',
  resourceId: newCampaign.id,
  metadata: { name: name.trim(), source_id: sourceCampaignId },
})
```

- [ ] **Step 6: Log `campaign.reminder_sent`**

In `src/app/api/campaigns/[id]/resend/route.ts`, add import and logging at the end before the return:
```typescript
import { logAuditEvent } from '@/lib/audit'

// After the send loop, before returning:
logAuditEvent({
  companyId: appMeta.company_id,
  actorId: user.id,
  action: 'campaign.reminder_sent',
  resourceType: 'campaign',
  resourceId: campaignId,
  metadata: { name: campaign.name, dispatched, failed },
})
```

- [ ] **Step 7: Commit**

```bash
git add src/app/api/campaigns/route.ts src/app/api/campaigns/[id]/send/route.ts src/app/api/campaigns/[id]/close/route.ts src/app/api/campaigns/[id]/route.ts src/app/api/campaigns/[id]/duplicate/route.ts src/app/api/campaigns/[id]/resend/route.ts
git commit -m "feat: wire audit logging into campaign lifecycle API routes"
```

---

### Task 4: Log token redemptions

**Files:**
- Modify: `src/app/api/verify/[token]/route.ts`

- [ ] **Step 1: Add audit log on redemption**

In `src/app/api/verify/[token]/route.ts`, add import:
```typescript
import { logAuditEvent } from '@/lib/audit'
```

After the successful `redeemed` update (inside `if (redeemed)`):
```typescript
if (redeemed) {
  logAuditEvent({
    companyId: campaign?.company_id ?? '',
    actorId: distributorId,
    action: 'token.redeemed',
    resourceType: 'gift_token',
    resourceId: tokenRow.id,
    metadata: {
      employee_name: redeemed.employee_name,
      campaign_name: (tokenRow.campaigns as { name?: string } | null)?.name ?? '',
    },
  })
  return NextResponse.json({ valid: true, employeeName: redeemed.employee_name })
}
```

Note: `tokenRow.campaigns` is already selected in the route. Update the select to also include `name`:
```typescript
const { data: tokenRow } = await supabase
  .from('gift_tokens')
  .select('id, employee_name, redeemed, campaign_id, campaigns(closed_at, company_id, name)')
  .eq('token', token)
  .single()
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/verify/[token]/route.ts
git commit -m "feat: log token redemption events to audit_events"
```

---

### Task 5: Audit log API + admin page

**Files:**
- Create: `src/app/api/audit/route.ts`
- Create: `src/app/admin/audit/page.tsx`
- Modify: `src/components/admin/Sidebar.tsx`

- [ ] **Step 1: Create audit API route**

Create `src/app/api/audit/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

const ACTION_LABELS: Record<string, string> = {
  'campaign.created': 'Created campaign',
  'campaign.launched': 'Launched campaign',
  'campaign.closed': 'Closed campaign',
  'campaign.deleted': 'Deleted campaign',
  'campaign.duplicated': 'Duplicated campaign',
  'campaign.reminder_sent': 'Sent reminder',
  'token.redeemed': 'Redeemed gift',
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (appMeta.role_name !== 'company_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const page = Math.max(0, parseInt(searchParams.get('page') ?? '0', 10))
  const PAGE_SIZE = 50

  const service = createServiceClient()
  const { data: events } = await service
    .from('audit_events')
    .select('id, action, resource_type, resource_id, metadata, created_at, actor_id')
    .eq('company_id', appMeta.company_id)
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (!events) return NextResponse.json({ events: [] })

  // Fetch actor names
  const actorIds = [...new Set(events.map((e) => e.actor_id).filter(Boolean) as string[])]
  const actorNames = new Map<string, string>()
  await Promise.all(
    actorIds.map(async (id) => {
      const result = await service.auth.admin.getUserById(id)
      const u = result.data?.user
      actorNames.set(id, u?.user_metadata?.full_name ?? u?.email?.split('@')[0] ?? id)
    })
  )

  const enriched = events.map((e) => ({
    id: e.id,
    action: e.action,
    label: ACTION_LABELS[e.action] ?? e.action,
    resourceType: e.resource_type,
    resourceId: e.resource_id,
    metadata: e.metadata as Record<string, unknown>,
    actorName: e.actor_id ? (actorNames.get(e.actor_id) ?? 'Unknown') : 'System',
    createdAt: e.created_at,
  }))

  return NextResponse.json({ events: enriched, page, hasMore: events.length === PAGE_SIZE })
}
```

- [ ] **Step 2: Create the admin audit page**

Create `src/app/admin/audit/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

const ACTION_LABELS: Record<string, string> = {
  'campaign.created': 'Created campaign',
  'campaign.launched': 'Launched campaign',
  'campaign.closed': 'Closed campaign',
  'campaign.deleted': 'Deleted campaign',
  'campaign.duplicated': 'Duplicated campaign',
  'campaign.reminder_sent': 'Sent reminder',
  'token.redeemed': 'Redeemed gift',
}

export default async function AuditPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const appMeta = user.app_metadata as JwtAppMetadata
  if (appMeta.role_name !== 'company_admin') redirect('/admin')

  const service = createServiceClient()

  const { data: events } = await service
    .from('audit_events')
    .select('id, action, resource_type, metadata, created_at, actor_id')
    .eq('company_id', appMeta.company_id)
    .order('created_at', { ascending: false })
    .limit(50)

  const actorIds = [...new Set((events ?? []).map((e) => e.actor_id).filter(Boolean) as string[])]
  const actorNames = new Map<string, string>()
  await Promise.all(
    actorIds.map(async (id) => {
      const result = await service.auth.admin.getUserById(id)
      const u = result.data?.user
      actorNames.set(id, u?.user_metadata?.full_name ?? u?.email?.split('@')[0] ?? id)
    })
  )

  function resourceLabel(action: string, metadata: Record<string, unknown>): string {
    if (metadata.name) return `"${metadata.name}"`
    if (metadata.employee_name) return `${metadata.employee_name}`
    return ''
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Audit Log</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Last 50 actions in your company</p>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {(!events || events.length === 0) ? (
          <div className="text-center py-16 text-zinc-400 text-sm">No activity yet.</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                <th className="px-5 py-3 font-medium">Time</th>
                <th className="px-5 py-3 font-medium">Who</th>
                <th className="px-5 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => {
                const meta = e.metadata as Record<string, unknown>
                const label = ACTION_LABELS[e.action] ?? e.action
                const resource = resourceLabel(e.action, meta)
                const actor = e.actor_id ? (actorNames.get(e.actor_id) ?? 'Unknown') : 'System'
                return (
                  <tr key={e.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                    <td className="px-5 py-3 text-zinc-400 text-xs whitespace-nowrap">
                      {formatDate(e.created_at)}
                    </td>
                    <td className="px-5 py-3 font-medium text-zinc-700">{actor}</td>
                    <td className="px-5 py-3 text-zinc-600">
                      {label}{resource ? <> <span className="font-medium text-zinc-800">{resource}</span></> : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add Audit Log to sidebar**

In `src/components/admin/Sidebar.tsx`, add after the Settings nav item:

```tsx
const isAudit = pathname.startsWith('/admin/audit')
```

And add the nav item (only shown for company_admin — but since Sidebar doesn't receive the role, simply add it; the page itself will redirect non-admins):
```tsx
{navItem('/admin/audit', 'Audit Log', isAudit,
  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
)}
```

- [ ] **Step 4: Verify**

Navigate to `/admin/audit`. Should show an empty table initially. Perform some actions (create campaign, launch, redeem a token). Refresh `/admin/audit` — the events should appear.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/audit/route.ts src/app/admin/audit/page.tsx src/components/admin/Sidebar.tsx
git commit -m "feat: add audit log page and API with sidebar nav item"
```
