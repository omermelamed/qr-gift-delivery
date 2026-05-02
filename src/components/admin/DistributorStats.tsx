import { createServiceClient } from '@/lib/supabase/server'

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

  // Count per distributor
  const countMap = new Map<string, number>()
  for (const t of tokens) {
    countMap.set(t.redeemed_by, (countMap.get(t.redeemed_by) ?? 0) + 1)
  }

  if (countMap.size === 0) return null

  // Fetch user display names
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

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h2 className="font-semibold text-zinc-900 mb-4">Distributor Stats</h2>
      <div className="flex flex-col gap-2">
        {rows.map(({ userId, name, count }) => (
          <div key={userId} className="flex items-center justify-between text-sm">
            <span className="text-zinc-700 truncate">{name}</span>
            <span className="text-zinc-500 flex-shrink-0 ml-2">
              {count} gift{count !== 1 ? 's' : ''} · {total > 0 ? Math.round((count / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
