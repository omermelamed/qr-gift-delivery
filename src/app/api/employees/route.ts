import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'
import type { JwtAppMetadata } from '@/types'

async function syncTeamMembers(companyId: string, service: ReturnType<typeof import('@/lib/supabase/server').createServiceClient>) {
  // Find all users belonging to this company (via UCR or app_metadata)
  const [{ data: ucr }, { data: { users: allUsers } }] = await Promise.all([
    service.from('user_company_roles').select('user_id').eq('company_id', companyId),
    service.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const ucrIds = new Set((ucr ?? []).map((r) => r.user_id))
  const companyUsers = allUsers.filter((u) => {
    const meta = u.app_metadata as JwtAppMetadata | undefined
    return ucrIds.has(u.id) || meta?.company_id === companyId
  })

  if (companyUsers.length === 0) return

  // Find which user IDs already have an employee record
  const { data: existing } = await service
    .from('employees')
    .select('user_id')
    .eq('company_id', companyId)
    .not('user_id', 'is', null)

  const syncedIds = new Set((existing ?? []).map((e) => e.user_id))

  const toInsert = companyUsers
    .filter((u) => !syncedIds.has(u.id))
    .map((u) => ({
      company_id: companyId,
      employee_name: u.user_metadata?.full_name ?? u.email?.split('@')[0] ?? 'Unknown',
      phone: null,
      user_id: u.id,
    }))

  if (toInsert.length > 0) {
    await service.from('employees').insert(toInsert)
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Sync any team members not yet in the directory
  await syncTeamMembers(appMeta.company_id, service)

  const { data } = await service
    .from('employees')
    .select('id, employee_name, phone, department, user_id')
    .eq('company_id', appMeta.company_id)
    .order('employee_name')

  return NextResponse.json({ employees: data ?? [] })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { employee_name, phone: rawPhone, department } = body

  if (!employee_name?.trim()) return NextResponse.json({ error: 'employee_name required' }, { status: 400 })
  const phone = normalizePhone(rawPhone ?? '')
  if (!phone) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })

  const service = createServiceClient()
  const { data, error } = await service
    .from('employees')
    .insert({ company_id: appMeta.company_id, employee_name: employee_name.trim(), phone, department: department?.trim() || null })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'An employee with this phone number already exists' }, { status: 409 })
    return NextResponse.json({ error: 'Failed to add employee' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id })
}
