const E164_RE = /^\+[1-9]\d{6,13}$/
const IL_LOCAL_RE = /^0(\d{9})$/

export function normalizePhone(raw: string): string | null {
  const digits = (raw ?? '').replace(/[\s\-./()–]/g, '')
  if (E164_RE.test(digits)) return digits
  const local = IL_LOCAL_RE.exec(digits)
  if (local) return `+972${local[1]}`
  return null
}
