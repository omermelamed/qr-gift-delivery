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
  if (!hasPermission(permissions, 'campaigns:create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { name, campaignDate } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!campaignDate || typeof campaignDate !== 'string') {
    return NextResponse.json({ error: 'campaignDate is required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('campaigns')
    .insert({
      name: name.trim(),
      campaign_date: campaignDate,
      company_id: appMeta.company_id,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id }, { status: 201 })
}
