import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockTokenSelectSingle = vi.fn()
const mockDistributorSelect = vi.fn()
const mockUpdateSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'campaign_distributors') {
        return { select: () => ({ eq: mockDistributorSelect }) }
      }
      // gift_tokens
      return {
        select: () => ({ eq: () => ({ single: mockTokenSelectSingle }) }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({ single: mockUpdateSingle }),
            }),
          }),
        }),
      }
    },
  }),
}))

function makeRequest(token: string, distributorId: string | null = null) {
  return new NextRequest(`http://localhost/api/verify/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ distributorId }),
  })
}

const openToken = {
  id: 't-1',
  employee_name: 'Omer',
  redeemed: false,
  campaign_id: 'c-1',
  campaigns: { closed_at: null },
}

describe('POST /api/verify/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: no distributor restrictions
    mockDistributorSelect.mockResolvedValue({ data: [], error: null })
  })

  it('returns invalid when token does not exist', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: null, error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('nonexistent'), { params: Promise.resolve({ token: 'nonexistent' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('invalid')
  })

  it('returns campaign_closed when campaign is closed', async () => {
    mockTokenSelectSingle.mockResolvedValue({
      data: { ...openToken, campaigns: { closed_at: '2026-04-10' } },
      error: null,
    })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('some-token'), { params: Promise.resolve({ token: 'some-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('campaign_closed')
  })

  it('returns not_authorized when distributor not in assignment list', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: openToken, error: null })
    mockDistributorSelect.mockResolvedValue({ data: [{ user_id: 'other-scanner' }], error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('some-token', 'wrong-scanner'), { params: Promise.resolve({ token: 'some-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('not_authorized')
  })

  it('allows scan when distributor is in assignment list', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: openToken, error: null })
    mockDistributorSelect.mockResolvedValue({ data: [{ user_id: 'authorized-scanner' }], error: null })
    mockUpdateSingle.mockResolvedValue({ data: { employee_name: 'Omer' }, error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('some-token', 'authorized-scanner'), { params: Promise.resolve({ token: 'some-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.employeeName).toBe('Omer')
  })

  it('allows any scanner when campaign_distributors is empty (backwards compat)', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: openToken, error: null })
    mockDistributorSelect.mockResolvedValue({ data: [], error: null })
    mockUpdateSingle.mockResolvedValue({ data: { employee_name: 'Omer' }, error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('some-token', 'any-scanner'), { params: Promise.resolve({ token: 'some-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(true)
  })

  it('returns already_used when token is already redeemed', async () => {
    mockTokenSelectSingle.mockResolvedValue({
      data: { ...openToken, redeemed: true, employee_name: 'Dana' },
      error: null,
    })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('used-token'), { params: Promise.resolve({ token: 'used-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('already_used')
    expect(body.employeeName).toBe('Dana')
  })

  it('returns valid:true on successful first scan', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: openToken, error: null })
    mockUpdateSingle.mockResolvedValue({ data: { employee_name: 'Omer' }, error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('valid-token'), { params: Promise.resolve({ token: 'valid-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.employeeName).toBe('Omer')
  })

  it('returns campaign_closed even when token is already redeemed', async () => {
    mockTokenSelectSingle.mockResolvedValue({
      data: { ...openToken, redeemed: true, campaigns: { closed_at: '2026-04-10' } },
      error: null,
    })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('used-and-closed'), { params: Promise.resolve({ token: 'used-and-closed' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('campaign_closed')
  })

  it('returns already_used when race condition prevents atomic update', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: openToken, error: null })
    mockDistributorSelect.mockResolvedValue({ data: [], error: null })
    mockUpdateSingle.mockResolvedValue({ data: null, error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('race-token'), { params: Promise.resolve({ token: 'race-token' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('already_used')
    expect(body.employeeName).toBe('Omer')
  })
})
