import { describe, it, expect } from 'vitest'
import { utils, write } from 'xlsx'
import { parseSheetRows, normalizeCSVRow } from '@/lib/csv'

const HEB_NAME = 'רינה אביטל'
const HEB_DEPT = 'מכירות'

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function withBom(bytes: Uint8Array): Uint8Array {
  return new Uint8Array([0xef, 0xbb, 0xbf, ...bytes])
}

// Hebrew letters live at 0xE0-0xFA in Windows-1255. This is what Excel
// "Save as CSV" produces on a Hebrew Windows machine.
function cp1255Csv(): Uint8Array {
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0))
  const reena = [0xf8, 0xe9, 0xf0, 0xe4] // רינה
  const avital = [0xe0, 0xe1, 0xe9, 0xe8, 0xec] // אביטל
  const dept = [0xee, 0xeb, 0xe9, 0xf8, 0xe5, 0xfa] // מכירות
  return new Uint8Array([
    ...ascii('name,phone_number,department\n'),
    ...reena, 0x20, ...avital, 0x2c,
    ...ascii('050-7802400'), 0x2c,
    ...dept, 0x0a,
  ])
}

const CSV_TEXT = `name,phone_number,department\n${HEB_NAME},050-7802400,${HEB_DEPT}\n`

describe('parseSheetRows', () => {
  it('preserves Hebrew from a UTF-8 CSV without BOM', () => {
    const rows = parseSheetRows(utf8(CSV_TEXT))
    expect(rows[0]).toMatchObject({ name: HEB_NAME, department: HEB_DEPT })
  })

  it('preserves Hebrew from a UTF-8 CSV with BOM', () => {
    const rows = parseSheetRows(withBom(utf8(CSV_TEXT)))
    expect(rows[0]).toMatchObject({ name: HEB_NAME, department: HEB_DEPT })
  })

  it('preserves Hebrew from a Windows-1255 CSV (Excel "Save as CSV")', () => {
    const rows = parseSheetRows(cp1255Csv())
    expect(rows[0]).toMatchObject({ name: HEB_NAME, department: HEB_DEPT })
  })

  it('preserves Hebrew from a real binary .xlsx file', () => {
    const ws = utils.aoa_to_sheet([
      ['name', 'phone_number', 'department'],
      [HEB_NAME, '050-7802400', HEB_DEPT],
    ])
    const wb = { SheetNames: ['S'], Sheets: { S: ws } }
    const buf = write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
    const rows = parseSheetRows(new Uint8Array(buf))
    expect(rows[0]).toMatchObject({ name: HEB_NAME, department: HEB_DEPT })
  })

  it('returns an empty array for an empty file', () => {
    expect(parseSheetRows(new Uint8Array([]))).toEqual([])
  })
})

describe('normalizeCSVRow + parseSheetRows integration', () => {
  it('maps a Windows-1255 row to a clean EmployeeRow', () => {
    const [raw] = parseSheetRows(cp1255Csv())
    expect(normalizeCSVRow(raw)).toEqual({
      name: HEB_NAME,
      phone_number: '050-7802400',
      department: HEB_DEPT,
    })
  })
})
