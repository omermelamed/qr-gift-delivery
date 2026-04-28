import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({ from: mockFromService }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['reports:export']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

function makeRequest(id: string) {
  return new NextRequest(`http://localhost/api/campaigns/${id}/export`, { method: 'GET' })
}

describe('GET /api/campaigns/[id]/export', () => {
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
    const { GET } = await import('@/app/api/campaigns/[id]/export/route')
    const res = await GET(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign not found', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'not found' } }) }) }) }),
    })
    const { GET } = await import('@/app/api/campaigns/[id]/export/route')
    const res = await GET(makeRequest('bad'), { params: Promise.resolve({ id: 'bad' }) })
    expect(res.status).toBe(404)
  })

  it('returns CSV with correct headers and rows', async () => {
    let callCount = 0
    mockFromService.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1' }, error: null }) }) }) }),
        }
      }
      return {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({
              data: [
                { employee_name: 'Omer', phone_number: '+972501234567', department: 'Engineering', sms_sent_at: '2026-04-01T10:00:00Z', redeemed: true, redeemed_at: '2026-04-01T12:00:00Z', redeemed_by: 'dist-1' },
              ],
              error: null,
            }),
          }),
        }),
      }
    })

    const { GET } = await import('@/app/api/campaigns/[id]/export/route')
    const res = await GET(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
    const text = await res.text()
    expect(text).toContain('name,phone_number,department')
    expect(text).toContain('Omer')
    expect(text).toContain('+972501234567')
  })
})
