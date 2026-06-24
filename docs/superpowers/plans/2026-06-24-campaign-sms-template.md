# Per-Campaign SMS Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each campaign optionally define its own SMS message, overriding the company default, with fallback to the company default and then the built-in message.

**Architecture:** A nullable `campaigns.sms_template` column. Two pure helpers (`resolveSmsTemplate` for the fallback chain, `renderSmsTemplate` for `{name}`/`{link}` substitution) are unit-tested and used by both the send and resend routes. The campaigns PATCH route accepts the template; a pre-send editor on the campaign detail page sets it.

**Tech Stack:** Next.js 16 App Router, Supabase (service-role client), TypeScript, Vitest, Tailwind, custom `useT` i18n.

## Global Constraints

- `campaigns.sms_template` is nullable TEXT; **NULL/empty = use the company default** (`companies.sms_template`), and if that is null too, the built-in `sendGiftSMS` default. Existing campaigns unaffected.
- Fallback order, first non-empty wins: **campaign template → company template → built-in**.
- Placeholders are `{name}` and `{link}`. A non-empty template **must contain `{link}`** (mirrors `src/app/api/settings/route.ts:38`), else `400 { error: 'invalid_template' }`.
- Substitution must replace **all** occurrences (`replaceAll`), not just the first.
- Empty/whitespace-only strings are treated as absent (trim before deciding).
- The template is editable **pre-send only** — the campaigns PATCH route's existing `sent_at` → 409 guard must keep holding; the editor renders only in the draft config area.
- Permission to edit: `campaigns:launch` (already enforced by the PATCH route).
- Never log token values; never expose the service-role key client-side (both already hold in the files touched).

---

### Task 1: Schema migration + campaign type

**Files:**
- Create: `supabase/migrations/20240624000031_campaign_sms_template.sql`
- Modify: `src/types/index.ts` (campaign type, after `max_attendee_count: number | null`)

**Interfaces:**
- Produces: `campaigns.sms_template` (TEXT, nullable); campaign TS type gains `sms_template: string | null`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20240624000031_campaign_sms_template.sql`:

```sql
-- Optional per-campaign SMS override. NULL = use the company default
-- (companies.sms_template); if that is null too, the built-in default message.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS sms_template TEXT;
```

- [ ] **Step 2: Add the type field**

In `src/types/index.ts`, in the campaign type, add the field right after the
`max_attendee_count: number | null` line:

```ts
  max_attendee_count: number | null
  sms_template: string | null
```

- [ ] **Step 3: Verify the type compiles**

Run: `npx tsc --noEmit`
Expected: exit 0, no new errors (ignore any pre-existing unrelated errors / npm config warnings).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20240624000031_campaign_sms_template.sql src/types/index.ts
git commit -m "feat(db): add campaigns.sms_template column + type"
```

---

### Task 2: SMS template helpers (`resolveSmsTemplate`, `renderSmsTemplate`)

**Files:**
- Create: `src/lib/sms-template.ts`
- Test: `tests/lib/sms-template.test.ts`

**Interfaces:**
- Produces:
  - `renderSmsTemplate(template: string, vars: { name: string; link: string }): string` — substitutes all `{name}` and `{link}`.
  - `resolveSmsTemplate(campaignTemplate: string | null, companyTemplate: string | null): string | null` — trims; returns the campaign template if non-empty, else the company template if non-empty, else `null`.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/sms-template.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { renderSmsTemplate, resolveSmsTemplate } from '@/lib/sms-template'

describe('renderSmsTemplate', () => {
  it('substitutes name and link', () => {
    expect(renderSmsTemplate('Hi {name}, gift: {link}', { name: 'Dana', link: 'http://x/y' }))
      .toBe('Hi Dana, gift: http://x/y')
  })
  it('replaces every occurrence of a placeholder', () => {
    expect(renderSmsTemplate('{name} {name} {link}', { name: 'A', link: 'L' })).toBe('A A L')
  })
  it('leaves text without placeholders unchanged', () => {
    expect(renderSmsTemplate('no vars here', { name: 'A', link: 'L' })).toBe('no vars here')
  })
})

describe('resolveSmsTemplate', () => {
  it('prefers a non-empty campaign template', () => {
    expect(resolveSmsTemplate('camp {link}', 'co {link}')).toBe('camp {link}')
  })
  it('falls back to the company template when campaign is null', () => {
    expect(resolveSmsTemplate(null, 'co {link}')).toBe('co {link}')
  })
  it('treats empty / whitespace-only as absent', () => {
    expect(resolveSmsTemplate('   ', 'co {link}')).toBe('co {link}')
    expect(resolveSmsTemplate('', null)).toBeNull()
  })
  it('returns null when both are empty', () => {
    expect(resolveSmsTemplate(null, null)).toBeNull()
    expect(resolveSmsTemplate('  ', '')).toBeNull()
  })
  it('trims the chosen template', () => {
    expect(resolveSmsTemplate('  camp {link}  ', null)).toBe('camp {link}')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/sms-template.test.ts`
Expected: FAIL — module `@/lib/sms-template` does not exist yet.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/sms-template.ts`:

```ts
// Pure helpers for per-campaign SMS templates.

/** Substitutes {name} and {link} (all occurrences) into a template string. */
export function renderSmsTemplate(template: string, vars: { name: string; link: string }): string {
  return template
    .replaceAll('{name}', vars.name)
    .replaceAll('{link}', vars.link)
}

/**
 * Picks the effective template: campaign override if non-empty, else the company
 * default if non-empty, else null (caller uses the built-in default). Trims, and
 * treats whitespace-only as absent.
 */
export function resolveSmsTemplate(
  campaignTemplate: string | null,
  companyTemplate: string | null,
): string | null {
  const camp = campaignTemplate?.trim()
  if (camp) return camp
  const co = companyTemplate?.trim()
  if (co) return co
  return null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/sms-template.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sms-template.ts tests/lib/sms-template.test.ts
git commit -m "feat(sms): add resolveSmsTemplate + renderSmsTemplate helpers"
```

---

### Task 3: Accept `smsTemplate` in the campaigns PATCH route

**Files:**
- Modify: `src/app/api/campaigns/[id]/route.ts` (PATCH body parsing + update object)
- Test: `tests/api/campaign-patch.test.ts`

**Interfaces:**
- Consumes: `campaigns.sms_template` (Task 1).
- Produces: `PATCH /api/campaigns/[id]` accepts `smsTemplate?: string | null`. Non-empty must contain `{link}` (else `400 invalid_template`); empty/`null` stores `NULL`. Maps to `sms_template`. Existing fields/guards unchanged.

- [ ] **Step 1: Write the failing tests**

In `tests/api/campaign-patch.test.ts`, add these tests inside the `describe('PATCH /api/campaigns/[id]', ...)` block (the file already has `makeRequest`, `params`, and a `mockFromService` that returns a draft campaign with `sent_at: null`):

```ts
  it('persists a valid sms template containing {link}', async () => {
    const update = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }))
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update,
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ smsTemplate: 'Hi {name} {link}' }), params)
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ sms_template: 'Hi {name} {link}' })
  })

  it('returns 400 invalid_template when {link} is missing', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ smsTemplate: 'no link here' }), params)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_template')
  })

  it('clears the sms template when given an empty string', async () => {
    const update = vi.fn(() => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }))
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null } }) }) }) }),
      update,
    })
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(makeRequest({ smsTemplate: '   ' }), params)
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ sms_template: null })
  })
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `npx vitest run tests/api/campaign-patch.test.ts -t "sms template"`
Expected: FAIL — the route does not yet handle `smsTemplate` (the valid-template test would 400 with "No recognized fields", and `invalid_template` is not produced).

- [ ] **Step 3: Implement the parsing**

In `src/app/api/campaigns/[id]/route.ts`, widen the `update` object type and add a
`smsTemplate` branch. Change the declaration:

```ts
  const update: { supports_arrival_certificates?: boolean; max_attendee_count?: number | null } = {}
```

to:

```ts
  const update: { supports_arrival_certificates?: boolean; max_attendee_count?: number | null; sms_template?: string | null } = {}
```

Then, immediately before the `if (Object.keys(update).length === 0)` check, add:

```ts
  if ('smsTemplate' in body) {
    const raw = body.smsTemplate
    if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
      update.sms_template = null
    } else if (typeof raw === 'string') {
      if (!raw.includes('{link}')) {
        return NextResponse.json({ error: 'invalid_template' }, { status: 400 })
      }
      update.sms_template = raw.trim()
    } else {
      return NextResponse.json({ error: 'invalid_template' }, { status: 400 })
    }
  }
```

(The existing `.update(update)` call and `metadata: update` need no change.)

- [ ] **Step 4: Run the full PATCH test file to verify pass**

Run: `npx vitest run tests/api/campaign-patch.test.ts`
Expected: PASS — new sms-template tests plus all pre-existing PATCH tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/campaigns/[id]/route.ts tests/api/campaign-patch.test.ts
git commit -m "feat(campaigns): accept smsTemplate in PATCH"
```

---

### Task 4: Use the fallback in send + resend

**Files:**
- Modify: `src/app/api/campaigns/[id]/send/route.ts`
- Modify: `src/app/api/campaigns/[id]/resend/route.ts`

**Interfaces:**
- Consumes: `resolveSmsTemplate`, `renderSmsTemplate` (Task 2); `campaigns.sms_template` (Task 1).
- Produces: both routes send the effective template (campaign → company → built-in) using the helpers.

- [ ] **Step 1: Wire the send route**

In `src/app/api/campaigns/[id]/send/route.ts`:

Add the import near the other `@/lib` imports:

```ts
import { resolveSmsTemplate, renderSmsTemplate } from '@/lib/sms-template'
```

Add `sms_template` to the campaign select (the `.select('id, name, company_id, sent_at')`
line) so it reads:

```ts
    .select('id, name, company_id, sent_at, sms_template')
```

Replace this block:

```ts
  const smsTemplate = company?.sms_template ?? null
```

with:

```ts
  const effectiveTemplate = resolveSmsTemplate(campaign.sms_template, company?.sms_template ?? null)
```

Replace the `body:` argument in the `sendGiftSMS` call:

```ts
            body: smsTemplate
              ? smsTemplate
                  .replace('{name}', token.employee_name)
                  .replace('{link}', giftLink)
              : undefined,
```

with:

```ts
            body: effectiveTemplate
              ? renderSmsTemplate(effectiveTemplate, { name: token.employee_name, link: giftLink })
              : undefined,
```

- [ ] **Step 2: Wire the resend route**

In `src/app/api/campaigns/[id]/resend/route.ts`:

Add the import:

```ts
import { resolveSmsTemplate, renderSmsTemplate } from '@/lib/sms-template'
```

Add `sms_template` to the campaign select (the `.select('id, name')` line):

```ts
    .select('id, name, sms_template')
```

Replace:

```ts
  const smsTemplate = company?.sms_template ?? null
```

with:

```ts
  const effectiveTemplate = resolveSmsTemplate(campaign.sms_template, company?.sms_template ?? null)
```

Replace the `body:` argument in the `sendGiftSMS` call:

```ts
            body: smsTemplate
              ? smsTemplate
                  .replace('{name}', token.employee_name)
                  .replace('{link}', giftLink)
              : undefined,
```

with:

```ts
            body: effectiveTemplate
              ? renderSmsTemplate(effectiveTemplate, { name: token.employee_name, link: giftLink })
              : undefined,
```

- [ ] **Step 3: Verify types and no test regression**

Run: `npx tsc --noEmit`
Expected: exit 0, no new errors.

Run: `npx vitest run tests/api/send.test.ts tests/api/resend.test.ts`
Expected: same pass/fail counts as before this task. These two suites have a known
pre-existing mock-chaining baseline failure unrelated to templates; this task must not add
**new** failures. (The template resolution itself is unit-covered in Task 2.) If the counts
are unchanged, the task passes.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/campaigns/[id]/send/route.ts src/app/api/campaigns/[id]/resend/route.ts
git commit -m "feat(sms): apply campaign->company->builtin template fallback on send/resend"
```

---

### Task 5: Campaign-page SMS template editor

**Files:**
- Create: `src/components/admin/CampaignSmsTemplate.tsx`
- Modify: `src/app/admin/campaigns/[id]/page.tsx` (select `sms_template`, fetch company default, render the editor)
- Modify: `src/lib/i18n/translations.he.ts`

**Interfaces:**
- Consumes: `PATCH /api/campaigns/[id]` `{ smsTemplate }` (Task 3); `campaigns.sms_template` (Task 1).
- Produces: a pre-send editor component; the campaign page passes `initial` and `companyDefault`.

- [ ] **Step 1: Add the i18n strings**

In `src/lib/i18n/translations.he.ts`, after the line
`'Next month': 'חודש הבא',`, add:

```ts
  'SMS message': 'הודעת SMS',
  'Leave empty to use the default from Settings.': 'השאירו ריק כדי להשתמש בברירת המחדל מההגדרות.',
  'Use {name} for the recipient and {link} for the gift link.': 'השתמשו ב-{name} עבור שם הנמען וב-{link} עבור קישור המתנה.',
  'The message must contain {link}.': 'ההודעה חייבת לכלול {link}.',
  'Save': 'שמירה',
  'Saving…': 'שומר…',
```

(If a `'Saving…'` key already exists in the file, skip re-adding that one line to avoid a
duplicate key.)

- [ ] **Step 2: Create the editor component**

Create `src/components/admin/CampaignSmsTemplate.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

type Props = {
  campaignId: string
  initial: string | null
  companyDefault: string | null
}

export function CampaignSmsTemplate({ campaignId, initial, companyDefault }: Props) {
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
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smsTemplate: trimmed === '' ? null : trimmed }),
      })
      if (!res.ok) {
        setError(t('The message must contain {link}.'))
      } else {
        router.refresh()
      }
    } catch {
      setError(t('The message must contain {link}.'))
    } finally {
      setBusy(false)
    }
  }

  const placeholder = companyDefault?.trim()
    ? companyDefault
    : t('Use {name} for the recipient and {link} for the gift link.')

  return (
    <div className="flex flex-col gap-2 bg-white rounded-2xl border border-zinc-200 shadow-sm p-4">
      <span className="text-sm font-medium text-zinc-900">{t('SMS message')}</span>
      <textarea
        rows={4}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
      />
      <span className="text-xs text-zinc-500">
        {t('Use {name} for the recipient and {link} for the gift link.')}{' '}
        {t('Leave empty to use the default from Settings.')}
      </span>
      {error && <span className="text-xs text-red-500">{error}</span>}
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="self-start bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? t('Saving…') : t('Save')}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Wire the campaign page**

In `src/app/admin/campaigns/[id]/page.tsx`:

Add the import near the other admin component imports:

```ts
import { CampaignSmsTemplate } from '@/components/admin/CampaignSmsTemplate'
```

Add `sms_template` to the campaign select (the line listing
`... supports_arrival_certificates, max_attendee_count`):

```ts
      .select('id, name, campaign_date, sent_at, closed_at, supports_arrival_certificates, max_attendee_count, sms_template')
```

Add a company default fetch to the existing `Promise.all([...])` that loads
`campaignResult` and `creditsResult` — add a third entry:

```ts
    service
      .from('companies')
      .select('sms_template')
      .eq('id', companyId)
      .single(),
```

and update the destructuring to capture it, e.g.:

```ts
  const [campaignResult, creditsResult, companyResult] = await Promise.all([
```

and after `const creditBalance = ...`:

```ts
  const companyDefaultTemplate = companyResult.data?.sms_template ?? null
```

In the draft config column (the `<div className="flex flex-col gap-4">` that contains
`DistributorAssignment`, `GiftOptionsEditor`, `ArrivalCertToggle`), add the editor after
`ArrivalCertToggle`:

```tsx
              <ArrivalCertToggle campaignId={campaign.id} initial={campaign.supports_arrival_certificates} initialMax={campaign.max_attendee_count} />
              <CampaignSmsTemplate campaignId={campaign.id} initial={campaign.sms_template} companyDefault={companyDefaultTemplate} />
```

- [ ] **Step 4: Verify types and lint**

Run: `npx tsc --noEmit`
Expected: exit 0, no new errors.

Run: `npx eslint src/components/admin/CampaignSmsTemplate.tsx "src/app/admin/campaigns/[id]/page.tsx"`
Expected: no new errors (pre-existing warnings on the page, e.g. unused `Link`, are acceptable).

- [ ] **Step 5: Manual smoke check**

Run `npm run dev` (needs a reachable Supabase + auth). On an **unsent** campaign: the SMS
message box shows, the placeholder shows the Settings default, typing a message without
`{link}` and pressing Save shows the inline error, a message with `{link}` saves and
persists across reload, and clearing it reverts to the placeholder. (No automated UI test,
consistent with the toggle/editor components.) If a local Supabase isn't available, note
this and defer the manual check.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/CampaignSmsTemplate.tsx "src/app/admin/campaigns/[id]/page.tsx" src/lib/i18n/translations.he.ts
git commit -m "feat(admin): per-campaign SMS message editor on the campaign page"
```

---

### Task 6: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: the new `sms-template` (9) and `campaign-patch` template tests pass; the only
failures are the documented pre-existing mock-chaining baseline in unrelated route suites
(e.g. send/resend/tokens/team) — confirm none reference `sms-template`, `CampaignSmsTemplate`,
or the PATCH template logic.

- [ ] **Step 2: Type + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: tsc exit 0; lint shows no new errors from the files in this plan.

- [ ] **Step 3: Confirm the migration applies**

Apply `20240624000031_campaign_sms_template.sql` against the target Supabase (dashboard SQL
editor or `supabase db push`) and confirm `campaigns.sms_template` exists. If no Supabase is
reachable in this environment, note it and defer to the reviewer/user (the column must exist
before the new code is deployed, or the campaign/send selects will error).

- [ ] **Step 4: Final commit (if anything was adjusted)**

```bash
git add -A
git commit -m "test: verify per-campaign SMS template end-to-end" || echo "nothing to commit"
```
