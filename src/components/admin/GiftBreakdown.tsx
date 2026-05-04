import type { GiftOption } from '@/types'

const GIFT_COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#14b8a6', '#f43f5e', '#f97316']

type TokenSlice = { redeemed: boolean; gift_id: string | null }

type Props = {
  gifts: GiftOption[]
  tokens: TokenSlice[]
}

export function GiftBreakdown({ gifts, tokens }: Props) {
  if (gifts.length < 2) return null

  const redeemed = tokens.filter((t) => t.redeemed)
  if (redeemed.length === 0) return null

  const counts = new Map<string, number>()
  let uncategorised = 0

  for (const t of redeemed) {
    if (t.gift_id) {
      counts.set(t.gift_id, (counts.get(t.gift_id) ?? 0) + 1)
    } else {
      uncategorised++
    }
  }

  const total = redeemed.length

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h2 className="font-semibold text-zinc-900 mb-3">Gift Breakdown</h2>
      <div className="flex flex-col gap-2">
        {gifts.map((g, i) => {
          const count = counts.get(g.id) ?? 0
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <div key={g.id} className="flex items-center gap-3">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: GIFT_COLORS[i % GIFT_COLORS.length] }}
              />
              <span className="flex-1 text-sm text-zinc-700 truncate">{g.name}</span>
              <span className="text-sm font-medium text-zinc-900 tabular-nums">{count}</span>
              <span className="text-xs text-zinc-400 w-10 text-right tabular-nums">{pct}%</span>
            </div>
          )
        })}
        {uncategorised > 0 && (
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-300 flex-shrink-0" />
            <span className="flex-1 text-sm text-zinc-400">No gift recorded</span>
            <span className="text-sm font-medium text-zinc-400 tabular-nums">{uncategorised}</span>
            <span className="text-xs text-zinc-300 w-10 text-right tabular-nums">
              {Math.round((uncategorised / total) * 100)}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
