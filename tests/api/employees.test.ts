import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({ from: mockFromService }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['campaigns:create']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

function makeRequest(id: string, body: object) {
  return new NextRequest(`http://localhost/api/campaigns/${id}/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/campaigns/[id]/employees', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          app_metadata: { company_id: 'co-1', role_id: 'role-1', role_name: 'company_admin' },
        },
      },
    })
  })

  afterEach(() => { vi.unstubAllEnvs() })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('@/app/api/campaigns/[id]/employees/route')
    const res = await POST(makeRequest('c-1', {}), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign not found', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/employees/route')
    const res = await POST(makeRequest('bad', { name: 'A', phone_number: '+972501234567' }), { params: Promise.resolve({ id: 'bad' }) })
    expect(res.status).toBe(404)
  })

  it('returns 409 when campaign already sent', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: '2026-04-01' }, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/employees/route')
    const res = await POST(makeRequest('c-1', { name: 'A', phone_number: '+972501234567' }), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(409)
  })

  it('returns 400 when name missing', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null }, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/employees/route')
    const res = await POST(makeRequest('c-1', { name: '', phone_number: '+972501234567' }), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/name/i)
  })

  it('returns 400 when phone invalid', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null }, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/employees/route')
    const res = await POST(makeRequest('c-1', { name: 'Omer', phone_number: 'not-a-phone' }), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/phone/i)
  })

  it('inserts single employee and returns token id', async () => {
    let inserted: unknown = null
    let callCount = 0
    mockFromService.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null }, error: null }) }) }) }),
        }
      }
      return {
        insert: (row: unknown) => {
          inserted = row
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'token-1' }, error: null }) }) }
        },
      }
    })

    const { POST } = await import('@/app/api/campaigns/[id]/employees/route')
    const res = await POST(
      makeRequest('c-1', { name: 'Omer', phone_number: '0501234567', department: 'Engineering' }),
      { params: Promise.resolve({ id: 'c-1' }) }
    )

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('token-1')
    expect((inserted as { employee_name: string }).employee_name).toBe('Omer')
    expect((inserted as { phone_number: string }).phone_number).toBe('+972501234567')
    expect((inserted as { department: string }).department).toBe('Engineering')
  })

  it('normalises Israeli local phone to E.164', async () => {
    let inserted: unknown = null
    let callCount = 0
    mockFromService.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null }, error: null }) }) }) }),
        }
      }
      return {
        insert: (row: unknown) => {
          inserted = row
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'token-1' }, error: null }) }) }
        },
      }
    })

    const { POST } = await import('@/app/api/campaigns/[id]/employees/route')
    await POST(makeRequest('c-1', { name: 'Dana', phone_number: '050-123-4567' }), { params: Promise.resolve({ id: 'c-1' }) })
    expect((inserted as { phone_number: string }).phone_number).toBe('+972501234567')
  })
})
