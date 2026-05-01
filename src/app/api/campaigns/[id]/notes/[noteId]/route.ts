import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { id: campaignId, noteId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const service = createServiceClient()

  const { data: note } = await service
    .from('campaign_notes')
    .select('id, author_id, campaign_id, campaigns(company_id)')
    .eq('id', noteId)
    .single()

  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const campaign = note.campaigns as unknown as { company_id: string } | null
  if (campaign?.company_id !== appMeta.company_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (note.author_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (note.campaign_id !== campaignId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const text: string = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'Note body is required' }, { status: 400 })

  const { data: updated, error } = await service
    .from('campaign_notes')
    .update({ body: text, updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .select('id, author_id, author_name, body, created_at, updated_at')
    .single()

  if (error || !updated) return NextResponse.json({ error: 'Failed to update note' }, { status: 500 })

  return NextResponse.json({ note: updated })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { id: campaignId, noteId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const service = createServiceClient()

  const { data: note } = await service
    .from('campaign_notes')
    .select('id, author_id, campaign_id, campaigns(company_id)')
    .eq('id', noteId)
    .single()

  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const campaign = note.campaigns as unknown as { company_id: string } | null
  if (campaign?.company_id !== appMeta.company_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (note.author_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (note.campaign_id !== campaignId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await service.from('campaign_notes').delete().eq('id', noteId)

  return new NextResponse(null, { status: 204 })
}
