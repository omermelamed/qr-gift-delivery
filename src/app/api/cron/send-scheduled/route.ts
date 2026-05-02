import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()

  const { data: dueCampaigns } = await service
    .from('campaigns')
    .select('id, company_id')
    .lte('scheduled_at', new Date().toISOString())
    .is('sent_at', null)
    .is('closed_at', null)

  if (!dueCampaigns || dueCampaigns.length === 0) {
    return NextResponse.json({ triggered: 0 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const results = await Promise.allSettled(
    dueCampaigns.map((campaign) =>
      fetch(`${appUrl}/api/campaigns/${campaign.id}/send`, {
        method: 'POST',
        headers: {
          'x-cron-secret': process.env.CRON_SECRET ?? '',
          'x-company-id': campaign.company_id,
        },
      })
    )
  )

  const triggered = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.filter((r) => r.status === 'rejected').length
  console.log(`[cron/send-scheduled] triggered=${triggered} failed=${failed}`)

  return NextResponse.json({ triggered, failed })
}
