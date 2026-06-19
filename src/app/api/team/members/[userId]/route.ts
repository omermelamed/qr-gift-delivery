import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { normalizePhone } from '@/lib/phone'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'

const ALLOWED_ROLES = ['company_admin', 'campaign_manager', 'scanner'] as const
type AllowedRole = typeof ALLOWED_ROLES[number]

async function getCallerAndPermissions() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const appMeta = user.app_metadata as JwtAppMetadata
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) return null
  const permissions = await fetchPermissions(appMeta?.role_id, appMeta?.role_name)
  if (!hasPermission(permissions, 'users:manage')) return null
  return { user, appMeta, companyId }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const caller = await getCallerAndPermissions()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { user, appMeta, companyId } = caller

  const service = createServiceClient()

  // Verify target belongs to the same company
  const { data: { user: target } } = await service.auth.admin.getUserById(userId)
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const targetMeta = target.app_metadata as JwtAppMetadata | undefined
  const inCompanyViaUcr = await service
    .from('user_company_roles')
    .select('user_id')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle()
  const inCompanyViaMeta = targetMeta?.company_id === companyId
  if (!inCompanyViaUcr.data && !inCompanyViaMeta) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}

  // Name
  if (typeof body.name === 'string' && body.name.trim()) {
    updates.user_metadata = { ...(target.user_metadata ?? {}), full_name: body.name.trim() }
  }

  // Email
  if (typeof body.email === 'string' && body.email.trim() && body.email !== target.email) {
    updates.email = body.email.trim().toLowerCase()
  }

  // Status (active/deactivated) — cannot deactivate yourself
  if (typeof body.active === 'boolean' && userId !== user.id) {
    updates.ban_duration = body.active ? 'none' : '87600h'
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await service.auth.admin.updateUserById(userId, updates as Parameters<typeof service.auth.admin.updateUserById>[1])
    if (error) return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }

  // Role — cannot change your own role
  if (typeof body.role_name === 'string' && userId !== user.id) {
    const roleName = body.role_name as AllowedRole
    if (!ALLOWED_ROLES.includes(roleName)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    const { data: roleRow } = await service
      .from('roles')
      .select('id')
      .eq('name', roleName)
      .maybeSingle()

    if (!roleRow) return NextResponse.json({ error: 'Role not found' }, { status: 400 })

    // Upsert user_company_roles
    await service.from('user_company_roles').upsert(
      { user_id: userId, company_id: companyId, role_id: roleRow.id },
      { onConflict: 'user_id,company_id' }
    )

    // Update app_metadata
    await service.auth.admin.updateUserById(userId, {
      app_metadata: { company_id: companyId, role_id: roleRow.id, role_name: roleName },
    })
  }

  // Sync name and phone to linked employee record
  const employeeUpdates: Record<string, unknown> = {}

  if (typeof body.name === 'string' && body.name.trim()) {
    employeeUpdates.employee_name = body.name.trim()
  }

  if (typeof body.phone === 'string') {
    const phone = body.phone.trim() ? normalizePhone(body.phone) : null
    if (body.phone.trim() && !phone) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }
    employeeUpdates.phone = phone
  }

  if (Object.keys(employeeUpdates).length > 0) {
    // Get current employee data BEFORE updating (needed for gift_tokens matching)
    const { data: emp } = await service
      .from('employees')
      .select('id, employee_name, phone')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .maybeSingle()

    await service
      .from('employees')
      .update(employeeUpdates)
      .eq('user_id', userId)
      .eq('company_id', companyId)

    // Propagate to gift_tokens so campaign pages reflect the change
    if (emp) {
      const tokenUpdates: Record<string, string | null> = {}
      if (employeeUpdates.employee_name) tokenUpdates.employee_name = employeeUpdates.employee_name as string
      if (employeeUpdates.phone !== undefined) tokenUpdates.phone_number = employeeUpdates.phone as string | null

      if (Object.keys(tokenUpdates).length > 0) {
        const { data: campaignIds } = await service
          .from('campaigns')
          .select('id')
          .eq('company_id', companyId)

        if (campaignIds && campaignIds.length > 0) {
          const cids = campaignIds.map((c) => c.id)

          // Strategy 1: match by employee_id FK (reliable)
          await service
            .from('gift_tokens')
            .update(tokenUpdates)
            .in('campaign_id', cids)
            .eq('employee_id', emp.id)

          // Strategy 2: match by old name for tokens without employee_id
          let fallback = service
            .from('gift_tokens')
            .update({ ...tokenUpdates, employee_id: emp.id })
            .in('campaign_id', cids)
            .eq('employee_name', emp.employee_name)
            .is('employee_id', null)

          if (emp.phone) {
            fallback = fallback.eq('phone_number', emp.phone)
          }

          await fallback
        }
      }
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const caller = await getCallerAndPermissions()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { user, appMeta, companyId } = caller

  if (userId === user.id) {
    return NextResponse.json({ error: 'You cannot remove yourself' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const keepEmployee: boolean = body.keepEmployee === true

  const service = createServiceClient()

  const { data: deletedRows, error: deleteError } = await service
    .from('user_company_roles')
    .delete()
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .select()

  if (deleteError) return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })

  // If no UCR row existed, verify the user belongs to this company via app_metadata
  // (some admins are provisioned with app_metadata only, no UCR row)
  if (!deletedRows || deletedRows.length === 0) {
    const { data: { user: target } } = await service.auth.admin.getUserById(userId)
    const targetMeta = target?.app_metadata as JwtAppMetadata | undefined
    if (!target || targetMeta?.company_id !== companyId) {
      return NextResponse.json({ error: 'Member not found in your company' }, { status: 404 })
    }
  }

  const { error: metaError } = await service.auth.admin.updateUserById(userId, {
    app_metadata: { company_id: null, role_id: null, role_name: null },
  })
  if (metaError) console.error('[team/remove] failed to clear app_metadata:', metaError.message)

  if (keepEmployee) {
    // Unlink user_id so the employee record stays but is no longer team-managed
    await service
      .from('employees')
      .update({ user_id: null })
      .eq('user_id', userId)
      .eq('company_id', companyId)
  } else {
    // Delete the employee record entirely
    await service
      .from('employees')
      .delete()
      .eq('user_id', userId)
      .eq('company_id', companyId)
  }

  return NextResponse.json({ success: true })
}
