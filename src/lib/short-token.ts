// Gift links carry a UUID v4 token. Written as hex-with-dashes it's 36 chars;
// the same 128 bits re-encoded as URL-safe base64 is 22 chars. This is a pure
// representation change — the underlying token (and its entropy) is unchanged,
// so it stays compatible with the unguessable-UUID security model. No storage
// change: encode when building the SMS link, decode at the gift page.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function hexToUuid(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Encode a UUID v4 string into a 22-char URL-safe base64 token. */
export function encodeToken(uuid: string): string {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex').toString('base64url')
}

/**
 * Decode a gift-link token back to its canonical UUID.
 * Accepts both the short base64url form and a full UUID (so links already sent
 * with the raw UUID keep working). Returns null if the input isn't a valid token.
 */
export function decodeToken(code: string): string | null {
  if (UUID_RE.test(code)) return code.toLowerCase()

  if (!/^[A-Za-z0-9_-]{22}$/.test(code)) return null

  const buf = Buffer.from(code, 'base64url')
  if (buf.length !== 16) return null

  const uuid = hexToUuid(buf.toString('hex'))
  return UUID_RE.test(uuid) ? uuid : null
}
