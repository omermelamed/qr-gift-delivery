import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizePhone } from '@/lib/phone'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)
  if (!hasPermission(permissions, 'campaigns:create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

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

  // Fetch OLD employee data BEFORE update — needed for matching gift_tokens
  const { data: oldEmp } = await service
    .from('employees')
    .select('id, employee_name, phone, company_id, user_id')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()

  if (!oldEmp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })

  const { error } = await service
    .from('employees')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)

  if (error) return NextResponse.json({ error: 'Failed to update employee' }, { status: 500 })

  // Sync name back to auth user if this employee is linked to a team member
  if (updates.employee_name && oldEmp.user_id) {
    const { data: { user: targetUser } } = await service.auth.admin.getUserById(oldEmp.user_id)
    if (targetUser) {
      await service.auth.admin.updateUserById(oldEmp.user_id, {
        user_metadata: { ...(targetUser.user_metadata ?? {}), full_name: updates.employee_name },
      })
    }
  }

  // Sync changes to gift_tokens — match by OLD name/phone, then update
  const tokenUpdates: Record<string, string | null> = {}
  if (updates.employee_name) tokenUpdates.employee_name = updates.employee_name
  if (updates.phone !== undefined) tokenUpdates.phone_number = updates.phone
  if (updates.department !== undefined) tokenUpdates.department = updates.department

  if (Object.keys(tokenUpdates).length > 0) {
    const { data: campaignIds } = await service
      .from('campaigns')
      .select('id')
      .eq('company_id', oldEmp.company_id)

    if (campaignIds && campaignIds.length > 0) {
      const cids = campaignIds.map((c) => c.id)

      // Strategy 1: match by employee_id FK (reliable)
      await service
        .from('gift_tokens')
        .update(tokenUpdates)
        .in('campaign_id', cids)
        .eq('employee_id', oldEmp.id)

      // Strategy 2: match by old name (for tokens without employee_id)
      let fallback = service
        .from('gift_tokens')
        .update({ ...tokenUpdates, employee_id: oldEmp.id })
        .in('campaign_id', cids)
        .eq('employee_name', oldEmp.employee_name)
        .is('employee_id', null)

      if (oldEmp.phone) {
        fallback = fallback.eq('phone_number', oldEmp.phone)
      }

      await fallback
    }
  }

  return NextResponse.json({ id: oldEmp.id })
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
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)
  if (!hasPermission(permissions, 'campaigns:create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  // Team-synced employees (user_id set) must be removed via Team page
  const { data: emp } = await service
    .from('employees')
    .select('user_id')
    .eq('id', id)
    .eq('company_id', companyId)
    .single()

  if (!emp) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
  if (emp.user_id) return NextResponse.json({ error: 'Team members can only be removed from the Team page' }, { status: 422 })

  await service
    .from('employees')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)

  return NextResponse.json({ success: true })
}
