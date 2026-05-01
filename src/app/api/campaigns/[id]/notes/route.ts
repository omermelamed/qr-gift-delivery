import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

async function getAuthorizedUser(campaignId: string, companyId: string) {
  const service = createServiceClient()
  const { data: campaign } = await service
    .from('campaigns')
    .select('id')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()
  return campaign
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
  const campaign = await getAuthorizedUser(campaignId, appMeta.company_id)
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const service = createServiceClient()
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
  const campaign = await getAuthorizedUser(campaignId, appMeta.company_id)
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const text: string = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'Note body is required' }, { status: 400 })

  const authorName: string =
    user.user_metadata?.full_name ??
    user.email?.split('@')[0] ??
    'Unknown'

  const service = createServiceClient()
  const { data: note, error } = await service
    .from('campaign_notes')
    .insert({ campaign_id: campaignId, author_id: user.id, author_name: authorName, body: text })
    .select('id, author_id, author_name, body, created_at, updated_at')
    .single()

  if (error || !note) return NextResponse.json({ error: 'Failed to add note' }, { status: 500 })

  return NextResponse.json({ note }, { status: 201 })
}
