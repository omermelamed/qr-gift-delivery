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
