import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Two mock functions for the two Supabase query shapes used by the verify route.
// mockUpdateSingle: used by the atomic UPDATE chain
// mockSelectSingle: used by the fallback SELECT chain
const mockUpdateSingle = vi.fn()
const mockSelectSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({ single: mockUpdateSingle }),
          }),
        }),
      }),
      select: () => ({
        eq: () => ({ single: mockSelectSingle }),
      }),
    }),
  }),
}))

function makeRequest(token: string, distributorId: string | null = null) {
  return new NextRequest(`http://localhost/api/verify/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ distributorId }),
  })
}

describe('POST /api/verify/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns valid:true and employee name on first successful scan', async () => {
    mockUpdateSingle.mockResolvedValue({ data: { employee_name: 'Omer Melamed' }, error: null })

    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(
      makeRequest('valid-token-uuid'),
      { params: Promise.resolve({ token: 'valid-token-uuid' }) }
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.valid).toBe(true)
    expect(body.employeeName).toBe('Omer Melamed')
  })

  it('returns already_used when token was already redeemed', async () => {
    // UPDATE returns null (no unredeemed row matched)
    mockUpdateSingle.mockResolvedValue({ data: null, error: { message: 'no row' } })
    // SELECT finds the token (it exists but redeemed=true)
    mockSelectSingle.mockResolvedValue({
      data: { employee_name: 'Dana Cohen', redeemed: true },
      error: null,
    })

    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(
      makeRequest('used-token-uuid'),
      { params: Promise.resolve({ token: 'used-token-uuid' }) }
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('already_used')
    expect(body.employeeName).toBe('Dana Cohen')
  })

  it('returns invalid when token does not exist in DB', async () => {
    mockUpdateSingle.mockResolvedValue({ data: null, error: { message: 'no row' } })
    mockSelectSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(
      makeRequest('nonexistent-token'),
      { params: Promise.resolve({ token: 'nonexistent-token' }) }
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('invalid')
  })
})
