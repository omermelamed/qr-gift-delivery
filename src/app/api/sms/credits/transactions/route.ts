import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)
  if (!hasPermission(permissions, 'credits:read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '50')

  const service = createServiceClient()
  const { data } = await service
    .from('credit_transactions')
    .select('id, amount, type, description, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 100))

  return NextResponse.json({ transactions: data ?? [] })
}
