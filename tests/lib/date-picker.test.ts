import { describe, it, expect } from 'vitest'
import { toISODate, parseISODate, daysInMonth, monthMatrix, formatDisplay } from '@/lib/date-picker'

describe('toISODate', () => {
  it('zero-pads month and day', () => {
    expect(toISODate(2026, 6, 9)).toBe('2026-06-09')
    expect(toISODate(2026, 12, 31)).toBe('2026-12-31')
  })
})

describe('parseISODate', () => {
  it('parses a valid date', () => {
    expect(parseISODate('2026-06-09')).toEqual({ year: 2026, month: 6, day: 9 })
  })
  it('rejects malformed strings', () => {
    expect(parseISODate('')).toBeNull()
    expect(parseISODate('2026-6-9')).toBeNull()
    expect(parseISODate('not-a-date')).toBeNull()
  })
  it('rejects impossible dates', () => {
    expect(parseISODate('2026-13-01')).toBeNull()
    expect(parseISODate('2026-02-30')).toBeNull()
    expect(parseISODate('2025-02-29')).toBeNull() // not a leap year
  })
  it('accepts a leap day', () => {
    expect(parseISODate('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 })
  })
  it('round-trips with toISODate', () => {
    const iso = '2026-06-09'
    const p = parseISODate(iso)!
    expect(toISODate(p.year, p.month, p.day)).toBe(iso)
  })
})

describe('daysInMonth', () => {
  it('handles 30/31 day months', () => {
    expect(daysInMonth(2026, 6)).toBe(30)
    expect(daysInMonth(2026, 7)).toBe(31)
  })
  it('handles February leap years', () => {
    expect(daysInMonth(2024, 2)).toBe(29)
    expect(daysInMonth(2025, 2)).toBe(28)
  })
})

describe('monthMatrix', () => {
  it('builds weeks of 7 with leading nulls before the 1st', () => {
    // June 2026: the 1st is a Monday (getDay() === 1)
    const weeks = monthMatrix(2026, 6)
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(weeks[0][0]).toBeNull() // Sunday cell empty
    expect(weeks[0][1]).toBe(1) // Monday is the 1st
  })
  it('contains every day of the month exactly once', () => {
    const flat = monthMatrix(2026, 6).flat().filter((d) => d !== null)
    expect(flat).toEqual(Array.from({ length: 30 }, (_, i) => i + 1))
  })
  it('pads the trailing week with nulls', () => {
    const weeks = monthMatrix(2026, 6)
    const last = weeks[weeks.length - 1]
    expect(last.length).toBe(7)
    expect(last[last.length - 1]).toBeNull()
  })
})

describe('formatDisplay', () => {
  it('returns empty string for blank/invalid input', () => {
    expect(formatDisplay('', 'en')).toBe('')
    expect(formatDisplay('bad', 'he')).toBe('')
  })
  it('formats a valid date without timezone drift', () => {
    // The day must survive formatting regardless of the runner's timezone.
    expect(formatDisplay('2026-06-09', 'en')).toContain('2026')
    expect(formatDisplay('2026-06-09', 'en')).toContain('09')
  })
})
