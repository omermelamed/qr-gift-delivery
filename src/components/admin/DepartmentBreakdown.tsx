import { createServiceClient } from '@/lib/supabase/server'

type Props = { campaignId: string }

export async function DepartmentBreakdown({ campaignId }: Props) {
  const service = createServiceClient()

  const { data: tokens } = await service
    .from('gift_tokens')
    .select('department, redeemed')
    .eq('campaign_id', campaignId)

  if (!tokens || tokens.length === 0) return null

  // Group by department
  const map = new Map<string, { total: number; claimed: number }>()
  for (const t of tokens) {
    const key = t.department ?? '(No department)'
    if (!map.has(key)) map.set(key, { total: 0, claimed: 0 })
    const s = map.get(key)!
    s.total++
    if (t.redeemed) s.claimed++
  }

  // Only render if there's more than one department (otherwise breakdown adds no value)
  if (map.size <= 1) return null

  const rows = [...map.entries()]
    .map(([dept, s]) => ({ dept, ...s, pct: Math.round((s.claimed / s.total) * 100) }))
    .sort((a, b) => b.total - a.total)

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h2 className="font-semibold text-zinc-900 mb-4">By Department</h2>
      <div className="flex flex-col gap-3">
        {rows.map(({ dept, claimed, total, pct }) => (
          <div key={dept}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-zinc-700 font-medium truncate">{dept}</span>
              <span className="text-zinc-400 text-xs flex-shrink-0 ml-2">{claimed}/{total} · {pct}%</span>
            </div>
            <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: 'var(--brand, #6366f1)' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
