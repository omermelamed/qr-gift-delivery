import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { makeServiceFrom } from '../helpers/supabase-mock'

const mockGetUser = vi.fn()
const mockFromService = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser } }),
  createServiceClient: () => ({ from: mockFromService }),
}))

vi.mock('@/lib/permissions', () => ({
  fetchPermissions: vi.fn().mockResolvedValue(['campaigns:launch']),
  hasPermission: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }))

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/campaigns/c-1/reminder-template', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const params = { params: Promise.resolve({ id: 'c-1' }) }

describe('PATCH /api/campaigns/[id]/reminder-template', () => {
  beforeEach(async () => {
    vi.resetAllMocks()
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(true)
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', app_metadata: { company_id: 'company-1', role_id: 'role-1', role_name: 'company_admin' } } },
    })
  })

  it('returns 401 when no session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const { PATCH } = await import('@/app/api/campaigns/[id]/reminder-template/route')
    const res = await PATCH(makeRequest({ reminderSmsTemplate: 'Hi {link}' }), params)
    expect(res.status).toBe(401)
  })

  it('returns 403 when missing permission', async () => {
    const { hasPermission } = await import('@/lib/permissions')
    vi.mocked(hasPermission).mockReturnValue(false)
    const { PATCH } = await import('@/app/api/campaigns/[id]/reminder-template/route')
    const res = await PATCH(makeRequest({ reminderSmsTemplate: 'Hi {link}' }), params)
    expect(res.status).toBe(403)
  })

  it('returns 400 when reminderSmsTemplate is missing from the body', async () => {
    const { PATCH } = await import('@/app/api/campaigns/[id]/reminder-template/route')
    const res = await PATCH(makeRequest({}), params)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('reminderSmsTemplate is required')
  })

  it('returns 400 invalid_template when {name} is missing', async () => {
    mockFromService.mockImplementation(makeServiceFrom({
      campaigns: { data: { id: 'c-1' }, error: null },
    }))
    const { PATCH } = await import('@/app/api/campaigns/[id]/reminder-template/route')
    const res = await PATCH(makeRequest({ reminderSmsTemplate: 'Reminder text with {link} but no name placeholder' }), params)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_template')
  })

  it('persists a valid reminder template containing both {name} and {link}', async () => {
    const from = makeServiceFrom({ campaigns: { data: { id: 'c-1' }, error: null } })
    mockFromService.mockImplementation(from)
    const { PATCH } = await import('@/app/api/campaigns/[id]/reminder-template/route')
    const res = await PATCH(makeRequest({ reminderSmsTemplate: 'Reminder for {name}: {link}' }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(from.builders.campaigns.update).toHaveBeenCalledWith({ reminder_sms_template: 'Reminder for {name}: {link}' })
  })

  it('persists a valid reminder template containing {name} without {link}', async () => {
    const from = makeServiceFrom({ campaigns: { data: { id: 'c-1' }, error: null } })
    mockFromService.mockImplementation(from)
    const { PATCH } = await import('@/app/api/campaigns/[id]/reminder-template/route')
    const res = await PATCH(makeRequest({ reminderSmsTemplate: 'Hi {name}, this is your reminder!' }), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(from.builders.campaigns.update).toHaveBeenCalledWith({ reminder_sms_template: 'Hi {name}, this is your reminder!' })
  })

  it('clears the reminder template when given null', async () => {
    const from = makeServiceFrom({ campaigns: { data: { id: 'c-1' }, error: null } })
    mockFromService.mockImplementation(from)
    const { PATCH } = await import('@/app/api/campaigns/[id]/reminder-template/route')
    const res = await PATCH(makeRequest({ reminderSmsTemplate: null }), params)
    expect(res.status).toBe(200)
    expect(from.builders.campaigns.update).toHaveBeenCalledWith({ reminder_sms_template: null })
  })

  it('returns 404 when the campaign is not found', async () => {
    mockFromService.mockImplementation(makeServiceFrom({
      campaigns: { data: null, error: null },
    }))
    const { PATCH } = await import('@/app/api/campaigns/[id]/reminder-template/route')
    const res = await PATCH(makeRequest({ reminderSmsTemplate: 'Hi {name}' }), params)
    expect(res.status).toBe(404)
  })

  it('succeeds even when the campaign has already been sent (no sent_at gate)', async () => {
    const from = makeServiceFrom({ campaigns: { data: { id: 'c-1' }, error: null } })
    mockFromService.mockImplementation(from)
    const { PATCH } = await import('@/app/api/campaigns/[id]/reminder-template/route')
    const res = await PATCH(makeRequest({ reminderSmsTemplate: 'Hi {name}' }), params)
    expect(res.status).toBe(200)
  })
})
