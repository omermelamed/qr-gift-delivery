import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'
import type { JwtAppMetadata } from '@/types'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, string | null> = {}
  if (body.employee_name !== undefined) updates.employee_name = body.employee_name?.trim() || null
  if (body.phone !== undefined) {
    const phone = normalizePhone(body.phone ?? '')
    if (!phone) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    updates.phone = phone
  }
  if (body.department !== undefined) updates.department = body.department?.trim() || null

  const service = createServiceClient()
  const { data, error } = await service
    .from('employees')
    .update(updates)
    .eq('id', id)
    .eq('company_id', appMeta.company_id)
    .select('id')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  return NextResponse.json({ id: data.id })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  await service
    .from('employees')
    .delete()
    .eq('id', id)
    .eq('company_id', appMeta.company_id)

  return NextResponse.json({ success: true })
}
