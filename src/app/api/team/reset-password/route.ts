import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'users:manage')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const userId: string | undefined = body.userId
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  const service = createServiceClient()
  const { data: { user: target }, error } = await service.auth.admin.getUserById(userId)
  if (error || !target) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const targetMeta = target.app_metadata as JwtAppMetadata | undefined
  const inCompanyViaMeta = targetMeta?.company_id === appMeta.company_id
  const { data: ucrRow } = await service
    .from('user_company_roles')
    .select('user_id')
    .eq('user_id', userId)
    .eq('company_id', appMeta.company_id)
    .maybeSingle()

  if (!inCompanyViaMeta && !ucrRow) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (!target.email) {
    return NextResponse.json({ error: 'User has no email address' }, { status: 422 })
  }

  const { error: linkError } = await service.auth.admin.generateLink({
    type: 'recovery',
    email: target.email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/admin` },
  })

  if (linkError) {
    return NextResponse.json({ error: linkError.message ?? 'Failed to send reset email' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
