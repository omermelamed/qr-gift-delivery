type EmployeeRow = { name: string; phone_number: string; department?: string }

const NAME_ALIASES = new Set(['name', 'employee_name', 'שם', 'שם עובד', 'שם_עובד'])
const PHONE_ALIASES = new Set(['phone_number', 'phone', 'טלפון', 'מספר טלפון', 'מספר_טלפון', 'נייד'])
const DEPT_ALIASES = new Set(['department', 'מחלקה', 'dept'])

export function normalizeCSVRow(raw: Record<string, string>): EmployeeRow {
  let name = ''
  let phone_number = ''
  let department: string | undefined

  for (const [key, value] of Object.entries(raw)) {
    const k = key.trim().toLowerCase()
    if (NAME_ALIASES.has(k)) name = (value ?? '').trim()
    else if (PHONE_ALIASES.has(k)) phone_number = (value ?? '').trim()
    else if (DEPT_ALIASES.has(k)) department = (value ?? '').trim() || undefined
  }

  return { name, phone_number, department }
}
