import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  if (!appMeta?.company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: ucr } = await service
    .from('user_company_roles')
    .select('user_id, roles(name)')
    .eq('company_id', appMeta.company_id)

  const scannerUserIds = (ucr ?? [])
    .filter((row) => {
      const role = row.roles as { name: string } | null
      return role?.name === 'scanner'
    })
    .map((row) => row.user_id)

  const scanners = await Promise.all(
    scannerUserIds.map(async (userId) => {
      const { data: { user: u } } = await service.auth.admin.getUserById(userId)
      return {
        id: userId,
        name: u?.user_metadata?.full_name ?? u?.email?.split('@')[0] ?? userId,
        email: u?.email ?? '',
      }
    })
  )

  return NextResponse.json({ scanners })
}
