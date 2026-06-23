// tests/api/auth-callback.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockExchange = vi.fn()
const mockGetUser = vi.fn()
const mockSignOut = vi.fn()
const mockDeleteUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: mockExchange,
      getUser: mockGetUser,
      signOut: mockSignOut,
    },
  }),
  createServiceClient: () => ({
    auth: { admin: { deleteUser: mockDeleteUser } },
  }),
}))

function makeRequest(query: string) {
  return new NextRequest(`http://localhost/auth/callback${query}`)
}

describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    mockExchange.mockResolvedValue({ error: null })
    mockSignOut.mockResolvedValue({ error: null })
    mockDeleteUser.mockResolvedValue({ error: null })
  })

  it('redirects to /login?error=oauth_failed when no code', async () => {
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(makeRequest(''))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=oauth_failed')
  })

  it('redirects to /login?error=oauth_failed when exchange fails', async () => {
    mockExchange.mockResolvedValue({ error: { message: 'bad code' } })
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(makeRequest('?code=abc'))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=oauth_failed')
  })

  it('routes an invited company_admin to /admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', app_metadata: { company_id: 'co-1', role_name: 'company_admin' } } },
    })
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(makeRequest('?code=abc'))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost:3000/admin')
    expect(mockDeleteUser).not.toHaveBeenCalled()
  })

  it('routes an invited scanner to /scan/campaigns', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-2', app_metadata: { company_id: 'co-1', role_name: 'scanner' } } },
    })
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(makeRequest('?code=abc'))
    expect(res.headers.get('location')).toBe('http://localhost:3000/scan/campaigns')
  })

  it('honors a safe relative next param', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-3', app_metadata: { company_id: 'co-1', role_name: 'company_admin' } } },
    })
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(makeRequest('?code=abc&next=%2Fadmin%2Fcampaigns'))
    expect(res.headers.get('location')).toBe('http://localhost:3000/admin/campaigns')
  })

  it('ignores an open-redirect next param', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-4', app_metadata: { company_id: 'co-1', role_name: 'company_admin' } } },
    })
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(makeRequest('?code=abc&next=%2F%2Fevil.com'))
    expect(res.headers.get('location')).toBe('http://localhost:3000/admin')
  })

  it('rejects and deletes an uninvited orphan user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'orphan-1', app_metadata: {} } },
    })
    const { GET } = await import('@/app/auth/callback/route')
    const res = await GET(makeRequest('?code=abc'))
    expect(mockDeleteUser).toHaveBeenCalledWith('orphan-1')
    expect(mockSignOut).toHaveBeenCalled()
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('http://localhost:3000/login?error=not_invited')
  })
})
