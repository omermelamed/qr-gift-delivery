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

  const { data: credits } = await service
    .from('credits')
    .select('total_purchased, total_used, balance')
    .eq('company_id', appMeta.company_id)
    .single()

  if (!credits) {
    return NextResponse.json({
      credits: { total_purchased: 0, total_used: 0, balance: 0 },
    })
  }

  return NextResponse.json({ credits })
}
