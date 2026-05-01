import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({ from: mockFromService }),
}))

function adminUser(companyId = 'co-1') {
  return {
    data: {
      user: {
        id: 'admin-1',
        app_metadata: { company_id: companyId, role_id: 'role-1', role_name: 'company_admin' },
      },
    },
  }
}

describe('GET /api/employees', () => {
  beforeEach(() => { vi.resetAllMocks(); mockGetUser.mockResolvedValue(adminUser()) })

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { GET } = await import('@/app/api/employees/route')
    const res = await GET(new NextRequest('http://localhost/api/employees'))
    expect(res.status).toBe(401)
  })

  it('returns employees for company', async () => {
    mockFromService.mockReturnValue({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [{ id: 'e-1', employee_name: 'Alice', phone: '+1234', department: 'Eng' }], error: null }) }) }),
    })
    const { GET } = await import('@/app/api/employees/route')
    const res = await GET(new NextRequest('http://localhost/api/employees'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.employees).toHaveLength(1)
    expect(body.employees[0].employee_name).toBe('Alice')
  })
})

describe('POST /api/employees', () => {
  beforeEach(() => { vi.resetAllMocks(); mockGetUser.mockResolvedValue(adminUser()) })

  it('inserts a new employee and returns id', async () => {
    let inserted: unknown = null
    mockFromService.mockReturnValue({
      insert: (row: unknown) => ({
        select: () => ({ single: () => { inserted = row; return Promise.resolve({ data: { id: 'e-new' }, error: null }) } }),
      }),
    })
    const { POST } = await import('@/app/api/employees/route')
    const req = new NextRequest('http://localhost/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_name: 'Bob', phone: '+15550001111', department: 'HR' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.id).toBe('e-new')
    expect(inserted).toMatchObject({ company_id: 'co-1', employee_name: 'Bob' })
  })

  it('returns 400 when employee_name missing', async () => {
    const { POST } = await import('@/app/api/employees/route')
    const req = new NextRequest('http://localhost/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '+15550001111' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 409 on duplicate phone', async () => {
    mockFromService.mockReturnValue({
      insert: () => ({
        select: () => ({ single: () => Promise.resolve({ data: null, error: { code: '23505', message: 'unique' } }) }),
      }),
    })
    const { POST } = await import('@/app/api/employees/route')
    const req = new NextRequest('http://localhost/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_name: 'Bob', phone: '+15550001111' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(409)
  })
})

describe('POST /api/employees/import', () => {
  beforeEach(() => { vi.resetAllMocks(); mockGetUser.mockResolvedValue(adminUser()) })

  it('upserts rows and returns upserted count', async () => {
    mockFromService.mockReturnValue({
      upsert: () => ({ select: () => Promise.resolve({ data: [{ id: 'e-1' }, { id: 'e-2' }], error: null }) }),
    })
    const { POST } = await import('@/app/api/employees/import/route')
    const req = new NextRequest('http://localhost/api/employees/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [{ employee_name: 'Alice', phone: '+111' }, { employee_name: 'Bob', phone: '+222' }] }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.upserted).toBe(2)
  })

  it('returns 400 when rows is empty', async () => {
    const { POST } = await import('@/app/api/employees/import/route')
    const req = new NextRequest('http://localhost/api/employees/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/employees/[id]', () => {
  beforeEach(() => { vi.resetAllMocks(); mockGetUser.mockResolvedValue(adminUser()) })

  it('updates employee fields', async () => {
    let updatedWith: unknown = null
    mockFromService.mockReturnValue({
      update: (fields: unknown) => ({
        eq: () => ({ eq: () => ({ select: () => ({ single: () => { updatedWith = fields; return Promise.resolve({ data: { id: 'e-1' }, error: null }) } }) }) }),
      }),
    })
    const { PATCH } = await import('@/app/api/employees/[id]/route')
    const req = new NextRequest('http://localhost/api/employees/e-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_name: 'Alice Updated' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'e-1' }) })
    expect(res.status).toBe(200)
    expect(updatedWith).toMatchObject({ employee_name: 'Alice Updated' })
  })

  it('returns 404 when employee not found for company', async () => {
    mockFromService.mockReturnValue({
      update: () => ({
        eq: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
      }),
    })
    const { PATCH } = await import('@/app/api/employees/[id]/route')
    const req = new NextRequest('http://localhost/api/employees/bad', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_name: 'X' }),
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'bad' }) })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/employees/[id]', () => {
  beforeEach(() => { vi.resetAllMocks(); mockGetUser.mockResolvedValue(adminUser()) })

  it('deletes the employee', async () => {
    let deleted = false
    mockFromService.mockReturnValue({
      delete: () => ({ eq: () => ({ eq: () => { deleted = true; return Promise.resolve({ error: null }) } }) }),
    })
    const { DELETE } = await import('@/app/api/employees/[id]/route')
    const req = new NextRequest('http://localhost/api/employees/e-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'e-1' }) })
    expect(res.status).toBe(200)
    expect(deleted).toBe(true)
  })
})
