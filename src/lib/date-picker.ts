// Pure, timezone-safe helpers for the custom DatePicker.
// All dates are handled as plain calendar values (no Date.toISOString, which
// would shift the day across timezones).

export type YMD = { year: number; month: number; day: number } // month is 1-12

/** Zero-pads to an ISO calendar date string, e.g. (2026, 6, 9) -> "2026-06-09". */
export function toISODate(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

/** Parses "YYYY-MM-DD" into parts, or null if malformed / not a real date. */
export function parseISODate(value: string): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

/** Number of days in a 1-12 month, leap-year aware. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/**
 * Builds a 6-row × 7-col calendar matrix for the given month (month is 1-12).
 * Cells outside the month are null. Week starts on Sunday (col 0), matching the
 * native picker's S-M-T-W-T-F-S layout.
 */
export function monthMatrix(year: number, month: number): (number | null)[][] {
  const firstWeekday = new Date(year, month - 1, 1).getDay() // 0=Sun
  const total = daysInMonth(year, month)
  const cells: (number | null)[] = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= total; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (number | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** Localized display string for an ISO date, or '' when empty/invalid. */
export function formatDisplay(value: string, locale: 'en' | 'he'): string {
  const ymd = parseISODate(value)
  if (!ymd) return ''
  const d = new Date(ymd.year, ymd.month - 1, ymd.day)
  return d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}
