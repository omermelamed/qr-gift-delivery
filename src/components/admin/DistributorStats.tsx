import { createServiceClient } from '@/lib/supabase/server'
import { DistributorStatsView } from './DistributorStatsView'

type Props = { campaignId: string; total: number }

export async function DistributorStats({ campaignId, total }: Props) {
  const service = createServiceClient()

  const { data: tokens } = await service
    .from('gift_tokens')
    .select('redeemed_by')
    .eq('campaign_id', campaignId)
    .eq('redeemed', true)
    .not('redeemed_by', 'is', null)

  if (!tokens || tokens.length === 0) return null

  const countMap = new Map<string, number>()
  for (const t of tokens) {
    countMap.set(t.redeemed_by, (countMap.get(t.redeemed_by) ?? 0) + 1)
  }

  if (countMap.size === 0) return null

  let rows: { userId: string; name: string; count: number }[]
  try {
    rows = await Promise.all(
      [...countMap.entries()].map(async ([userId, count]) => {
        const result = await service.auth.admin.getUserById(userId)
        const u = result.data?.user
        const name = u?.user_metadata?.full_name ?? u?.email?.split('@')[0] ?? userId
        return { userId, name, count }
      })
    )
  } catch {
    return null
  }

  rows.sort((a, b) => b.count - a.count)

  return <DistributorStatsView rows={rows} total={total} />
}
