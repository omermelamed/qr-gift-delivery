import { read, utils } from 'xlsx'

type EmployeeRow = { name: string; phone_number: string; department?: string }

// A real .xlsx file is a ZIP archive — it starts with the "PK\x03\x04" magic.
function looksLikeXlsx(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

// Decode raw CSV bytes to text. file.text() always assumes UTF-8, which mangles
// Hebrew CSVs saved by Excel on Windows (Windows-1255). Detect the encoding:
// strip a UTF-8 BOM, try strict UTF-8, and fall back to Windows-1255 — the
// codepage Excel uses for "Save as CSV" on a Hebrew system.
function decodeCsvBytes(bytes: Uint8Array): string {
  let b = bytes
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b)
  } catch {
    return new TextDecoder('windows-1255').decode(b)
  }
}

// Parse an uploaded .csv/.xlsx file (read as bytes) into raw sheet rows,
// preserving non-ASCII text regardless of the source encoding.
export function parseSheetRows(bytes: Uint8Array): Record<string, unknown>[] {
  if (bytes.length === 0) return []
  const wb = looksLikeXlsx(bytes)
    ? read(bytes, { type: 'array' })
    : read(decodeCsvBytes(bytes), { type: 'string' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return []
  return utils.sheet_to_json(sheet, { defval: '' })
}

const NAME_ALIASES = new Set(['name', 'employee_name', 'שם', 'שם עובד', 'שם_עובד'])
const PHONE_ALIASES = new Set(['phone_number', 'phone', 'טלפון', 'מספר טלפון', 'מספר_טלפון', 'נייד'])
const DEPT_ALIASES = new Set(['department', 'מחלקה', 'dept'])

export function normalizeCSVRow(raw: Record<string, unknown>): EmployeeRow {
  let name = ''
  let phone_number = ''
  let department: string | undefined

  for (const [key, value] of Object.entries(raw)) {
    const k = String(key).replace(/﻿/g, '').trim().toLowerCase()
    const v = String(value ?? '').trim()
    if (NAME_ALIASES.has(k)) name = v
    else if (PHONE_ALIASES.has(k)) phone_number = v
    else if (DEPT_ALIASES.has(k)) department = v || undefined
  }

  // Fallback: if no alias matched, try positional (first=name, second=phone, third=dept)
  if (!name && !phone_number) {
    const values = Object.values(raw).map((v) => String(v ?? '').trim())
    if (values.length >= 2) {
      name = values[0]
      phone_number = values[1]
      department = values[2] || undefined
    }
  }

  return { name, phone_number, department }
}
