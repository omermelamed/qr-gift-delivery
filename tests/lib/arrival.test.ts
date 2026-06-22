import { describe, it, expect } from 'vitest'
import { summarizeArrival } from '@/lib/arrival'

describe('summarizeArrival', () => {
  it('counts approved people and sums attendee counts (1, 2, 4 => 3 / 7)', () => {
    const rows = [
      { attending: true, attendee_count: 1 },
      { attending: true, attendee_count: 2 },
      { attending: true, attendee_count: 4 },
    ]
    expect(summarizeArrival(rows)).toEqual({ approved: 3, totalArriving: 7, notComing: 0, noResponse: 0 })
  })

  it('separates not-coming and no-response, ignoring their counts', () => {
    const rows = [
      { attending: true, attendee_count: 2 },
      { attending: false, attendee_count: null },
      { attending: null, attendee_count: null },
    ]
    expect(summarizeArrival(rows)).toEqual({ approved: 1, totalArriving: 2, notComing: 1, noResponse: 1 })
  })

  it('reflects an updated answer (not-coming -> coming with 2) in the totals', () => {
    // Same person after update: row now coming with 2.
    const afterUpdate = [{ attending: true, attendee_count: 2 }]
    expect(summarizeArrival(afterUpdate)).toEqual({ approved: 1, totalArriving: 2, notComing: 0, noResponse: 0 })
  })

  it('returns zeros for an empty campaign', () => {
    expect(summarizeArrival([])).toEqual({ approved: 0, totalArriving: 0, notComing: 0, noResponse: 0 })
  })
})
