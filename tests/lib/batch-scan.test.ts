import { describe, it, expect } from 'vitest'
import { isBatchDuplicate, getBatchSummary } from '@/lib/batch-scan'
import type { ScanHistoryEntry } from '@/types'

describe('isBatchDuplicate', () => {
  it('returns false when lastScanned is null', () => {
    expect(isBatchDuplicate(null, 'token-abc', Date.now())).toBe(false)
  })

  it('returns false when token differs', () => {
    const last = { token: 'token-abc', time: Date.now() - 1000 }
    expect(isBatchDuplicate(last, 'token-xyz', Date.now())).toBe(false)
  })

  it('returns true when same token within 3 seconds', () => {
    const now = Date.now()
    const last = { token: 'token-abc', time: now - 1500 }
    expect(isBatchDuplicate(last, 'token-abc', now)).toBe(true)
  })

  it('returns false when same token older than 3 seconds', () => {
    const now = Date.now()
    const last = { token: 'token-abc', time: now - 3001 }
    expect(isBatchDuplicate(last, 'token-abc', now)).toBe(false)
  })

  it('returns false exactly at the 3 second boundary', () => {
    const now = Date.now()
    const last = { token: 'token-abc', time: now - 3000 }
    expect(isBatchDuplicate(last, 'token-abc', now)).toBe(false)
  })
})

describe('getBatchSummary', () => {
  it('returns all zeros for empty entries', () => {
    expect(getBatchSummary([])).toEqual({ claimed: 0, alreadyClaimed: 0, invalid: 0, total: 0 })
  })

  it('counts claimed entries correctly', () => {
    const entries: ScanHistoryEntry[] = [
      { employeeName: 'Dana', outcome: 'success', timestamp: new Date() },
      { employeeName: 'Yoni', outcome: 'success', timestamp: new Date() },
    ]
    expect(getBatchSummary(entries).claimed).toBe(2)
  })

  it('counts already_claimed entries correctly', () => {
    const entries: ScanHistoryEntry[] = [
      { employeeName: 'Moshe', outcome: 'already_claimed', timestamp: new Date() },
    ]
    const summary = getBatchSummary(entries)
    expect(summary.alreadyClaimed).toBe(1)
    expect(summary.claimed).toBe(0)
    expect(summary.invalid).toBe(0)
  })

  it('counts invalid, closed, and not_authorized all as invalid', () => {
    const entries: ScanHistoryEntry[] = [
      { employeeName: null, outcome: 'invalid', timestamp: new Date() },
      { employeeName: null, outcome: 'closed', timestamp: new Date() },
      { employeeName: null, outcome: 'not_authorized', timestamp: new Date() },
    ]
    expect(getBatchSummary(entries).invalid).toBe(3)
  })

  it('returns correct total across all outcomes', () => {
    const entries: ScanHistoryEntry[] = [
      { employeeName: 'A', outcome: 'success', timestamp: new Date() },
      { employeeName: 'B', outcome: 'already_claimed', timestamp: new Date() },
      { employeeName: null, outcome: 'invalid', timestamp: new Date() },
    ]
    expect(getBatchSummary(entries).total).toBe(3)
  })
})
