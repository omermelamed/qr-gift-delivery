import { describe, it, expect } from 'vitest'
import { encodeToken, decodeToken } from '@/lib/short-token'

const UUID = '550e8400-e29b-41d4-a716-446655440000'

describe('short-token', () => {
  it('encodes a UUID to a 22-char URL-safe base64 string', () => {
    const code = encodeToken(UUID)
    expect(code).toHaveLength(22)
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  it('round-trips: decode(encode(uuid)) === uuid', () => {
    expect(decodeToken(encodeToken(UUID))).toBe(UUID)
  })

  it('decodes a full UUID unchanged (backward compat for links already sent)', () => {
    expect(decodeToken(UUID)).toBe(UUID)
    expect(decodeToken(UUID.toUpperCase())).toBe(UUID)
  })

  it('returns null for malformed input', () => {
    expect(decodeToken('not-a-token')).toBeNull()
    expect(decodeToken('')).toBeNull()
    // 21 chars — wrong length for an encoded UUID
    expect(decodeToken('A'.repeat(21))).toBeNull()
  })

  it('encoded form is shorter than the raw UUID', () => {
    expect(encodeToken(UUID).length).toBeLessThan(UUID.length)
  })
})
