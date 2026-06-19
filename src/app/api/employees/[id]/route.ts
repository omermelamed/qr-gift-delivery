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
  if (body.employee_name !== undefined) {
    const trimmed = body.employee_name?.trim()
    if (!trimmed) return NextResponse.json({ error: 'employee_name cannot be empty' }, { status: 400 })
    updates.employee_name = trimmed
  }
  if (body.phone !== undefined) {
    if (!body.phone) {
      updates.phone = null  // allow clearing phone
    } else {
      const phone = normalizePhone(body.phone)
      if (!phone) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
      updates.phone = phone
    }
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

  const { data: emp } = await service
    .from('employees')
    .select('employee_name, phone, company_id')
    .eq('id', id)
    .single()

  if (emp) {
    // Sync name back to auth user if this employee is linked to a team member
    if (updates.employee_name) {
      const { data: linked } = await service
        .from('employees')
        .select('user_id')
        .eq('id', id)
        .single()

      if (linked?.user_id) {
        const { data: { user: targetUser } } = await service.auth.admin.getUserById(linked.user_id)
        if (targetUser) {
          await service.auth.admin.updateUserById(linked.user_id, {
            user_metadata: { ...(targetUser.user_metadata ?? {}), full_name: updates.employee_name },
          })
        }
      }
    }

    const tokenUpdates: Record<string, string | null> = {}
    if (updates.employee_name) tokenUpdates.employee_name = updates.employee_name
    if (updates.phone !== undefined) tokenUpdates.phone_number = updates.phone
    if (updates.department !== undefined) tokenUpdates.department = updates.department

    if (Object.keys(tokenUpdates).length > 0) {
      const { data: campaignIds } = await service
        .from('campaigns')
        .select('id')
        .eq('company_id', emp.company_id)

      if (campaignIds && campaignIds.length > 0) {
        let query = service
          .from('gift_tokens')
          .update(tokenUpdates)
          .in('campaign_id', campaignIds.map((c) => c.id))
          .eq('employee_name', emp.employee_name)

        if (emp.phone) {
          query = query.eq('phone_number', emp.phone)
        }

        await query
      }
    }
  }

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

  // Team-synced employees (user_id set) must be removed via Team page
  const { data: emp } = await service
    .from('employees')
    .select('user_id')
    .eq('id', id)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  if (emp.user_id) return NextResponse.json({ error: 'Team members can only be removed from the Team page' }, { status: 422 })

  await service
    .from('employees')
    .delete()
    .eq('id', id)
    .eq('company_id', appMeta.company_id)

  return NextResponse.json({ success: true })
}
