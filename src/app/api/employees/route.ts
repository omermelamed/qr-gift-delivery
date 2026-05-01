import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'
import type { JwtAppMetadata } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data } = await service
    .from('employees')
    .select('id, employee_name, phone, department')
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
