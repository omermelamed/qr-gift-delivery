import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appMeta = user.app_metadata as JwtAppMetadata
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: credits } = await service
    .from('credits')
    .select('total_purchased, total_used, balance')
    .eq('company_id', companyId)
    .single()

  if (!credits) {
    return NextResponse.json({
      credits: { total_purchased: 0, total_used: 0, balance: 0 },
    })
  }

  return NextResponse.json({ credits })
}
