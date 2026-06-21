import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'

type Service = ReturnType<typeof createServiceClient>

// Notes are readable/writable by admins & managers (campaigns:read) for any
// company campaign, and by scanners (tokens:scan) only for campaigns they're
// assigned to scan. Returns true when the caller may access this campaign's notes.
async function hasCampaignAccess(
  service: Service,
  campaignId: string,
  companyId: string,
  userId: string,
  permissions: string[]
): Promise<boolean> {
  const { data: campaign } = await service
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()
  if (!campaign) return false

  if (hasPermission(permissions, 'campaigns:read')) return true

  if (hasPermission(permissions, 'tokens:scan')) {
    const { data: assignment } = await service
      .from('campaign_distributors')
      .select('user_id')
      .eq('campaign_id', campaignId)
      .eq('user_id', userId)
      .maybeSingle()
    return !!assignment
  }

  return false
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)

  const service = createServiceClient()
  if (!(await hasCampaignAccess(service, campaignId, companyId, user.id, permissions))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: notes } = await service
    .from('campaign_notes')
    .select('id, author_id, author_name, body, created_at, updated_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true })

  return NextResponse.json({ notes: notes ?? [] })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)

  const service = createServiceClient()
  if (!(await hasCampaignAccess(service, campaignId, companyId, user.id, permissions))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))
  const text: string = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'Note body is required' }, { status: 400 })

  const authorName: string =
    user.user_metadata?.full_name ??
    user.email?.split('@')[0] ??
    'Unknown'

  const { data: note, error } = await service
    .from('campaign_notes')
    .insert({ campaign_id: campaignId, author_id: user.id, author_name: authorName, body: text })
    .select('id, author_id, author_name, body, created_at, updated_at')
    .single()

  if (error || !note) return NextResponse.json({ error: 'Failed to add note' }, { status: 500 })

  return NextResponse.json({ note }, { status: 201 })
}
