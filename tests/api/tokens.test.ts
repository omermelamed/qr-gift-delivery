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
  return new NextRequest(`http://localhost/api/campaigns/${id}/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/campaigns/[id]/tokens', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          app_metadata: { company_id: 'company-1', role_id: 'role-1', role_name: 'company_admin' },
        },
      },
    })
  })

  afterEach(() => { vi.unstubAllEnvs() })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { POST } = await import('@/app/api/campaigns/[id]/tokens/route')
    const res = await POST(makeRequest('c-1', { rows: [] }), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign not in company', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'not found' } }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/tokens/route')
    const res = await POST(makeRequest('bad', { rows: [] }), { params: Promise.resolve({ id: 'bad' }) })
    expect(res.status).toBe(404)
  })

  it('returns 409 when campaign already sent', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: '2026-04-01' }, error: null }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/tokens/route')
    const res = await POST(makeRequest('c-1', { rows: [] }), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(409)
  })

  it('inserts valid rows, skips invalid rows', async () => {
    let callCount = 0
    mockFromService.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // campaign lookup
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null }, error: null }) }) }) }),
        }
      }
      // delete unsent + insert
      return {
        delete: () => ({ eq: () => ({ is: () => Promise.resolve({ error: null }) }) }),
        insert: () => Promise.resolve({ error: null }),
      }
    })

    const { POST } = await import('@/app/api/campaigns/[id]/tokens/route')
    const res = await POST(
      makeRequest('c-1', {
        rows: [
          { name: 'Omer', phone_number: '0501234567' },           // valid — Israeli local
          { name: 'Dana', phone_number: '+14155552671' },          // valid — E.164
          { name: '', phone_number: '0501234567' },                // invalid — missing name
          { name: 'Bad', phone_number: 'not-a-phone' },           // invalid — bad phone
        ],
      }),
      { params: Promise.resolve({ id: 'c-1' }) }
    )

    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.inserted).toBe(2)
    expect(body.skipped).toBe(2)
    expect(body.errors).toHaveLength(2)
  })

  it('normalises Israeli local phone to E.164', async () => {
    let insertedRows: unknown[] = []
    let callCount = 0
    mockFromService.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', sent_at: null }, error: null }) }) }) }),
        }
      }
      return {
        delete: () => ({ eq: () => ({ is: () => Promise.resolve({ error: null }) }) }),
        insert: (rows: unknown[]) => { insertedRows = rows; return Promise.resolve({ error: null }) },
      }
    })

    const { POST } = await import('@/app/api/campaigns/[id]/tokens/route')
    await POST(
      makeRequest('c-1', { rows: [{ name: 'Omer', phone_number: '050-123-4567' }] }),
      { params: Promise.resolve({ id: 'c-1' }) }
    )

    expect(insertedRows).toHaveLength(1)
    expect((insertedRows[0] as { phone_number: string }).phone_number).toBe('+972501234567')
  })
})
