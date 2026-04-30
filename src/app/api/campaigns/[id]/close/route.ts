import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const permissions = await fetchPermissions(appMeta.role_id)
  if (!hasPermission(permissions, 'campaigns:launch')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, sent_at, closed_at')
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)
    .single()

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (!campaign.sent_at) return NextResponse.json({ error: 'Campaign not yet sent' }, { status: 409 })
  if (campaign.closed_at) return NextResponse.json({ error: 'Campaign already closed' }, { status: 409 })

  const { error: closeError } = await service
    .from('campaigns')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', campaignId)
    .eq('company_id', appMeta.company_id)

  if (closeError) {
    return NextResponse.json({ error: 'Failed to close campaign' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
