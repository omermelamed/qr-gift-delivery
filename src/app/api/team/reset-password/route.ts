import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createClient as createAnonClient } from '@supabase/supabase-js'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)
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
  const inCompanyViaMeta = targetMeta?.company_id === companyId
  const { data: ucrRow } = await service
    .from('user_company_roles')
    .select('user_id')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!inCompanyViaMeta && !ucrRow) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (!target.email) {
    return NextResponse.json({ error: 'User has no email address' }, { status: 422 })
  }

  // resetPasswordForEmail actually delivers the recovery email via Supabase's
  // email provider (generateLink only mints a link without sending it) (L1).
  const anon = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { error: resetError } = await anon.auth.resetPasswordForEmail(target.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  })

  if (resetError) {
    return NextResponse.json({ error: resetError.message ?? 'Failed to send reset email' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
