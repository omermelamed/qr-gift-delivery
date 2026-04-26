import { describe, it, expect, beforeAll } from 'vitest'
import { generateQrBuffer } from '@/lib/qr'

beforeAll(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'
})

describe('generateQrBuffer', () => {
  it('returns a Buffer', async () => {
    const buffer = await generateQrBuffer('550e8400-e29b-41d4-a716-446655440000')
    expect(buffer).toBeInstanceOf(Buffer)
  })

  it('returns a valid PNG (correct magic bytes)', async () => {
    const buffer = await generateQrBuffer('550e8400-e29b-41d4-a716-446655440000')
    expect(buffer[0]).toBe(0x89)
    expect(buffer[1]).toBe(0x50)
    expect(buffer[2]).toBe(0x4e)
    expect(buffer[3]).toBe(0x47)
  })

  it('produces a buffer larger than 1KB', async () => {
    const buffer = await generateQrBuffer('550e8400-e29b-41d4-a716-446655440000')
    expect(buffer.length).toBeGreaterThan(1024)
  })

  it('different tokens produce different buffers', async () => {
    const buf1 = await generateQrBuffer('550e8400-e29b-41d4-a716-446655440000')
    const buf2 = await generateQrBuffer('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    expect(buf1.equals(buf2)).toBe(false)
  })
})
