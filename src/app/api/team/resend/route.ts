import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

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

  const body = await request.json().catch(() => ({}))
  const userId: string | undefined = body.userId
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const service = createServiceClient()
  const {
    data: { user: targetUser },
    error,
  } = await service.auth.admin.getUserById(userId)
  if (error || !targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const targetMeta = targetUser.app_metadata as { company_id?: string } | undefined
  if (targetMeta?.company_id !== appMeta.company_id) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (!targetUser.email) {
    return NextResponse.json({ error: 'User has no email address' }, { status: 422 })
  }
  await service.auth.admin.inviteUserByEmail(targetUser.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/admin`,
  })

  return NextResponse.json({ success: true })
}
