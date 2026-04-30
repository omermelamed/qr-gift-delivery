import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sourceCampaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'campaigns:create')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { name, campaign_date, copyEmployees } = body
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const service = createServiceClient()

  const { data: source } = await service
    .from('campaigns')
    .select('id')
    .eq('id', sourceCampaignId)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!source) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const { data: newCampaign } = await service
    .from('campaigns')
    .insert({ name: name.trim(), campaign_date: campaign_date ?? null, company_id: appMeta.company_id })
    .select('id')
    .single()

  if (!newCampaign) return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 })

  if (copyEmployees) {
    const { data: tokens } = await service
      .from('gift_tokens')
      .select('employee_name, phone_number, department')
      .eq('campaign_id', sourceCampaignId)

    if (tokens && tokens.length > 0) {
      const { error: tokenInsertError } = await service.from('gift_tokens').insert(
        tokens.map((t) => ({
          campaign_id: newCampaign.id,
          employee_name: t.employee_name,
          phone_number: t.phone_number,
          department: t.department,
        }))
      )
      if (tokenInsertError) {
        return NextResponse.json({ error: 'Failed to copy employees' }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ id: newCampaign.id })
}
