import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({ from: mockFromService }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['users:manage']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/settings', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'admin-1',
          app_metadata: { company_id: 'co-1', role_id: 'role-1', role_name: 'company_admin' },
        },
      },
    })
  })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { PATCH } = await import('@/app/api/settings/route')
    const res = await PATCH(makeRequest({}))
    expect(res.status).toBe(401)
  })

  it('returns 401 when app_metadata missing company_id', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u-1', app_metadata: { role_id: 'r-1' } } },
    })
    const { PATCH } = await import('@/app/api/settings/route')
    const res = await PATCH(makeRequest({ name: 'Acme' }))
    expect(res.status).toBe(401)
  })

  it('returns 403 when role lacks users:manage', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)
    const { PATCH } = await import('@/app/api/settings/route')
    const res = await PATCH(makeRequest({ name: 'Acme' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when name is empty', async () => {
    const { PATCH } = await import('@/app/api/settings/route')
    const res = await PATCH(makeRequest({ name: '  ' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when sms_template missing {link}', async () => {
    const { PATCH } = await import('@/app/api/settings/route')
    const res = await PATCH(makeRequest({ name: 'Acme', sms_template: 'Hi {name}, your gift is ready!' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/\{link\}/)
  })

  it('saves valid settings and returns 200', async () => {
    let updated: unknown = null
    mockFromService.mockReturnValue({
      update: (data: unknown) => {
        updated = data
        return { eq: () => Promise.resolve({ error: null }) }
      },
    })
    const { PATCH } = await import('@/app/api/settings/route')
    const res = await PATCH(makeRequest({
      name: 'Acme Corp',
      logo_url: 'https://storage.example.com/logo.png',
      sms_template: 'Hi {name}! Scan: {link}',
    }))
    expect(res.status).toBe(200)
    expect((updated as { name: string }).name).toBe('Acme Corp')
    expect((updated as { sms_template: string }).sms_template).toBe('Hi {name}! Scan: {link}')
  })

  it('saves with null logo_url when not provided', async () => {
    let updated: unknown = null
    mockFromService.mockReturnValue({
      update: (data: unknown) => { updated = data; return { eq: () => Promise.resolve({ error: null }) } },
    })
    const { PATCH } = await import('@/app/api/settings/route')
    await PATCH(makeRequest({ name: 'Acme' }))
    expect((updated as { logo_url: null }).logo_url).toBeNull()
  })
})
