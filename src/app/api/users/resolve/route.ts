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
  if (!hasPermission(permissions, 'campaigns:launch')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((id: unknown) => typeof id === 'string') : []

  if (ids.length === 0) return NextResponse.json({ users: [] })

  const service = createServiceClient()
  const users = await Promise.all(
    ids.map(async (id) => {
      const { data: { user: u } } = await service.auth.admin.getUserById(id)
      return {
        id,
        name: u?.user_metadata?.full_name ?? u?.email?.split('@')[0] ?? id,
      }
    })
  )

  return NextResponse.json({ users })
}
