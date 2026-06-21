import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockTokenSelectSingle = vi.fn()
const mockDistributorSelect = vi.fn()
const mockGiftsOrder = vi.fn()
const mockUpdateSingle = vi.fn()
const mockRoleMaybeSingle = vi.fn()

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'campaign_distributors') {
        return { select: () => ({ eq: mockDistributorSelect }) }
      }
      if (table === 'campaign_gifts') {
        return { select: () => ({ eq: () => ({ order: mockGiftsOrder }) }) }
      }
      if (table === 'user_company_roles') {
        return { select: () => ({ eq: () => ({ eq: () => ({ in: () => ({ maybeSingle: mockRoleMaybeSingle }) }) }) }) }
      }
      // gift_tokens
      return {
        select: () => ({ eq: () => ({ single: mockTokenSelectSingle }) }),
        update: () => ({
          eq: () => ({ eq: () => ({ select: () => ({ single: mockUpdateSingle }) }) }),
        }),
      }
    },
  }),
}))

function makeRequest(token: string, body: Record<string, unknown> = {}) {
  return new NextRequest(`http://localhost/api/verify/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const openToken = {
  id: 't-1',
  employee_name: 'Omer',
  redeemed: false,
  campaign_id: 'c-1',
  gift_id: null,
  campaigns: { closed_at: null, company_id: 'co-1', name: 'Hanukkah' },
}

describe('POST /api/verify/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'dist-1', app_metadata: { role_name: 'company_admin' } } } })
    mockDistributorSelect.mockResolvedValue({ data: [], error: null })
    mockGiftsOrder.mockResolvedValue({ data: [], error: null })
    mockRoleMaybeSingle.mockResolvedValue({ data: null })
  })

  it('not_authorized when no authenticated user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('not_authorized')
  })

  it('invalid when token does not exist', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('x'), { params: Promise.resolve({ token: 'x' }) })
    const body = await res.json()
    expect(body.reason).toBe('invalid')
  })

  it('campaign_closed when campaign is closed', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: { ...openToken, campaigns: { ...openToken.campaigns, closed_at: '2026-04-10' } } })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.reason).toBe('campaign_closed')
  })

  it('already_used when token already redeemed', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: { ...openToken, redeemed: true, employee_name: 'Dana' } })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.reason).toBe('already_used')
    expect(body.employeeName).toBe('Dana')
  })

  it('needsGiftSelection when 2+ gifts and none chosen', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: openToken })
    mockGiftsOrder.mockResolvedValue({ data: [
      { id: 'g-1', name: 'Headphones', position: 0 },
      { id: 'g-2', name: 'Mug', position: 1 },
    ], error: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.needsGiftSelection).toBe(true)
    expect(body.gifts).toHaveLength(2)
  })

  it('redeems with stored gift and returns giftName', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: { ...openToken, gift_id: 'g-1' } })
    mockGiftsOrder.mockResolvedValue({ data: [
      { id: 'g-1', name: 'Headphones', position: 0 },
      { id: 'g-2', name: 'Mug', position: 1 },
    ], error: null })
    mockUpdateSingle.mockResolvedValue({ data: { employee_name: 'Omer' } })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.needsGiftSelection).toBeUndefined()
    expect(body.giftName).toBe('Headphones')
  })

  it('auto-stamps the single gift when exactly one option', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: openToken })
    mockGiftsOrder.mockResolvedValue({ data: [{ id: 'g-1', name: 'Mug', position: 0 }], error: null })
    mockUpdateSingle.mockResolvedValue({ data: { employee_name: 'Omer' } })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.giftName).toBe('Mug')
  })

  it('redeems a no-gift campaign with null giftName', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: openToken })
    mockUpdateSingle.mockResolvedValue({ data: { employee_name: 'Omer' } })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.giftName).toBeNull()
  })

  it('already_used on race (atomic update returns no row)', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: openToken })
    mockUpdateSingle.mockResolvedValue({ data: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.reason).toBe('already_used')
  })

  it('scanner fallback: redeems with body giftId when no stored gift_id', async () => {
    mockTokenSelectSingle.mockResolvedValue({ data: openToken })
    mockGiftsOrder.mockResolvedValue({ data: [
      { id: 'g-1', name: 'Headphones', position: 0 },
      { id: 'g-2', name: 'Mug', position: 1 },
    ], error: null })
    mockUpdateSingle.mockResolvedValue({ data: { employee_name: 'Omer' } })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t', { giftId: 'g-2' }), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.needsGiftSelection).toBeUndefined()
    expect(body.giftName).toBe('Mug')
  })

  it('not_authorized when caller not in non-empty assignment list', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'outsider-1', app_metadata: { role_name: 'scanner' } } } })
    mockTokenSelectSingle.mockResolvedValue({ data: openToken })
    mockDistributorSelect.mockResolvedValue({ data: [{ user_id: 'someone-else' }], error: null })
    mockRoleMaybeSingle.mockResolvedValue({ data: null })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('not_authorized')
  })

  it('allows scan when caller IS in the assignment list', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'assigned-1', app_metadata: { role_name: 'scanner' } } } })
    mockTokenSelectSingle.mockResolvedValue({ data: openToken })
    mockDistributorSelect.mockResolvedValue({ data: [{ user_id: 'assigned-1' }], error: null })
    mockUpdateSingle.mockResolvedValue({ data: { employee_name: 'Omer' } })
    const { POST } = await import('@/app/api/verify/[token]/route')
    const res = await POST(makeRequest('t'), { params: Promise.resolve({ token: 't' }) })
    const body = await res.json()
    expect(body.valid).toBe(true)
  })
})
