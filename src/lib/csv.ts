type EmployeeRow = { name: string; phone_number: string; department?: string }

const NAME_ALIASES = new Set(['name', 'employee_name', 'שם', 'שם עובד', 'שם_עובד'])
const PHONE_ALIASES = new Set(['phone_number', 'phone', 'טלפון', 'מספר טלפון', 'מספר_טלפון', 'נייד'])
const DEPT_ALIASES = new Set(['department', 'מחלקה', 'dept'])

export function normalizeCSVRow(raw: Record<string, unknown>): EmployeeRow {
  let name = ''
  let phone_number = ''
  let department: string | undefined

  for (const [key, value] of Object.entries(raw)) {
    const k = String(key).trim().toLowerCase()
    const v = String(value ?? '').trim()
    if (NAME_ALIASES.has(k)) name = v
    else if (PHONE_ALIASES.has(k)) phone_number = v
    else if (DEPT_ALIASES.has(k)) department = v || undefined
  }

  return { name, phone_number, department }
}
