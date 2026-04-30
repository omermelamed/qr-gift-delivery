import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockSelectSingle = vi.fn()   // for the initial token+campaign lookup
const mockUpdateSingle = vi.fn()   // for the atomic UPDATE

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: mockSelectSingle }),
      }),
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: () => ({ single: mockUpdateSingle }),
          }),
        }),
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

  it('returns invalid when token does not exist', async () => {
    mockSelectSingle.mockResolvedValue({ data: null, error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('nonexistent'), { params: Promise.resolve({ token: 'nonexistent' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('invalid')
  })

  it('returns campaign_closed when campaign is closed', async () => {
    mockSelectSingle.mockResolvedValue({
      data: { id: 't-1', employee_name: 'Omer', redeemed: false, campaign_id: 'c-1', campaigns: { closed_at: '2026-04-10' } },
      error: null,
    })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('some-token'), { params: Promise.resolve({ token: 'some-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('campaign_closed')
  })

  it('returns already_used when token is already redeemed', async () => {
    mockSelectSingle.mockResolvedValue({
      data: { id: 't-1', employee_name: 'Dana', redeemed: true, campaign_id: 'c-1', campaigns: { closed_at: null } },
      error: null,
    })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('used-token'), { params: Promise.resolve({ token: 'used-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('already_used')
    expect(body.employeeName).toBe('Dana')
  })

  it('returns valid:true and employee name on successful scan', async () => {
    mockSelectSingle.mockResolvedValue({
      data: { id: 't-1', employee_name: 'Omer', redeemed: false, campaign_id: 'c-1', campaigns: { closed_at: null } },
      error: null,
    })
    mockUpdateSingle.mockResolvedValue({ data: { employee_name: 'Omer' }, error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('valid-token'), { params: Promise.resolve({ token: 'valid-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.employeeName).toBe('Omer')
  })

  it('returns already_used when race condition prevents update', async () => {
    mockSelectSingle.mockResolvedValue({
      data: { id: 't-1', employee_name: 'Omer', redeemed: false, campaign_id: 'c-1', campaigns: { closed_at: null } },
      error: null,
    })
    mockUpdateSingle.mockResolvedValue({ data: null, error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('race-token'), { params: Promise.resolve({ token: 'race-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('already_used')
  })
})
