import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

const ALLOWED_ROLES = ['company_admin', 'campaign_manager', 'scanner'] as const
type AllowedRole = (typeof ALLOWED_ROLES)[number]

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id || !appMeta?.role_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'users:manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const email: string = ((body.email as string) ?? '').trim()
  const roleName: string = (body.role_name as string) ?? ''

  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  if (!ALLOWED_ROLES.includes(roleName as AllowedRole)) {
    return NextResponse.json(
      { error: `role_name must be one of: ${ALLOWED_ROLES.join(', ')}` },
      { status: 400 }
    )
  }

  const service = createServiceClient()

  const { data: role } = await service
    .from('roles')
    .select('id')
    .eq('name', roleName)
    .eq('is_system', true)
    .single()

  if (!role) return NextResponse.json({ error: 'Role not found' }, { status: 500 })

  const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/admin`,
  })
  if (inviteError || !invited?.user) {
    return NextResponse.json({ error: inviteError?.message ?? 'Invite failed' }, { status: 500 })
  }

  const newUserId = invited.user.id

  await service.auth.admin.updateUserById(newUserId, {
    app_metadata: { company_id: appMeta.company_id, role_id: role.id, role_name: roleName },
  })

  await service.from('user_company_roles').insert({
    user_id: newUserId,
    company_id: appMeta.company_id,
    role_id: role.id,
  })

  return NextResponse.json({ success: true })
}
