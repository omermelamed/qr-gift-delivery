import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockTokenSingle = vi.fn()
const mockGiftSingle = vi.fn()
const mockLockSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'campaign_gifts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ single: mockGiftSingle }),
              single: mockGiftSingle,
            }),
          }),
        }
      }
      // gift_tokens
      return {
        select: () => ({ eq: () => ({ single: mockTokenSingle }) }),
        update: () => ({
          eq: () => ({
            is: () => ({
              eq: () => ({ select: () => ({ single: mockLockSingle }) }),
            }),
          }),
        }),
      }
    },
  }),
}))

function makeRequest(token: string, giftId: unknown) {
  return new NextRequest(`http://localhost/api/gift/${token}/choose`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ giftId }),
  })
}

describe('POST /api/gift/[token]/choose', () => {
  beforeEach(() => vi.clearAllMocks())

  it('400 when giftId missing', async () => {
    const { POST } = await import('@/app/api/gift/[token]/choose/route')
    const res = await POST(makeRequest('t', undefined), { params: Promise.resolve({ token: 't' }) })
    expect(res.status).toBe(400)
  })

  it('404 when token does not exist', async () => {
    mockTokenSingle.mockResolvedValue({ data: null })
    const { POST } = await import('@/app/api/gift/[token]/choose/route')
    const res = await POST(makeRequest('t', 'g-1'), { params: Promise.resolve({ token: 't' }) })
    expect(res.status).toBe(404)
  })

  it('400 when gift does not belong to campaign', async () => {
    mockTokenSingle.mockResolvedValue({ data: { campaign_id: 'c-1', gift_id: null, redeemed: false } })
    mockGiftSingle.mockResolvedValue({ data: null })
    const { POST } = await import('@/app/api/gift/[token]/choose/route')
    const res = await POST(makeRequest('t', 'g-x'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('invalid_gift')
  })

  it('locks the choice on first pick', async () => {
    mockTokenSingle.mockResolvedValue({ data: { campaign_id: 'c-1', gift_id: null, redeemed: false } })
    mockGiftSingle.mockResolvedValue({ data: { id: 'g-1', name: 'Headphones' } })
    mockLockSingle.mockResolvedValue({ data: { gift_id: 'g-1' } })
    const { POST } = await import('@/app/api/gift/[token]/choose/route')
    const res = await POST(makeRequest('t', 'g-1'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.locked).toBe(false)
    expect(body.gift).toEqual({ id: 'g-1', name: 'Headphones' })
  })

  it('returns locked:true when atomic lock loses a race', async () => {
    mockTokenSingle
      .mockResolvedValueOnce({ data: { campaign_id: 'c-1', gift_id: null, redeemed: false } })
      .mockResolvedValueOnce({ data: { gift_id: 'g-9' } })
    // First call: validate the requested gift g-1 (two .eq() path)
    mockGiftSingle.mockResolvedValueOnce({ data: { id: 'g-1', name: 'Headphones' } })
    // Second call: look up the winner's gift g-9 (one .eq() path)
    mockGiftSingle.mockResolvedValueOnce({ data: { id: 'g-9', name: 'Notebook' } })
    mockLockSingle.mockResolvedValue({ data: null })
    const { POST } = await import('@/app/api/gift/[token]/choose/route')
    const res = await POST(makeRequest('t', 'g-1'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.locked).toBe(true)
    expect(body.gift).toEqual({ id: 'g-9', name: 'Notebook' })
  })

  it('returns locked:true with gift:null when redeemed without a choice', async () => {
    mockTokenSingle.mockResolvedValue({ data: { campaign_id: 'c-1', gift_id: null, redeemed: true } })
    const { POST } = await import('@/app/api/gift/[token]/choose/route')
    const res = await POST(makeRequest('t', 'g-1'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.locked).toBe(true)
    expect(body.gift).toBeNull()
  })

  it('returns locked:true when a choice already exists (no change allowed)', async () => {
    mockTokenSingle.mockResolvedValue({ data: { campaign_id: 'c-1', gift_id: 'g-2', redeemed: false } })
    mockGiftSingle.mockResolvedValue({ data: { id: 'g-2', name: 'Mug' } })
    const { POST } = await import('@/app/api/gift/[token]/choose/route')
    const res = await POST(makeRequest('t', 'g-1'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.locked).toBe(true)
    expect(body.gift).toEqual({ id: 'g-2', name: 'Mug' })
  })
})
