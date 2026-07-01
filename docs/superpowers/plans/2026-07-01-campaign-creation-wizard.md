# Campaign Creation Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the draft campaign setup with a guided 5-step wizard (Basics → Employees → Distribution → Message → Review & Launch) that gates required fields, hides arrival certificates under Advanced settings, and resumes at the last step.

**Architecture:** Draft campaigns (`sent_at IS NULL`) render a new client `<CampaignWizard>` on the detail page instead of the bento grid; launched campaigns keep the existing dashboard. The wizard reuses every existing step component as-is. Pure step/gating logic lives in a tested `src/lib/wizard.ts` module. The last step is persisted to a new `campaigns.wizard_last_step` column via the extended `PATCH /api/campaigns/[id]`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres + service client), Tailwind, Vitest.

## Global Constraints

- Supabase is the single source of truth for redemption/campaign state; never derive it elsewhere.
- Service-role key only in server API routes; never in client components.
- Campaign settings mutations are draft-only — the PATCH route already rejects rows with `sent_at` (409). Keep that.
- `campaigns:launch` permission is required for PATCH; keep the existing check.
- All user-facing strings go through the i18n helper `useT()` → `t('...')` (client) exactly like sibling components.
- Migrations are tracked files under `supabase/migrations/` using `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` + a `CHECK` constraint, matching `20240624000030_campaign_max_attendees.sql`.
- Test runner: `npm test` (`vitest run tests`). Tests live under `tests/`.

---

### Task 1: Backend — `wizard_last_step` column + PATCH accepts name/date/step

**Files:**
- Create: `supabase/migrations/20240701000033_campaign_wizard_step.sql`
- Modify: `src/app/api/campaigns/[id]/route.ts:78-108` (PATCH body parsing + `update` type)
- Test: `tests/api/campaign-patch.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PATCH /api/campaigns/[id]` now also accepts, in the JSON body:
  - `name?: string` — non-empty; stored trimmed → `campaigns.name`
  - `campaignDate?: string` — a `Date.parse`-able string → `campaigns.campaign_date`
  - `wizardLastStep?: number` — integer 1–5 → `campaigns.wizard_last_step`
  - Invalid values return 400 with errors `name is required`, `campaignDate must be a valid date`, `invalid_step`.
  - New column `campaigns.wizard_last_step SMALLINT NOT NULL DEFAULT 1` (range 1–5).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20240701000033_campaign_wizard_step.sql`:

```sql
-- Resume position for the step-by-step campaign creation wizard.
-- 1-based step index (1..5). A draft campaign reopens at this step so the
-- admin lands where they left off. Launched campaigns ignore it.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS wizard_last_step SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE campaigns
  ADD CONSTRAINT wizard_last_step_range
  CHECK (wizard_last_step BETWEEN 1 AND 5);
```

- [ ] **Step 2: Write the failing test**

Create `tests/api/campaign-patch.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockCampaignSingle = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }))
vi.mock('@/lib/platform-auth', () => ({ resolveCompanyId: vi.fn(async () => 'co-1') }))
vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn(async () => ['campaigns:launch']),
  hasPermission: (perms: string[], p: string) => perms.includes(p),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'campaigns') {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: mockCampaignSingle }) }) }),
          update: (payload: unknown) => { mockUpdate(payload); return { eq: () => ({ eq: () => ({ error: null }) }) } },
        }
      }
      return {}
    },
  }),
}))

function patch(body: unknown) {
  return new NextRequest('http://localhost/api/campaigns/c-1', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}
const ctx = { params: Promise.resolve({ id: 'c-1' }) }

describe('PATCH /api/campaigns/[id] — wizard fields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1', app_metadata: { role_id: 'r-1', role_name: 'company_admin' } } } })
    mockCampaignSingle.mockResolvedValue({ data: { id: 'c-1', sent_at: null } })
  })

  it('updates name and campaign_date', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(patch({ name: '  Passover 2026 ', campaignDate: '2026-04-01' }), ctx)
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Passover 2026', campaign_date: '2026-04-01' }))
  })

  it('rejects blank name', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(patch({ name: '   ' }), ctx)
    expect(res.status).toBe(400)
  })

  it('rejects invalid date', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(patch({ campaignDate: 'not-a-date' }), ctx)
    expect(res.status).toBe(400)
  })

  it('persists wizardLastStep', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(patch({ wizardLastStep: 3 }), ctx)
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ wizard_last_step: 3 }))
  })

  it('rejects out-of-range wizardLastStep', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/route')
    const res = await PATCH(patch({ wizardLastStep: 9 }), ctx)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- campaign-patch`
Expected: FAIL — the route ignores `name`/`campaignDate`/`wizardLastStep`, so `mockUpdate` is not called with those keys ("No recognized fields to update" → 400).

- [ ] **Step 4: Extend the PATCH route**

In `src/app/api/campaigns/[id]/route.ts`, widen the `update` type and add parsing. Replace the `update` declaration (line ~79):

```typescript
  const update: {
    name?: string
    campaign_date?: string
    supports_arrival_certificates?: boolean
    max_attendee_count?: number | null
    sms_template?: string | null
    wizard_last_step?: number
  } = {}

  if ('name' in body) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    update.name = body.name.trim()
  }

  if ('campaignDate' in body) {
    if (typeof body.campaignDate !== 'string' || isNaN(Date.parse(body.campaignDate))) {
      return NextResponse.json({ error: 'campaignDate must be a valid date' }, { status: 400 })
    }
    update.campaign_date = body.campaignDate
  }

  if ('wizardLastStep' in body) {
    const raw = body.wizardLastStep
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > 5) {
      return NextResponse.json({ error: 'invalid_step' }, { status: 400 })
    }
    update.wizard_last_step = raw
  }
```

Leave the existing `supportsArrivalCertificates`, `maxAttendeeCount`, `smsTemplate` blocks and the rest of the route unchanged (the `sent_at` 409 guard and audit log still apply).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- campaign-patch`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20240701000033_campaign_wizard_step.sql src/app/api/campaigns/[id]/route.ts tests/api/campaign-patch.test.ts
git commit -m "feat(campaigns): add wizard_last_step column and extend PATCH for name/date/step"
```

---

### Task 2: Wizard step & gating logic (`src/lib/wizard.ts`)

**Files:**
- Create: `src/lib/wizard.ts`
- Test: `tests/lib/wizard.test.ts`

**Interfaces:**
- Produces (all pure, no React):
  - `WIZARD_STEPS: readonly ['basics','employees','distribution','message','review']`
  - `WIZARD_STEP_COUNT: 5`
  - `type WizardContext = { hasName: boolean; hasDate: boolean; employeeCount: number }`
  - `clampStep(step: number): number` — floor + clamp into 1..5, NaN → 1
  - `isStepSatisfied(step: number, ctx: WizardContext): boolean` — step 1 needs name+date, step 2 needs ≥1 employee, steps 3–5 always true
  - `canAdvance(step: number, ctx: WizardContext): boolean`
  - `canJumpTo(target: number, ctx: WizardContext): boolean` — true only if every prior step is satisfied
  - `furthestReachable(ctx: WizardContext): number` — highest step the gates allow
  - `unmetRequirements(ctx: WizardContext): string[]` — subset of `['name','date','employees']`
  - `resolveInitialStep(urlStep: string | null | undefined, persisted: number | null | undefined, ctx: WizardContext): number` — URL wins, else persisted, clamped and capped at `furthestReachable`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/wizard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  WIZARD_STEP_COUNT, clampStep, isStepSatisfied, canAdvance, canJumpTo,
  furthestReachable, unmetRequirements, resolveInitialStep, type WizardContext,
} from '@/lib/wizard'

const full: WizardContext = { hasName: true, hasDate: true, employeeCount: 3 }
const empty: WizardContext = { hasName: false, hasDate: false, employeeCount: 0 }
const basicsOnly: WizardContext = { hasName: true, hasDate: true, employeeCount: 0 }

describe('clampStep', () => {
  it('clamps below and above range', () => {
    expect(clampStep(0)).toBe(1)
    expect(clampStep(99)).toBe(WIZARD_STEP_COUNT)
    expect(clampStep(3.7)).toBe(3)
    expect(clampStep(NaN)).toBe(1)
  })
})

describe('isStepSatisfied', () => {
  it('step 1 needs name and date', () => {
    expect(isStepSatisfied(1, basicsOnly)).toBe(true)
    expect(isStepSatisfied(1, { ...basicsOnly, hasDate: false })).toBe(false)
  })
  it('step 2 needs an employee', () => {
    expect(isStepSatisfied(2, basicsOnly)).toBe(false)
    expect(isStepSatisfied(2, full)).toBe(true)
  })
  it('steps 3-5 are always satisfied', () => {
    expect(isStepSatisfied(3, empty)).toBe(true)
    expect(isStepSatisfied(5, empty)).toBe(true)
  })
})

describe('canAdvance / canJumpTo / furthestReachable', () => {
  it('canAdvance mirrors isStepSatisfied', () => {
    expect(canAdvance(2, basicsOnly)).toBe(false)
    expect(canAdvance(2, full)).toBe(true)
  })
  it('canJumpTo requires all prior gates', () => {
    expect(canJumpTo(1, empty)).toBe(true)
    expect(canJumpTo(3, basicsOnly)).toBe(false)   // step 2 gate unmet
    expect(canJumpTo(5, full)).toBe(true)
  })
  it('furthestReachable stops at first unmet gate', () => {
    expect(furthestReachable(empty)).toBe(1)
    expect(furthestReachable(basicsOnly)).toBe(2)
    expect(furthestReachable(full)).toBe(WIZARD_STEP_COUNT)
  })
})

describe('unmetRequirements', () => {
  it('lists all missing hard requirements', () => {
    expect(unmetRequirements(empty)).toEqual(['name', 'date', 'employees'])
    expect(unmetRequirements(full)).toEqual([])
  })
})

describe('resolveInitialStep', () => {
  it('prefers a valid url step', () => {
    expect(resolveInitialStep('4', 2, full)).toBe(4)
  })
  it('falls back to persisted value', () => {
    expect(resolveInitialStep(null, 3, full)).toBe(3)
    expect(resolveInitialStep('', 3, full)).toBe(3)
  })
  it('never exceeds what the gates allow', () => {
    expect(resolveInitialStep('5', 5, basicsOnly)).toBe(2)
    expect(resolveInitialStep(null, 4, empty)).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- wizard`
Expected: FAIL — `@/lib/wizard` does not exist ("Failed to resolve import").

- [ ] **Step 3: Write the implementation**

Create `src/lib/wizard.ts`:

```typescript
// Pure step/gating logic for the campaign creation wizard.
// No React here so it can be unit-tested in isolation.

export const WIZARD_STEPS = ['basics', 'employees', 'distribution', 'message', 'review'] as const
export type WizardStepId = (typeof WIZARD_STEPS)[number]
export const WIZARD_STEP_COUNT = WIZARD_STEPS.length // 5

export type WizardContext = {
  hasName: boolean
  hasDate: boolean
  employeeCount: number
}

/** Floor and clamp a step index into 1..WIZARD_STEP_COUNT. NaN → 1. */
export function clampStep(step: number): number {
  if (!Number.isFinite(step)) return 1
  const n = Math.floor(step)
  if (n < 1) return 1
  if (n > WIZARD_STEP_COUNT) return WIZARD_STEP_COUNT
  return n
}

/** Is the hard requirement for this 1-based step satisfied? */
export function isStepSatisfied(step: number, ctx: WizardContext): boolean {
  switch (clampStep(step)) {
    case 1: return ctx.hasName && ctx.hasDate
    case 2: return ctx.employeeCount > 0
    default: return true // distribution, message, review are optional
  }
}

/** Can the user move forward from `step`? */
export function canAdvance(step: number, ctx: WizardContext): boolean {
  return isStepSatisfied(step, ctx)
}

/** Can the user jump straight to `target`? Only if every earlier gate is met. */
export function canJumpTo(target: number, ctx: WizardContext): boolean {
  const t = clampStep(target)
  for (let s = 1; s < t; s++) {
    if (!isStepSatisfied(s, ctx)) return false
  }
  return true
}

/** Highest step the current gates allow the user to reach. */
export function furthestReachable(ctx: WizardContext): number {
  let s = 1
  while (s < WIZARD_STEP_COUNT && isStepSatisfied(s, ctx)) s++
  return s
}

/** Hard requirements still missing, for the Review step's checklist. */
export function unmetRequirements(ctx: WizardContext): string[] {
  const missing: string[] = []
  if (!ctx.hasName) missing.push('name')
  if (!ctx.hasDate) missing.push('date')
  if (ctx.employeeCount < 1) missing.push('employees')
  return missing
}

/** URL param wins, else persisted value; clamped and capped at furthestReachable. */
export function resolveInitialStep(
  urlStep: string | null | undefined,
  persisted: number | null | undefined,
  ctx: WizardContext,
): number {
  let candidate: number
  if (urlStep != null && urlStep !== '' && Number.isFinite(Number(urlStep))) {
    candidate = clampStep(Number(urlStep))
  } else {
    candidate = clampStep(persisted ?? 1)
  }
  return Math.min(candidate, furthestReachable(ctx))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- wizard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/wizard.ts tests/lib/wizard.test.ts
git commit -m "feat(campaigns): pure step/gating logic for the creation wizard"
```

---

### Task 3: `WizardStepper` presentational component

**Files:**
- Create: `src/components/admin/wizard/WizardStepper.tsx`

**Interfaces:**
- Consumes: `canJumpTo` from `@/lib/wizard`, `useT`.
- Produces: `WizardStepper` component:
  ```typescript
  <WizardStepper
    current={number}                 // 1-based active step
    ctx={WizardContext}              // to decide which dots are clickable
    onJump={(step: number) => void}  // fired when a reachable dot is clicked
  />
  ```

- [ ] **Step 1: Write the component**

Create `src/components/admin/wizard/WizardStepper.tsx`:

```typescript
'use client'

import { useT } from '@/lib/i18n/useT'
import { canJumpTo, type WizardContext } from '@/lib/wizard'

const STEP_LABELS = ['Basics', 'Employees', 'Distribution', 'Message', 'Review'] as const

export function WizardStepper({
  current,
  ctx,
  onJump,
}: {
  current: number
  ctx: WizardContext
  onJump: (step: number) => void
}) {
  const t = useT()
  return (
    <nav className="flex items-center gap-1 sm:gap-2 mb-6 overflow-x-auto" aria-label={t('Campaign setup steps')}>
      {STEP_LABELS.map((label, i) => {
        const step = i + 1
        const active = step === current
        const done = step < current
        const reachable = canJumpTo(step, ctx)
        return (
          <div key={label} className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onJump(step)}
              aria-current={active ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-brand text-white'
                  : done
                    ? 'text-brand hover-brand'
                    : reachable
                      ? 'text-zinc-500 hover-brand-text'
                      : 'text-zinc-300 cursor-not-allowed'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  active ? 'bg-white/20' : done ? 'bg-brand-soft' : 'bg-zinc-100'
                }`}
              >
                {step}
              </span>
              <span className="hidden sm:inline">{t(label)}</span>
            </button>
            {step < STEP_LABELS.length && <span className="text-zinc-200">—</span>}
          </div>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors from `WizardStepper.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/wizard/WizardStepper.tsx
git commit -m "feat(campaigns): wizard stepper component"
```

---

### Task 4: `CampaignWizard` container (Basics + step bodies + nav + resume)

**Files:**
- Create: `src/components/admin/wizard/CampaignWizard.tsx`

**Interfaces:**
- Consumes: `WizardStepper` (Task 3); wizard logic (Task 2); PATCH `/api/campaigns/[id]` (Task 1); existing components `CampaignPopulator`, `EmployeeTable`, `DistributorAssignment`, `GiftOptionsEditor`, `CampaignSmsTemplate`, `ArrivalCertToggle`, `LaunchButton`, `DatePicker`.
- Produces: `CampaignWizard` component:
  ```typescript
  <CampaignWizard
    campaign={{
      id: string
      name: string
      campaign_date: string | null
      supports_arrival_certificates: boolean
      max_attendee_count: number | null
      sms_template: string | null
      wizard_last_step: number
    }}
    tokens={React.ComponentProps<typeof EmployeeTable>['initialRows']}
    gifts={{ id: string; name: string }[]}
    creditBalance={number}
    companyDefaultTemplate={string | null}
    canEditGift={boolean}
  />
  ```

- [ ] **Step 1: Write the component**

Create `src/components/admin/wizard/CampaignWizard.tsx`:

```typescript
'use client'

import { useMemo, useRef, useState, type ComponentProps } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'
import { DatePicker } from '@/components/admin/DatePicker'
import { CampaignPopulator } from '@/components/admin/CampaignPopulator'
import { EmployeeTable } from '@/components/admin/EmployeeTable'
import { DistributorAssignment } from '@/components/admin/DistributorAssignment'
import { GiftOptionsEditor } from '@/components/admin/GiftOptionsEditor'
import { CampaignSmsTemplate } from '@/components/admin/CampaignSmsTemplate'
import { ArrivalCertToggle } from '@/components/admin/ArrivalCertToggle'
import { LaunchButton } from '@/components/admin/LaunchButton'
import { WizardStepper } from '@/components/admin/wizard/WizardStepper'
import {
  clampStep, canAdvance, resolveInitialStep, unmetRequirements,
  WIZARD_STEP_COUNT, type WizardContext,
} from '@/lib/wizard'

type Tokens = ComponentProps<typeof EmployeeTable>['initialRows']

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
  tokens: Tokens
  gifts: { id: string; name: string }[]
  creditBalance: number
  companyDefaultTemplate: string | null
  canEditGift: boolean
}

export function CampaignWizard({
  campaign, tokens, gifts, creditBalance, companyDefaultTemplate, canEditGift,
}: CampaignWizardProps) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Basics is authoritative in-wizard so gating reacts instantly to typing.
  const [name, setName] = useState(campaign.name)
  const [campaignDate, setCampaignDate] = useState(campaign.campaign_date ?? '')
  const basicsDirty = useRef(false)

  const employeeCount = tokens.length
  const ctx: WizardContext = useMemo(
    () => ({ hasName: name.trim().length > 0, hasDate: !!campaignDate, employeeCount }),
    [name, campaignDate, employeeCount],
  )

  const [step, setStep] = useState(() =>
    resolveInitialStep(searchParams.get('step'), campaign.wizard_last_step, ctx),
  )
  const [advancedOpen, setAdvancedOpen] = useState(campaign.supports_arrival_certificates)

  function persistStep(next: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('step', String(next))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wizardLastStep: next }),
    }).catch(() => {})
  }

  async function persistBasics() {
    if (!basicsDirty.current) return
    basicsDirty.current = false
    await fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), campaignDate }),
    }).catch(() => {})
    router.refresh()
  }

  async function goToStep(next: number) {
    const target = clampStep(next)
    if (step === 1 && target !== 1) await persistBasics()
    setStep(target)
    persistStep(target)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
  }

  const nextDisabled = step < WIZARD_STEP_COUNT && !canAdvance(step, ctx)
  const missing = unmetRequirements(ctx)

  return (
    <div>
      <WizardStepper current={step} ctx={ctx} onJump={goToStep} />

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 md:p-6">
        {step === 1 && (
          <div className="flex flex-col gap-5 max-w-lg">
            <h2 className="text-lg font-semibold text-zinc-900">{t('Basics')}</h2>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="wiz-name" className="text-sm font-medium text-zinc-700">{t('Campaign name')}</label>
              <input
                id="wiz-name" type="text" value={name}
                placeholder={t('e.g. Passover 2026')}
                onChange={(e) => { setName(e.target.value); basicsDirty.current = true }}
                className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-brand focus:border-transparent"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="wiz-date" className="text-sm font-medium text-zinc-700">{t('Campaign date')}</label>
              <DatePicker id="wiz-date" value={campaignDate}
                onChange={(v) => { setCampaignDate(v); basicsDirty.current = true }} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <CampaignPopulator
              campaignId={campaign.id}
              existingTokens={tokens.map((tk) => ({ employee_name: tk.employee_name, phone_number: tk.phone_number }))}
            />
            <EmployeeTable
              campaignId={campaign.id} initialRows={tokens} isDraft gifts={gifts}
              canEditGift={canEditGift}
              showAttendance={campaign.supports_arrival_certificates}
              canEditAttendance={canEditGift}
            />
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <DistributorAssignment campaignId={campaign.id} />
            <GiftOptionsEditor campaignId={campaign.id} />
          </div>
        )}

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
                <div className="px-4 pb-4">
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

        {step === 5 && (
          <div className="flex flex-col gap-5">
            <h2 className="text-lg font-semibold text-zinc-900">{t('Review & Launch')}</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-zinc-500">{t('Campaign name')}</dt><dd className="text-zinc-900">{name || '—'}</dd>
              <dt className="text-zinc-500">{t('Campaign date')}</dt><dd className="text-zinc-900">{campaignDate || '—'}</dd>
              <dt className="text-zinc-500">{t('Employees')}</dt><dd className="text-zinc-900">{employeeCount}</dd>
              <dt className="text-zinc-500">{t('Gift options')}</dt><dd className="text-zinc-900">{gifts.length}</dd>
              <dt className="text-zinc-500">{t('Arrival Certificates')}</dt>
              <dd className="text-zinc-900">{campaign.supports_arrival_certificates ? t('On') : t('Off')}</dd>
            </dl>
            {missing.length > 0 ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                {t('Before launching, add:')} {missing.map((m) => t(m)).join(', ')}
              </p>
            ) : (
              <LaunchButton campaignId={campaign.id} employeeCount={employeeCount} creditBalance={creditBalance} />
            )}
          </div>
        )}
      </div>

      {/* Back / Next */}
      <div className="flex items-center justify-between mt-5">
        <button
          type="button"
          onClick={() => goToStep(step - 1)}
          disabled={step === 1}
          className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover-brand-text disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← {t('Back')}
        </button>
        {step < WIZARD_STEP_COUNT && (
          <button
            type="button"
            onClick={() => goToStep(step + 1)}
            disabled={nextDisabled}
            className="rounded-lg px-5 py-2 text-sm font-semibold bg-brand text-white hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('Next')} →
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. (If `EmployeeTable`'s `initialRows` element type is not exported, the `ComponentProps` indirection still resolves it — no manual type duplication needed.)

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/wizard/CampaignWizard.tsx
git commit -m "feat(campaigns): CampaignWizard container with steps, gating and resume"
```

---

### Task 5: Wire the wizard into the draft detail page

**Files:**
- Modify: `src/app/admin/campaigns/[id]/page.tsx:51` (add `wizard_last_step` to the select), `:150-210` (draft branch + actions row)

**Interfaces:**
- Consumes: `CampaignWizard` (Task 4).
- Produces: draft campaigns render `<CampaignWizard>`; launched campaigns unchanged.

- [ ] **Step 1: Add the column to the campaign query**

In `src/app/admin/campaigns/[id]/page.tsx`, extend the campaigns `.select(...)` (currently ends `..., sms_template`) to include the new column:

```typescript
      .select('id, name, campaign_date, sent_at, closed_at, supports_arrival_certificates, max_attendee_count, sms_template, wizard_last_step')
```

- [ ] **Step 2: Import the wizard**

Add near the other admin imports at the top of the file:

```typescript
import { CampaignWizard } from '@/components/admin/wizard/CampaignWizard'
```

- [ ] **Step 3: Remove the top Launch button for drafts (the wizard owns Launch)**

In the actions row, delete the `canLaunch` block:

```typescript
          {canLaunch && (
            <LaunchButton campaignId={campaign.id} employeeCount={allTokens.length} creditBalance={creditBalance} />
          )}
```

Then remove the now-unused `LaunchButton` import and the `const canLaunch = ...` line. (`isDraft` is still used below.)

- [ ] **Step 4: Replace the draft bento branch with the wizard**

Replace the entire draft branch — the `isDraft ? ( <> ...populator/table + sidebar... </> ) : (` opening through the end of that first `</>` — so the ternary becomes:

```typescript
        {isDraft ? (
          <div className="lg:col-span-3">
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
              tokens={allTokens}
              gifts={gifts}
              creditBalance={creditBalance}
              companyDefaultTemplate={companyDefaultTemplate}
              canEditGift={canEditGift}
            />
          </div>
        ) : (
```

Leave the launched branch (the `: ( <> ... </> )`) and the closing `)}` untouched. The wizard spans all three grid columns so the bento grid wrapper still holds it.

- [ ] **Step 5: Verify build + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. Confirm no unused-import warning for `LaunchButton` / `DistributorAssignment` etc. — the draft branch no longer references `CampaignPopulator`, `GiftOptionsEditor`, `ArrivalCertToggle`, `CampaignSmsTemplate`, `CampaignNotes` at the page level. **Remove any of those imports that are now unused only in the page** (they are still imported inside the wizard). Note: `EmployeeTable`, `DistributorAssignment`, `CampaignNotes`, `DistributorStats` are still used by the launched branch — keep those.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/campaigns/[id]/page.tsx
git commit -m "feat(campaigns): render CampaignWizard for draft campaigns"
```

---

### Task 6: Simplify the `/new` page to Step 1 and hand off to the wizard

**Files:**
- Modify: `src/app/admin/campaigns/new/page.tsx` (whole file)

**Interfaces:**
- Consumes: `POST /api/campaigns` (unchanged — still accepts name + campaignDate; arrival fields simply omitted → default off).
- Produces: after create, redirects to `/admin/campaigns/{id}?step=2` (into the wizard at Employees).

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `src/app/admin/campaigns/new/page.tsx` with:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useT } from '@/lib/i18n/useT'
import { DatePicker } from '@/components/admin/DatePicker'

export default function NewCampaignPage() {
  const t = useT()
  const [name, setName] = useState('')
  const [campaignDate, setCampaignDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!campaignDate) { setError(t('Please choose a campaign date.')); return }
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
      // Hand off to the wizard at the Employees step; Basics is revisitable via the stepper.
      router.push(`/admin/campaigns/${data.id}?step=2`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-lg mx-auto">
      <Link href="/admin" className="text-sm text-zinc-400 hover-brand-text transition-colors mb-6 inline-block">
        {t('← Campaigns')}
      </Link>

      <h1 className="text-2xl font-bold text-zinc-900 mb-2">{t('New Campaign')}</h1>
      <p className="text-sm text-zinc-500 mb-8">{t('Step 1 of 5 · Basics')}</p>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 flex flex-col gap-5">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-medium text-zinc-700">{t('Campaign name')}</label>
          <input
            id="name" type="text" placeholder={t('e.g. Passover 2026')}
            value={name} onChange={(e) => setName(e.target.value)} required
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-brand focus:border-transparent"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="date" className="text-sm font-medium text-zinc-700">{t('Campaign date')}</label>
          <DatePicker id="date" value={campaignDate} onChange={setCampaignDate} />
        </div>

        <button
          type="submit" disabled={loading}
          className="w-full bg-brand text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all mt-1"
        >
          {loading ? t('Creating…') : `${t('Continue')} →`}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/campaigns/new/page.tsx
git commit -m "feat(campaigns): /new collects Basics and hands off to the wizard"
```

---

### Task 7: Full-suite check + manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole unit suite**

Run: `npm test`
Expected: all tests pass, including `campaign-patch` and `wizard`.

- [ ] **Step 2: Typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 3: Apply the migration locally**

Apply `supabase/migrations/20240701000033_campaign_wizard_step.sql` via the project's usual migration path (e.g. `supabase db push` or the repo's migration script). Confirm `campaigns.wizard_last_step` exists with default 1.

- [ ] **Step 4: Manual walk-through (dev server)**

Run `npm run dev`, sign in as an admin, then verify:
- `/admin/campaigns/new`: **Continue** is blocked until name + date are set; submitting lands on `…/{id}?step=2` (Employees).
- Step 2: **Next** is disabled until ≥1 employee is added (upload/directory/clone); the stepper won't let you jump past Employees while empty.
- Steps 3–4: Next always enabled; **Advanced settings** on step 4 expands to reveal Arrival Certificates + max attendees.
- Step 5: with all requirements met, **Launch** appears and sends; with a requirement missing, the amber checklist shows instead.
- **Resume:** leave at step 3, return to the campaign from the campaign list → wizard reopens at step 3. Reload the page at `?step=4` → opens at step 4.
- **Basics edit:** revisit step 1, change the name, click Next → name persists (verify on Review and after refresh).
- **Launched campaign:** open a previously-sent campaign → the live dashboard renders unchanged (no wizard).

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "test(campaigns): verify wizard flow end-to-end"
```

---

## Notes for the implementer

- **Brand utility classes** (`bg-brand`, `hover-brand`, `hover-brand-text`, `ring-brand`, `brand-soft`) are project-wide Tailwind helpers already used across admin components — reuse them, don't hardcode colors.
- **`router.refresh()`** re-runs the server component and feeds fresh `tokens`/`campaign` props into the wizard while preserving its client state (current step), because the step also lives in the `?step=` URL param.
- **Do not** add polling or new global state; Supabase + `router.refresh()` remain the only data path, per project rules.
