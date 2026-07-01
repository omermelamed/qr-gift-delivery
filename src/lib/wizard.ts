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
