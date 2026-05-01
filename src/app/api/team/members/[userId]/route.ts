import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

const ALLOWED_ROLES = ['company_admin', 'campaign_manager', 'scanner'] as const
type AllowedRole = typeof ALLOWED_ROLES[number]

async function getCallerAndPermissions(request?: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id || !appMeta?.role_id) return null
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'users:manage')) return null
  return { user, appMeta }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const caller = await getCallerAndPermissions()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { user, appMeta } = caller

  const service = createServiceClient()

  // Verify target belongs to the same company
  const { data: { user: target } } = await service.auth.admin.getUserById(userId)
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  const targetMeta = target.app_metadata as JwtAppMetadata | undefined
  const inCompanyViaUcr = await service
    .from('user_company_roles')
    .select('user_id')
    .eq('user_id', userId)
    .eq('company_id', appMeta.company_id)
    .maybeSingle()
  const inCompanyViaMeta = targetMeta?.company_id === appMeta.company_id
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
      { user_id: userId, company_id: appMeta.company_id, role_id: roleRow.id },
      { onConflict: 'user_id,company_id' }
    )

    // Update app_metadata
    await service.auth.admin.updateUserById(userId, {
      app_metadata: { company_id: appMeta.company_id, role_id: roleRow.id, role_name: roleName },
    })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  const caller = await getCallerAndPermissions()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { user, appMeta } = caller

  if (userId === user.id) {
    return NextResponse.json({ error: 'You cannot remove yourself' }, { status: 400 })
  }

  const service = createServiceClient()

  const { error: deleteError } = await service
    .from('user_company_roles')
    .delete()
    .eq('user_id', userId)
    .eq('company_id', appMeta.company_id)

  if (deleteError) return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })

  const { error: metaError } = await service.auth.admin.updateUserById(userId, { app_metadata: {} })
  if (metaError) console.error('[team/remove] failed to clear app_metadata:', metaError.message)

  return NextResponse.json({ success: true })
}
