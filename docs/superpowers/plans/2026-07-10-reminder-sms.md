# Reminder SMS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each campaign define a reminder SMS message that is independent from the primary message, editable in the creation wizard and (uniquely) after the campaign has launched.

**Architecture:** A new nullable `reminder_sms_template` column on `campaigns`, resolved at send time through a new `resolveReminderTemplate()` helper that falls back to the existing primary-message resolution chain. A new route, `PATCH /api/campaigns/[id]/reminder-template`, is the only campaign-editing endpoint not gated by `sent_at`, and is used identically by both the wizard and the post-launch detail page via one shared `ReminderSmsTemplate` component.

**Tech Stack:** Next.js App Router, Supabase (Postgres, service-role client), Vitest, React (client components), the project's flat-key `useT()` i18n system.

## Global Constraints

- Never expose the Supabase service-role key to the browser; service-role Supabase calls stay inside API routes (`.claude/rules/architecture.md`).
- Validate inputs at API route boundaries; trust nothing from the client (`.claude/rules/architecture.md`).
- Keep one source of truth for redemption/campaign state in Supabase; do not derive it elsewhere (`.claude/rules/00-global.md`).
- No new infrastructure beyond what's needed — no new tables, no queues, no cron (`.claude/rules/00-global.md`, spec Decision 3).
- Reminder template validation must mirror the primary template's existing rule: a non-empty template must contain `{link}` (spec Decision 2).
- The generic `PATCH /api/campaigns/[id]` 409-on-`sent_at` guard must remain untouched for every field except the new reminder route (spec Decision 5).

---

### Task 1: Database migration + Campaign type

**Files:**
- Create: `supabase/migrations/20240701000034_campaign_reminder_sms_template.sql`
- Modify: `src/types/index.ts:40`

**Interfaces:**
- Produces: `campaigns.reminder_sms_template` column (`TEXT`, nullable) and `Campaign.reminder_sms_template: string | null` in the shared type, used by every later task.

- [ ] **Step 1: Write the migration**

```sql
-- Optional per-campaign reminder SMS override. NULL = use the effective primary
-- message (campaign.sms_template -> companies.sms_template -> built-in default).
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS reminder_sms_template TEXT;
```

Save as `supabase/migrations/20240701000034_campaign_reminder_sms_template.sql`.

- [ ] **Step 2: Verify the migration applies cleanly**

Run: `npm run e2e:db`
Expected: script completes and prints `✅ local E2E DB ready — applied N migrations as supabase_admin`, where N includes the new migration file (one more than before this task).

- [ ] **Step 3: Add the field to the shared Campaign type**

In `src/types/index.ts`, the `Campaign` type currently ends:

```ts
  supports_arrival_certificates: boolean
  max_attendee_count: number | null
  sms_template: string | null
}
```

Change to:

```ts
  supports_arrival_certificates: boolean
  max_attendee_count: number | null
  sms_template: string | null
  reminder_sms_template: string | null
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors mentioning `types/index.ts`. (Pre-existing errors about `.next/types/validator.ts` referencing removed `/admin/sms/credits` routes are unrelated stale-cache noise from an earlier merge and are expected to still appear.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20240701000034_campaign_reminder_sms_template.sql src/types/index.ts
git commit -m "feat(db): add reminder_sms_template column to campaigns"
```

---

### Task 2: `resolveReminderTemplate` helper

**Files:**
- Modify: `src/lib/sms-template.ts`
- Test: `tests/lib/sms-template.test.ts`

**Interfaces:**
- Consumes: `resolveSmsTemplate(campaignTemplate: string | null, companyTemplate: string | null): string | null` (already exists in `src/lib/sms-template.ts`).
- Produces: `resolveReminderTemplate(reminderTemplate: string | null, campaignTemplate: string | null, companyTemplate: string | null): string | null`, used by Task 4 (`resend/route.ts`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/lib/sms-template.test.ts`:

```ts
import { renderSmsTemplate, resolveSmsTemplate, resolveReminderTemplate } from '@/lib/sms-template'
```

(This replaces the existing `import { renderSmsTemplate, resolveSmsTemplate } from '@/lib/sms-template'` line at the top of the file.)

Add a new `describe` block at the end of the file:

```ts
describe('resolveReminderTemplate', () => {
  it('prefers a non-empty reminder template over everything else', () => {
    expect(resolveReminderTemplate('rem {link}', 'camp {link}', 'co {link}')).toBe('rem {link}')
  })
  it('falls back to resolveSmsTemplate when reminder is null', () => {
    expect(resolveReminderTemplate(null, 'camp {link}', 'co {link}')).toBe('camp {link}')
  })
  it('falls back to the company template when reminder and campaign are both absent', () => {
    expect(resolveReminderTemplate(null, null, 'co {link}')).toBe('co {link}')
  })
  it('treats a whitespace-only reminder as absent', () => {
    expect(resolveReminderTemplate('   ', 'camp {link}', 'co {link}')).toBe('camp {link}')
  })
  it('returns null when nothing is set anywhere', () => {
    expect(resolveReminderTemplate(null, null, null)).toBeNull()
  })
  it('trims the chosen reminder template', () => {
    expect(resolveReminderTemplate('  rem {link}  ', null, null)).toBe('rem {link}')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/sms-template.test.ts`
Expected: FAIL — `resolveReminderTemplate` is not exported from `@/lib/sms-template`.

- [ ] **Step 3: Implement the helper**

Append to `src/lib/sms-template.ts`:

```ts

/**
 * Picks the effective reminder template: reminder override if non-empty, else
 * whatever resolveSmsTemplate would pick for the primary message. Trims, treats
 * whitespace-only as absent.
 */
export function resolveReminderTemplate(
  reminderTemplate: string | null,
  campaignTemplate: string | null,
  companyTemplate: string | null,
): string | null {
  const rem = reminderTemplate?.trim()
  if (rem) return rem
  return resolveSmsTemplate(campaignTemplate, companyTemplate)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/sms-template.test.ts`
Expected: PASS, all tests including the 6 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sms-template.ts tests/lib/sms-template.test.ts
git commit -m "feat(sms): add resolveReminderTemplate fallback helper"
```

---

### Task 3: `PATCH /api/campaigns/[id]/reminder-template` route

**Files:**
- Create: `src/app/api/campaigns/[id]/reminder-template/route.ts`
- Test: `tests/api/campaign-reminder-template.test.ts`
- Modify: `src/lib/audit.ts:10`
- Modify: `src/app/admin/audit/AuditLogTable.tsx:11`
- Modify: `src/lib/i18n/translations.he.ts:602`

**Interfaces:**
- Consumes: `createClient`/`createServiceClient` (`@/lib/supabase/server`), `fetchPermissions`/`hasPermission` (`@/lib/permissions`), `resolveCompanyId` (`@/lib/platform-auth`), `logAuditEvent` (`@/lib/audit`), `JwtAppMetadata` (`@/types`) — all with the same signatures already used in `src/app/api/campaigns/[id]/route.ts`.
- Produces: `PATCH /api/campaigns/[id]/reminder-template` accepting `{ reminderSmsTemplate: string | null }`, **not gated by `campaign.sent_at`**. Used by the `ReminderSmsTemplate` component built in Task 5.

- [ ] **Step 1: Write the failing tests**

Create `tests/api/campaign-reminder-template.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeServiceFrom } from '../helpers/supabase-mock'

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

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/campaigns/c-1/reminder-template', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = { params: Promise.resolve({ id: 'c-1' }) }

describe('PATCH /api/campaigns/[id]/reminder-template', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', app_metadata: { company_id: 'company-1', role_id: 'role-1', role_name: 'company_admin' } } },
    })
  })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { PATCH } = await import('@/app/api/campaigns/[id]/reminder-template/route')
    const res = await PATCH(makeRequest({ reminderSmsTemplate: 'Hi {link}' }), params)
    expect(res.status).toBe(401)
  })

  it('returns 403 when missing permission', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)
    const { PATCH } = await import('@/app/api/campaigns/[id]/reminder-template/route')
    const res = await PATCH(makeRequest({ reminderSmsTemplate: 'Hi {link}' }), params)
    expect(res.status).toBe(403)
  })

  it('returns 400 when reminderSmsTemplate is missing from the body', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/reminder-template/route')
    const res = await PATCH(makeRequest({}), params)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('reminderSmsTemplate is required')
  })

  it('returns 400 invalid_template when {link} is missing', async () => {
    mockFromService.mockImplementation(makeServiceFrom({
      campaigns: { data: { id: 'c-1' }, error: null },
    }))
    const { PATCH } = await import('@/app/api/campaigns/[id]/reminder-template/route')
    const res = await PATCH(makeRequest({ reminderSmsTemplate: 'no link here' }), params)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_template')
  })

  it('persists a valid reminder template containing {link}', async () => {
    const from = makeServiceFrom({ campaigns: { data: { id: 'c-1' }, error: null } })
    mockFromService.mockImplementation(from)
    const { PATCH } = await import('@/app/api/campaigns/[id]/reminder-template/route')
    const res = await PATCH(makeRequest({ reminderSmsTemplate: 'Reminder for {name}: {link}' }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(from.builders.campaigns.update).toHaveBeenCalledWith({ reminder_sms_template: 'Reminder for {name}: {link}' })
  })

  it('clears the reminder template when given null', async () => {
    const from = makeServiceFrom({ campaigns: { data: { id: 'c-1' }, error: null } })
    mockFromService.mockImplementation(from)
    const { PATCH } = await import('@/app/api/campaigns/[id]/reminder-template/route')
    const res = await PATCH(makeRequest({ reminderSmsTemplate: null }), params)
    expect(res.status).toBe(200)
    expect(from.builders.campaigns.update).toHaveBeenCalledWith({ reminder_sms_template: null })
  })

  it('returns 404 when the campaign is not found', async () => {
    mockFromService.mockImplementation(makeServiceFrom({
      campaigns: { data: null, error: null },
    }))
    const { PATCH } = await import('@/app/api/campaigns/[id]/reminder-template/route')
    const res = await PATCH(makeRequest({ reminderSmsTemplate: 'Hi {link}' }), params)
    expect(res.status).toBe(404)
  })

  it('succeeds even when the campaign has already been sent (no sent_at gate)', async () => {
    const from = makeServiceFrom({ campaigns: { data: { id: 'c-1' }, error: null } })
    mockFromService.mockImplementation(from)
    const { PATCH } = await import('@/app/api/campaigns/[id]/reminder-template/route')
    const res = await PATCH(makeRequest({ reminderSmsTemplate: 'Hi {link}' }), params)
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/api/campaign-reminder-template.test.ts`
Expected: FAIL — cannot find module `@/app/api/campaigns/[id]/reminder-template/route`.

- [ ] **Step 3: Add the audit action**

In `src/lib/audit.ts`, the `AuditAction` union currently reads:

```ts
type AuditAction =
  | 'campaign.created'
  | 'campaign.launched'
  | 'campaign.closed'
  | 'campaign.updated'
  | 'campaign.deleted'
  | 'campaign.duplicated'
  | 'campaign.reminder_sent'
  | 'token.redeemed'
```

Change to add the new action after `'campaign.reminder_sent'`:

```ts
type AuditAction =
  | 'campaign.created'
  | 'campaign.launched'
  | 'campaign.closed'
  | 'campaign.updated'
  | 'campaign.deleted'
  | 'campaign.duplicated'
  | 'campaign.reminder_sent'
  | 'campaign.reminder_template_updated'
  | 'token.redeemed'
```

- [ ] **Step 4: Add the audit log label (English + Hebrew)**

In `src/app/admin/audit/AuditLogTable.tsx`, the `ACTION_KEY` map currently reads:

```ts
const ACTION_KEY: Record<string, string> = {
  'campaign.created': 'Created campaign',
  'campaign.launched': 'Launched campaign',
  'campaign.closed': 'Closed campaign',
  'campaign.deleted': 'Deleted campaign',
  'campaign.duplicated': 'Duplicated campaign',
  'campaign.reminder_sent': 'Sent reminder',
  'token.redeemed': 'Redeemed gift',
}
```

Change to add a new entry after `'campaign.reminder_sent'`:

```ts
const ACTION_KEY: Record<string, string> = {
  'campaign.created': 'Created campaign',
  'campaign.launched': 'Launched campaign',
  'campaign.closed': 'Closed campaign',
  'campaign.deleted': 'Deleted campaign',
  'campaign.duplicated': 'Duplicated campaign',
  'campaign.reminder_sent': 'Sent reminder',
  'campaign.reminder_template_updated': 'Updated reminder message',
  'token.redeemed': 'Redeemed gift',
}
```

In `src/lib/i18n/translations.he.ts`, line 602 currently reads:

```ts
  'Sent reminder': 'שלח תזכורת',
  'Redeemed gift': 'מימש מתנה',
```

Change to:

```ts
  'Sent reminder': 'שלח תזכורת',
  'Updated reminder message': 'עדכן הודעת תזכורת',
  'Redeemed gift': 'מימש מתנה',
```

- [ ] **Step 5: Implement the route**

Create `src/app/api/campaigns/[id]/reminder-template/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/audit'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)
  if (!hasPermission(permissions, 'campaigns:launch')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  if (!('reminderSmsTemplate' in body)) {
    return NextResponse.json({ error: 'reminderSmsTemplate is required' }, { status: 400 })
  }

  const raw = body.reminderSmsTemplate
  let reminderSmsTemplate: string | null
  if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    reminderSmsTemplate = null
  } else if (typeof raw === 'string') {
    if (!raw.includes('{link}')) {
      return NextResponse.json({ error: 'invalid_template' }, { status: 400 })
    }
    reminderSmsTemplate = raw.trim()
  } else {
    return NextResponse.json({ error: 'invalid_template' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const { error: updateError } = await service
    .from('campaigns')
    .update({ reminder_sms_template: reminderSmsTemplate })
    .eq('id', campaignId)
    .eq('company_id', companyId)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update reminder message' }, { status: 500 })
  }

  logAuditEvent({
    companyId,
    actorId: user.id,
    action: 'campaign.reminder_template_updated',
    resourceType: 'campaign',
    resourceId: campaignId,
    metadata: { reminderSmsTemplate },
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/api/campaign-reminder-template.test.ts`
Expected: PASS, all 8 tests.

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors mentioning `audit.ts`, `AuditLogTable.tsx`, or `reminder-template/route.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/campaigns/\[id\]/reminder-template/route.ts tests/api/campaign-reminder-template.test.ts src/lib/audit.ts src/app/admin/audit/AuditLogTable.tsx src/lib/i18n/translations.he.ts
git commit -m "feat(api): add reminder-template route, not gated by sent_at"
```

---

### Task 4: Wire the reminder resolution into `resend/route.ts`

**Files:**
- Modify: `src/app/api/campaigns/[id]/resend/route.ts`
- Test: `tests/api/resend.test.ts`

**Interfaces:**
- Consumes: `resolveReminderTemplate` from Task 2.

- [ ] **Step 1: Write the failing tests**

In `tests/api/resend.test.ts`, add a provider mock so the test can inspect which template text was actually sent. Replace the top of the file:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeServiceFrom } from '../helpers/supabase-mock'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()
const mockSend = vi.fn().mockResolvedValue({ sid: 'mock' })
const mockProviderSend = vi.fn().mockResolvedValue({ providerId: 'mock', status: 'sent' })

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({ from: mockFromService }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['campaigns:launch']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/twilio', () => ({ sendGiftMMS: mockSend }))
vi.mock('@/lib/sms', () => ({ getSmsProvider: () => ({ send: mockProviderSend }) }))
```

(This adds the `mockProviderSend` declaration and the new `vi.mock('@/lib/sms', ...)` block; everything else in the file's setup is unchanged.)

In the `beforeEach`, add a reset for the new mock. It currently reads:

```ts
  beforeEach(async () => {
    vi.resetAllMocks()
    vi.stubEnv('SMS_MOCK', 'true')
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockSend.mockResolvedValue({ sid: 'mock' })
    mockGetUser.mockResolvedValue({
```

Change to:

```ts
  beforeEach(async () => {
    vi.resetAllMocks()
    vi.stubEnv('SMS_MOCK', 'true')
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockSend.mockResolvedValue({ sid: 'mock' })
    mockProviderSend.mockResolvedValue({ providerId: 'mock', status: 'sent' })
    mockGetUser.mockResolvedValue({
```

Add two new tests at the end of the `describe` block, after the `'dispatches to unclaimed tokens...'` test:

```ts
  it('uses the reminder template override instead of the primary template', async () => {
    mockFromService.mockImplementation(makeServiceFrom({
      campaigns: { data: { id: 'c-1', name: 'Test', company_id: 'company-1', sms_template: 'Primary msg {link}', reminder_sms_template: 'Reminder msg {link}' }, error: null },
      companies: { data: { sms_template: null }, error: null },
      gift_tokens: { data: [{ id: 't-1', token: 'uuid-1', employee_name: 'Omer', phone_number: '+972501234567', qr_image_url: 'https://example.com/qr.png' }], error: null },
    }))
    const { POST } = await import('@/app/api/campaigns/[id]/resend/route')
    const res = await POST(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(200)
    expect(mockProviderSend).toHaveBeenCalledTimes(1)
    const sentBody = mockProviderSend.mock.calls[0][0].body
    expect(sentBody).toContain('Reminder msg')
    expect(sentBody).not.toContain('Primary msg')
  })

  it('falls back to the primary template when no reminder override is set', async () => {
    mockFromService.mockImplementation(makeServiceFrom({
      campaigns: { data: { id: 'c-1', name: 'Test', company_id: 'company-1', sms_template: 'Primary msg {link}', reminder_sms_template: null }, error: null },
      companies: { data: { sms_template: null }, error: null },
      gift_tokens: { data: [{ id: 't-1', token: 'uuid-1', employee_name: 'Omer', phone_number: '+972501234567', qr_image_url: 'https://example.com/qr.png' }], error: null },
    }))
    const { POST } = await import('@/app/api/campaigns/[id]/resend/route')
    const res = await POST(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(200)
    const sentBody = mockProviderSend.mock.calls[0][0].body
    expect(sentBody).toContain('Primary msg')
  })
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run tests/api/resend.test.ts`
Expected: the two new tests FAIL (`campaign.reminder_sms_template` is selected as `undefined` — not yet read by the route — and `resolveSmsTemplate` still computes off `campaign.sms_template` alone, so both `'Reminder msg'` and the fallback assertions may pass or fail inconsistently since the route doesn't yet know about the reminder column; run to confirm at least one new test fails before proceeding). The 3 pre-existing tests should still PASS (the new provider mock returns the same shape as the real mock-mode provider).

- [ ] **Step 3: Update the resend route**

In `src/app/api/campaigns/[id]/resend/route.ts`, the import currently reads:

```ts
import { resolveSmsTemplate } from '@/lib/sms-template'
```

Change to:

```ts
import { resolveReminderTemplate } from '@/lib/sms-template'
```

The campaign select currently reads:

```ts
  const { data: campaign } = await service
    .from('campaigns')
    .select('id, name, sms_template')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()
```

Change to:

```ts
  const { data: campaign } = await service
    .from('campaigns')
    .select('id, name, sms_template, reminder_sms_template')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()
```

The effective template computation currently reads:

```ts
  const effectiveTemplate = resolveSmsTemplate(campaign.sms_template, company?.sms_template ?? null)
```

Change to:

```ts
  const effectiveTemplate = resolveReminderTemplate(
    campaign.reminder_sms_template,
    campaign.sms_template,
    company?.sms_template ?? null,
  )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/api/resend.test.ts`
Expected: PASS, all tests including the 2 new ones.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors mentioning `resend/route.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/campaigns/\[id\]/resend/route.ts tests/api/resend.test.ts
git commit -m "feat(api): resend route sends the resolved reminder template"
```

---

### Task 5: `ReminderSmsTemplate` shared component

**Files:**
- Create: `src/components/admin/ReminderSmsTemplate.tsx`
- Modify: `src/lib/i18n/translations.he.ts:55`

**Interfaces:**
- Consumes: `SmsLengthHint` (`@/components/admin/SmsLengthHint`, prop `template: string`), `useT` (`@/lib/i18n/useT`).
- Produces: `ReminderSmsTemplate({ campaignId: string, initial: string | null, effectivePrimaryTemplate: string | null })`, a self-contained card (own heading, textarea, save button — same shape as `CampaignSmsTemplate`). Used by Task 6 (wizard) and Task 7 (detail page).

This is a UI-only component with no business logic beyond what Task 2/3 already cover and test — consistent with `CampaignSmsTemplate.tsx`, it has no unit test of its own; correctness is verified by the manual QA pass in Task 8.

- [ ] **Step 1: Add the new i18n strings**

In `src/lib/i18n/translations.he.ts`, lines 51–55 currently read:

```ts
  'SMS message': 'הודעת SMS',
  'Leave empty to use the default from Settings.': 'השאירו ריק כדי להשתמש בברירת המחדל מההגדרות.',
  'Use {name} for the recipient and {link} for the gift link.': 'השתמשו ב-{name} עבור שם הנמען וב-{link} עבור קישור המתנה.',
  'The message must contain {link}.': 'ההודעה חייבת לכלול {link}.',
  'Could not save. Please try again.': 'לא ניתן לשמור. נסו שוב.',
```

Change to add three new entries after `'SMS message'`:

```ts
  'SMS message': 'הודעת SMS',
  'Reminder message': 'הודעת תזכורת',
  'Leave empty to use the primary message.': 'השאירו ריק כדי להשתמש בהודעה הראשית.',
  'Leave empty to use the default reminder text.': 'השאירו ריק כדי להשתמש בטקסט התזכורת המובנה.',
  'Leave empty to use the default from Settings.': 'השאירו ריק כדי להשתמש בברירת המחדל מההגדרות.',
  'Use {name} for the recipient and {link} for the gift link.': 'השתמשו ב-{name} עבור שם הנמען וב-{link} עבור קישור המתנה.',
  'The message must contain {link}.': 'ההודעה חייבת לכלול {link}.',
  'Could not save. Please try again.': 'לא ניתן לשמור. נסו שוב.',
```

- [ ] **Step 2: Create the component**

Create `src/components/admin/ReminderSmsTemplate.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'
import { SmsLengthHint } from '@/components/admin/SmsLengthHint'

type Props = {
  campaignId: string
  initial: string | null
  effectivePrimaryTemplate: string | null
}

export function ReminderSmsTemplate({ campaignId, initial, effectivePrimaryTemplate }: Props) {
  const t = useT()
  const router = useRouter()
  const [value, setValue] = useState(initial ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const trimmed = value.trim()
    if (trimmed !== '' && !trimmed.includes('{link}')) {
      setError(t('The message must contain {link}.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/reminder-template`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminderSmsTemplate: trimmed === '' ? null : trimmed }),
      })
      if (!res.ok) {
        setError(t('Could not save. Please try again.'))
      } else {
        router.refresh()
      }
    } catch {
      setError(t('Could not save. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  const hasPrimary = !!effectivePrimaryTemplate?.trim()
  const placeholder = hasPrimary
    ? effectivePrimaryTemplate!
    : t('Use {name} for the recipient and {link} for the gift link.')
  const helperText = hasPrimary
    ? t('Leave empty to use the primary message.')
    : t('Leave empty to use the default reminder text.')

  return (
    <div className="flex flex-col gap-2 bg-white rounded-2xl border border-zinc-200 p-4">
      <span className="text-sm font-medium text-zinc-900">{t('Reminder message')}</span>
      <textarea
        rows={4}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-brand resize-none"
      />
      <span className="text-xs text-zinc-500">
        {t('Use {name} for the recipient and {link} for the gift link.')}{' '}
        {helperText}
      </span>
      <SmsLengthHint template={value} />
      {error && <span className="text-xs text-red-500">{error}</span>}
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="self-start bg-brand text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? t('Saving…') : t('Save')}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors mentioning `ReminderSmsTemplate.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/ReminderSmsTemplate.tsx src/lib/i18n/translations.he.ts
git commit -m "feat(ui): add ReminderSmsTemplate shared editor component"
```

---

### Task 6: Wire into the campaign wizard (Step 4)

**Files:**
- Modify: `src/components/admin/wizard/CampaignWizard.tsx`
- Modify: `src/lib/i18n/translations.he.ts:648`

**Interfaces:**
- Consumes: `ReminderSmsTemplate` (Task 5), `resolveSmsTemplate` (`@/lib/sms-template`, already exists).

- [ ] **Step 1: Add the i18n string**

In `src/lib/i18n/translations.he.ts`, line 648 currently reads:

```ts
  'Advanced settings': 'הגדרות מתקדמות',
  'Gift options': 'אפשרויות מתנה',
```

Change to:

```ts
  'Advanced settings': 'הגדרות מתקדמות',
  'Reminder SMS': 'תזכורת SMS',
  'Gift options': 'אפשרויות מתנה',
```

- [ ] **Step 2: Update imports and the campaign prop type**

In `src/components/admin/wizard/CampaignWizard.tsx`, the imports currently read:

```tsx
import { GiftOptionsEditor } from '@/components/admin/GiftOptionsEditor'
import { CampaignSmsTemplate } from '@/components/admin/CampaignSmsTemplate'
import { ArrivalCertToggle } from '@/components/admin/ArrivalCertToggle'
```

Change to:

```tsx
import { GiftOptionsEditor } from '@/components/admin/GiftOptionsEditor'
import { CampaignSmsTemplate } from '@/components/admin/CampaignSmsTemplate'
import { ReminderSmsTemplate } from '@/components/admin/ReminderSmsTemplate'
import { ArrivalCertToggle } from '@/components/admin/ArrivalCertToggle'
import { resolveSmsTemplate } from '@/lib/sms-template'
```

The `campaign` prop type currently reads:

```tsx
type CampaignWizardProps = {
  campaign: {
    id: string
    name: string
    campaign_date: string | null
    supports_arrival_certificates: boolean
    max_attendee_count: number | null
    sms_template: string | null
    wizard_last_step: number
  }
```

Change to:

```tsx
type CampaignWizardProps = {
  campaign: {
    id: string
    name: string
    campaign_date: string | null
    supports_arrival_certificates: boolean
    max_attendee_count: number | null
    sms_template: string | null
    reminder_sms_template: string | null
    wizard_last_step: number
  }
```

- [ ] **Step 3: Add state and the derived effective-primary value**

The state block currently reads:

```tsx
  const [advancedOpen, setAdvancedOpen] = useState(campaign.supports_arrival_certificates)
```

Change to:

```tsx
  const [advancedOpen, setAdvancedOpen] = useState(campaign.supports_arrival_certificates)
  const [reminderOpen, setReminderOpen] = useState(!!campaign.reminder_sms_template)
  const effectivePrimaryTemplate = resolveSmsTemplate(campaign.sms_template, companyDefaultTemplate)
```

- [ ] **Step 4: Add the "Reminder SMS" collapsible**

The step-4 block currently reads:

```tsx
        {step === 4 && (
          <div className="flex flex-col gap-4">
            <CampaignSmsTemplate
              campaignId={campaign.id} initial={campaign.sms_template} companyDefault={companyDefaultTemplate}
            />
            <div className="rounded-xl border border-zinc-200">
              <button
                type="button"
                onClick={() => setAdvancedOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-zinc-700"
                aria-expanded={advancedOpen}
              >
                <span>{t('Advanced settings')}</span>
                <span className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`}>⌄</span>
              </button>
              {advancedOpen && (
                <div className="px-4 pb-4 flex flex-col gap-4">
                  <GiftOptionsEditor campaignId={campaign.id} />
                  <ArrivalCertToggle
                    campaignId={campaign.id}
                    initial={campaign.supports_arrival_certificates}
                    initialMax={campaign.max_attendee_count}
                  />
                </div>
              )}
            </div>
          </div>
        )}
```

Change to:

```tsx
        {step === 4 && (
          <div className="flex flex-col gap-4">
            <CampaignSmsTemplate
              campaignId={campaign.id} initial={campaign.sms_template} companyDefault={companyDefaultTemplate}
            />
            <div className="rounded-xl border border-zinc-200">
              <button
                type="button"
                onClick={() => setAdvancedOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-zinc-700"
                aria-expanded={advancedOpen}
              >
                <span>{t('Advanced settings')}</span>
                <span className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`}>⌄</span>
              </button>
              {advancedOpen && (
                <div className="px-4 pb-4 flex flex-col gap-4">
                  <GiftOptionsEditor campaignId={campaign.id} />
                  <ArrivalCertToggle
                    campaignId={campaign.id}
                    initial={campaign.supports_arrival_certificates}
                    initialMax={campaign.max_attendee_count}
                  />
                </div>
              )}
            </div>
            <div className="rounded-xl border border-zinc-200">
              <button
                type="button"
                onClick={() => setReminderOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-zinc-700"
                aria-expanded={reminderOpen}
              >
                <span>{t('Reminder SMS')}</span>
                <span className={`transition-transform ${reminderOpen ? 'rotate-180' : ''}`}>⌄</span>
              </button>
              {reminderOpen && (
                <div className="px-4 pb-4">
                  <ReminderSmsTemplate
                    campaignId={campaign.id}
                    initial={campaign.reminder_sms_template}
                    effectivePrimaryTemplate={effectivePrimaryTemplate}
                  />
                </div>
              )}
            </div>
          </div>
        )}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: an error will appear at this point because `page.tsx` (Task 7) does not yet pass `reminder_sms_template` in the object it constructs for `CampaignWizard`. Confirm the error is specifically a missing-property error on the `campaign` prop in `src/app/admin/campaigns/[id]/page.tsx`, not anywhere else — that confirms Task 6's own changes are otherwise correct and will be resolved by Task 7.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/wizard/CampaignWizard.tsx src/lib/i18n/translations.he.ts
git commit -m "feat(ui): add Reminder SMS collapsible to the campaign wizard"
```

---

### Task 7: Wire into the campaign detail page (post-launch)

**Files:**
- Modify: `src/app/admin/campaigns/[id]/page.tsx`

**Interfaces:**
- Consumes: `ReminderSmsTemplate` (Task 5), `resolveSmsTemplate` (`@/lib/sms-template`).

- [ ] **Step 1: Import the component and helper**

The imports in `src/app/admin/campaigns/[id]/page.tsx` currently include:

```tsx
import { CampaignWizard } from '@/components/admin/wizard/CampaignWizard'
```

Add two new imports directly below it:

```tsx
import { CampaignWizard } from '@/components/admin/wizard/CampaignWizard'
import { ReminderSmsTemplate } from '@/components/admin/ReminderSmsTemplate'
import { resolveSmsTemplate } from '@/lib/sms-template'
```

- [ ] **Step 2: Select the new column**

The campaign select currently reads:

```tsx
    service
      .from('campaigns')
      .select('id, name, campaign_date, sent_at, closed_at, supports_arrival_certificates, max_attendee_count, sms_template, wizard_last_step')
      .eq('id', campaignId)
      .eq('company_id', companyId)
      .single(),
```

Change to:

```tsx
    service
      .from('campaigns')
      .select('id, name, campaign_date, sent_at, closed_at, supports_arrival_certificates, max_attendee_count, sms_template, reminder_sms_template, wizard_last_step')
      .eq('id', campaignId)
      .eq('company_id', companyId)
      .single(),
```

- [ ] **Step 3: Compute the effective primary template**

The line computing `companyDefaultTemplate` currently reads:

```tsx
  const companyDefaultTemplate = companyResult.data?.sms_template ?? null
```

Change to:

```tsx
  const companyDefaultTemplate = companyResult.data?.sms_template ?? null
  const effectivePrimaryTemplate = resolveSmsTemplate(campaign.sms_template, companyDefaultTemplate)
```

- [ ] **Step 4: Pass the field to the wizard**

The object literal passed to `CampaignWizard` currently reads:

```tsx
            <CampaignWizard
              campaign={{
                id: campaign.id,
                name: campaign.name,
                campaign_date: campaign.campaign_date,
                supports_arrival_certificates: campaign.supports_arrival_certificates,
                max_attendee_count: campaign.max_attendee_count,
                sms_template: campaign.sms_template,
                wizard_last_step: campaign.wizard_last_step,
              }}
```

Change to:

```tsx
            <CampaignWizard
              campaign={{
                id: campaign.id,
                name: campaign.name,
                campaign_date: campaign.campaign_date,
                supports_arrival_certificates: campaign.supports_arrival_certificates,
                max_attendee_count: campaign.max_attendee_count,
                sms_template: campaign.sms_template,
                reminder_sms_template: campaign.reminder_sms_template,
                wizard_last_step: campaign.wizard_last_step,
              }}
```

- [ ] **Step 5: Add the post-launch card**

The sidebar column in the launched (non-draft) view currently reads:

```tsx
            {/* Sidebar (1 col): config + notes + stats, stacked independently. */}
            <div className="flex flex-col gap-4">
              <DistributorAssignment campaignId={campaign.id} />
              <CampaignNotes campaignId={campaign.id} currentUserId={user.id} />
              <DistributorStats campaignId={campaign.id} total={allTokens.length} />
            </div>
```

Change to:

```tsx
            {/* Sidebar (1 col): config + notes + stats, stacked independently. */}
            <div className="flex flex-col gap-4">
              <DistributorAssignment campaignId={campaign.id} />
              <ReminderSmsTemplate
                campaignId={campaign.id}
                initial={campaign.reminder_sms_template}
                effectivePrimaryTemplate={effectivePrimaryTemplate}
              />
              <CampaignNotes campaignId={campaign.id} currentUserId={user.id} />
              <DistributorStats campaignId={campaign.id} total={allTokens.length} />
            </div>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors mentioning `page.tsx` or `CampaignWizard.tsx` — the missing-property error from Task 6 Step 5 is now resolved.

- [ ] **Step 7: Commit**

```bash
git add src/app/admin/campaigns/\[id\]/page.tsx
git commit -m "feat(ui): show reminder message editor on the campaign detail page"
```

---

### Task 8: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including every test added in Tasks 2–4.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new lint errors in any file touched by this plan.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors in any file touched by this plan (the pre-existing `.next/types/validator.ts` credits-route errors noted in Task 1 are expected to remain and are unrelated).

- [ ] **Step 4: Manual QA — wizard (pre-launch)**

Run: `npm run dev`, then in a browser:
1. Open `/admin`, create a new campaign (or open an existing draft), add at least one employee with a phone number, and navigate to wizard Step 4 ("Message").
2. Confirm a new **"Reminder SMS"** collapsible appears below "Advanced settings", collapsed by default (unless a reminder was already set).
3. Expand it. Confirm the textarea placeholder shows the primary message text (or the hint copy if the primary is also empty), and the helper line reads "Leave empty to use the primary message." (or the built-in-default variant).
4. Type a reminder message containing `{name}` and `{link}`, click Save. Confirm no error appears and the page doesn't lose the wizard step on refresh.
5. Reload the page. Confirm the reminder text persisted and the collapsible is now open by default.
6. Switch the app to Hebrew (via the language toggle) and confirm "Reminder SMS", the card heading, and the helper text render in Hebrew with correct RTL layout.

- [ ] **Step 5: Manual QA — post-launch editing**

1. Launch the campaign (or open one that's already launched and not yet closed).
2. On the campaign detail page, confirm a **"Reminder message"** card appears in the sidebar (near Distributor Assignment / Notes / Stats), independent of the "Send reminder" action in the kebab menu.
3. Edit the reminder text and save. Confirm it persists after a page refresh — this is the behavior that's impossible for every other campaign field once `sent_at` is set, so specifically confirm no 409/error occurs.
4. Trigger "Send reminder" from the kebab menu and confirm the flow still completes without error (actual SMS delivery is provider-mocked in dev unless real credentials are configured).

- [ ] **Step 6: Final commit (if manual QA required fixes)**

If Steps 4–5 required any code changes, stage and commit them with a message describing what was fixed. If no changes were needed, this step is a no-op — nothing to commit.
