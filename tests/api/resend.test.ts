import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()
const mockSendGiftMMS = vi.fn().mockResolvedValue({ sid: 'mock' })

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({ from: mockFromService }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['campaigns:launch']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/twilio', () => ({ sendGiftMMS: mockSendGiftMMS }))

function makeRequest(id: string) {
  return new NextRequest(`http://localhost/api/campaigns/${id}/resend`, { method: 'POST' })
}

describe('POST /api/campaigns/[id]/resend', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    vi.stubEnv('TWILIO_MOCK', 'true')
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockSendGiftMMS.mockResolvedValue({ sid: 'mock' })
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
    const { POST } = await import('@/app/api/campaigns/[id]/resend/route')
    const res = await POST(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    expect(res.status).toBe(401)
  })

  it('returns 404 when campaign not in company', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'not found' } }) }) }) }),
    })
    const { POST } = await import('@/app/api/campaigns/[id]/resend/route')
    const res = await POST(makeRequest('bad'), { params: Promise.resolve({ id: 'bad' }) })
    expect(res.status).toBe(404)
  })

  it('returns dispatched=0 when no unclaimed tokens', async () => {
    let callCount = 0
    mockFromService.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', name: 'Test' }, error: null }) }) }) }),
        }
      }
      return {
        select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
      }
    })
    const { POST } = await import('@/app/api/campaigns/[id]/resend/route')
    const res = await POST(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.dispatched).toBe(0)
  })

  it('dispatches to unclaimed tokens in mock mode and does not call sendGiftMMS', async () => {
    let callCount = 0
    mockFromService.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: 'c-1', name: 'Passover 2026' }, error: null }) }) }) }),
        }
      }
      if (callCount === 2) {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({
                data: [{ id: 't-1', token: 'uuid-1', employee_name: 'Omer', phone_number: '+972501234567', qr_image_url: 'https://example.com/qr.png' }],
                error: null,
              }),
            }),
          }),
        }
      }
      return { update: () => ({ eq: () => Promise.resolve({ error: null }) }) }
    })

    const { POST } = await import('@/app/api/campaigns/[id]/resend/route')
    const res = await POST(makeRequest('c-1'), { params: Promise.resolve({ id: 'c-1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.dispatched).toBe(1)
    expect(body.failed).toBe(0)
    expect(mockSendGiftMMS).not.toHaveBeenCalled()
  })
})
