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

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/campaigns', () => {
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
    const { POST } = await import('@/app/api/campaigns/route')
    const res = await POST(makeRequest({ name: 'Test', campaignDate: '2026-04-30' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when missing permission', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)
    const { POST } = await import('@/app/api/campaigns/route')
    const res = await POST(makeRequest({ name: 'Test', campaignDate: '2026-04-30' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('@/app/api/campaigns/route')
    const res = await POST(makeRequest({ campaignDate: '2026-04-30' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('name') })
  })

  it('returns 400 when campaignDate is missing', async () => {
    const { POST } = await import('@/app/api/campaigns/route')
    const res = await POST(makeRequest({ name: 'Passover 2026' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringContaining('campaignDate') })
  })

  it('creates campaign and returns id', async () => {
    mockFromService.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: () => Promise.resolve({ data: { id: 'campaign-new' }, error: null }),
        }),
      }),
    })
    const { POST } = await import('@/app/api/campaigns/route')
    const res = await POST(makeRequest({ name: 'Passover 2026', campaignDate: '2026-04-30' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'campaign-new' })
  })
})
